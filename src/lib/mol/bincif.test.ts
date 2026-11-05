import { describe, it, expect } from 'vitest';
import { CIF } from 'molstar/lib/mol-io/reader/cif';
import { cifTextToBinaryCif, isBincifBytes, isCifText } from './bincif';

/**
 * The dialect lock. Real BinaryCIF — RCSB-served or molstar-written — is a
 * msgpack MAP {version, encoder, dataBlocks}, first byte 0x83, not the
 * array+magic framing notes sometimes describe. If this test ever fails on
 * the 0x83 assertion, whoever changed the producer wrote the wrong dialect
 * and every viewer (and the PDB seeder's sniff) will reject the files.
 */

const FIXTURE = `data_TEST
#
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.Cartn_x
_atom_site.occupancy
ATOM 1 N 10.5 1.0
ATOM 2 C 20.25 0.5
ATOM 3 O ? .
#
`;

describe('cifTextToBinaryCif', () => {
	it('produces the msgpack-map dialect real files use', async () => {
		const out = await cifTextToBinaryCif(FIXTURE);
		expect(out).toBeInstanceOf(Uint8Array);
		expect(out[0]).toBe(0x83);
		expect(isBincifBytes(out)).toBe(true);
		expect(isCifText(new TextDecoder().decode(out))).toBe(false);
	});

	it('round-trips every category value through the molstar reader', async () => {
		const out = await cifTextToBinaryCif(FIXTURE);
		const parsed = await CIF.parseBinary(out).run();
		expect(parsed.isError).toBe(false);
		if (parsed.isError) throw new Error(parsed.message);
		const block = parsed.result.blocks[0];
		expect(block.header).toBe('TEST');
		// the binary reader names categories without the leading underscore
		const cat = block.categories['atom_site'];
		expect(cat).toBeDefined();
		expect(cat.rowCount).toBe(3);
		expect(cat.getField('group_PDB')!.str(0)).toBe('ATOM');
		expect(cat.getField('type_symbol')!.str(2)).toBe('O');
		expect(cat.getField('id')!.int(1)).toBe(2);
		expect(cat.getField('Cartn_x')!.float(0)).toBeCloseTo(10.5, 6);
		expect(cat.getField('occupancy')!.float(1)).toBeCloseTo(0.5, 6);
	});

	it('preserves not-present-vs-unknown value kinds through the encoding', async () => {
		const out = await cifTextToBinaryCif(FIXTURE);
		const parsed = await CIF.parseBinary(out).run();
		if (parsed.isError) throw new Error(parsed.message);
		const cat = parsed.result.blocks[0].categories['atom_site'];
		// Column.ValueKinds (mol-data/db column.d.ts): Present=0, NotPresent=1
		// (CIF '.'), Unknown=2 (CIF '?') — the numeric codes survive the round trip
		expect(cat.getField('Cartn_x')!.valueKind(2)).toBe(2); // '?'
		expect(cat.getField('occupancy')!.valueKind(2)).toBe(1); // '.'
		expect(cat.getField('Cartn_x')!.valueKind(0)).toBe(0);
	});

	it('is deterministic — same text, same bytes (digest dedup depends on it)', async () => {
		const a = await cifTextToBinaryCif(FIXTURE);
		const b = await cifTextToBinaryCif(FIXTURE);
		expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
	});
});

describe('sniffs', () => {
	it('isBincifBytes rejects text, empty and non-map starts', () => {
		expect(isBincifBytes(new Uint8Array(0))).toBe(false);
		expect(isBincifBytes(new TextEncoder().encode('data_TEST\nloop_'))).toBe(false);
		// msgpack fixarray header (the wrong-dialect myth): must NOT pass
		const arrayish = new Uint8Array([0x96, 0xc4, 0x04, 0x62, 0x63, 0x69, 0x66]);
		expect(isBincifBytes(arrayish)).toBe(false);
	});

	it('isBincifBytes accepts a hand-built map header with dataBlocks', () => {
		// Uint8Array.from over code points keeps byte values (TextEncoder
		// would UTF-8-encode 0x83 into two bytes and break the sniff)
		const map = Uint8Array.from('\x83\xa7version\xa50.3.0\xa7encoder\xa4RCSB\xaadataBlocks\x90', (ch) => ch.charCodeAt(0));
		expect(map[0]).toBe(0x83);
		expect(isBincifBytes(map)).toBe(true);
	});

	it('isCifText trims before sniffing', () => {
		expect(isCifText('\n  data_1L2Y')).toBe(true);
		expect(isCifText('loop_')).toBe(false);
	});
});
