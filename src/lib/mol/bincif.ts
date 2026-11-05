import { CIF, getCifFieldType, type CifField } from 'molstar/lib/mol-io/reader/cif';
import { CifWriter } from 'molstar/lib/mol-io/writer/cif';
import { classifyFloatArray, classifyIntArray } from 'molstar/lib/mol-io/common/binary-cif';

/**
 * mmCIF text → BinaryCIF, in the browser. SPD stores coordinates as
 * `full_structure_bincif` (compressed msgpack — a fraction of the text size),
 * and the backend never converts (SPD stores, it does not compute): this is
 * the conversion, run client-side before the presigned PUT so the ledger
 * digests the bytes we actually store.
 *
 * The call path is a faithful port of molstar's own converter
 * (node_modules/molstar/lib/cli/cif2bcif/converter.js), so the output is the
 * dialect molstar reads back. Dialect fact worth remembering (measured
 * against RCSB's models.rcsb.org files and molstar 5.12 alike): a real .bcif
 * is a msgpack *map* {version, encoder, dataBlocks}, first byte 0x83 — not
 * the array+magic framing some notes describe. src/lib/mol/bincif.test.ts
 * round-trips text → bytes → parsed and locks that down.
 */

/** msgpack map header + `dataBlocks` within the first 64 bytes */
export function isBincifBytes(u8: Uint8Array): boolean {
	if (!u8 || u8.length < 4) return false;
	const head = u8[0];
	const isMap = (head >= 0x80 && head <= 0x8f) || head === 0xde || head === 0xdf;
	if (!isMap) return false;
	const marker = 'dataBlocks';
	const probe = new TextDecoder('latin1').decode(u8.subarray(0, Math.min(64, u8.length)));
	return probe.includes(marker);
}

export function isCifText(text: string): boolean {
	return text.trimStart().startsWith('data_');
}

type AnyField = CifWriter.Field;

/**
 * `CifWriter.Field.Type` is an ambient const enum (forbidden under
 * verbatimModuleSyntax); the compiled runtime object maps Str=0, Int=1,
 * Float=2 (molstar 5.12 encoder.js). The round-trip test in bincif.test.ts
 * catches any upstream change to that layout.
 */
const FIELD_TYPE_STR = 0 as unknown as CifWriter.Field.Type;

function classifyField(name: string, field: CifField): AnyField {
	const type = getCifFieldType(field);
	if (type['@type'] === 'str') {
		return { name, type: FIELD_TYPE_STR, value: field.str, valueKind: field.valueKind } as AnyField;
	}
	if (type['@type'] === 'float') {
		const encoder = classifyFloatArray(field.toFloatArray({ array: Float64Array }));
		return CifWriter.Field.float(name, field.float, {
			valueKind: field.valueKind,
			encoder,
			typedArray: Float64Array
		}) as AnyField;
	}
	const encoder = classifyIntArray(field.toIntArray({ array: Int32Array }));
	return CifWriter.Field.int(name, field.int, {
		valueKind: field.valueKind,
		encoder,
		typedArray: Int32Array
	}) as AnyField;
}

/** binary:true ⇒ getData is bytes; the union type just does not know that */
export async function cifTextToBinaryCif(text: string): Promise<Uint8Array<ArrayBuffer>> {
	const parsed = await CIF.parseText(text).run();
	if (parsed.isError) throw new Error(`mmCIF parse failed: ${parsed.message}`);
	const encoder = CifWriter.createEncoder({
		binary: true,
		encoderName: 'spd-front',
		binaryAutoClassifyEncoding: true
	});
	for (const block of parsed.result.blocks) {
		encoder.startDataBlock(block.header);
		for (const categoryName of block.categoryNames) {
			const cat = block.categories[categoryName];
			const fields = cat.fieldNames.map((f) => classifyField(f, cat.getField(f)!));
			encoder.writeCategory({
				name: cat.name,
				instance: () => CifWriter.categoryInstance(fields, { data: cat, rowCount: cat.rowCount })
			});
		}
	}
	return encoder.getData() as Uint8Array<ArrayBuffer>;
}
