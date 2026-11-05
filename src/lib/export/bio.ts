/**
 * Sequence export, entirely client-side.
 *
 * SPD already holds the asserted letters and feature rows; exporting is a
 * projection, never a computation. GenBank goes through
 * `@teselagen/bio-parsers` because the flatfile has enough positional and
 * wrapping rules that a hand-rolled writer drifts. FASTA is a two-line format
 * and stays local so the header is stable. SBOL3 is a small JSON-LD
 * projection: no JavaScript SBOL3 writer exists (`sboljs` is SBOL2/RDF), and
 * the record-level Component + Sequence pair is short enough to build here.
 */

export type Molecule = 'dna' | 'rna' | 'protein';

export interface ExportFeature {
	/** GenBank feature key, e.g. `CDS` or `promoter`. */
	type: string;
	/** `/label` value. */
	name: string;
	/** 1-based inclusive, matching SPD region rows. */
	start: number;
	/** 1-based inclusive. */
	end: number;
	strand?: 1 | -1;
}

export interface ExportSequence {
	name: string;
	description?: string;
	sequence: string;
	molecule?: Molecule;
	circular?: boolean;
	features?: ExportFeature[];
}

const SO = 'https://identifiers.org/SO:';
const EDAM_DNA = 'https://identifiers.org/edam:format_1207';
const EDAM_RNA = 'https://identifiers.org/edam:format_1206';

/** Sequence Ontology terms used by the SBOL3 projection. */
export const ENGINEERED_REGION = `${SO}0000804`;
export const GENE = `${SO}0000704`;

/** GenBank feature key for each SPD biobrick part type. */
const PART_FEATURE: Record<string, string> = {
	promoter: 'promoter',
	rbs: 'RBS',
	terminator: 'terminator',
	cds: 'CDS',
	protein_tag: 'tag',
	regulatory: 'regulatory',
	other: 'misc_feature'
};

/** Sequence Ontology term for each SPD biobrick part type. */
const PART_ROLE: Record<string, string> = {
	promoter: `${SO}0000167`,
	rbs: `${SO}0000139`,
	terminator: `${SO}0000141`,
	cds: `${SO}0000316`,
	protein_tag: `${SO}0000327`,
	regulatory: `${SO}0005836`,
	other: `${SO}0000110`
};

/** GenBank feature key for each SPD gene-region vocabulary value. */
const REGION_FEATURE: Record<string, string> = {
	promoter: 'promoter',
	operator: 'operator',
	enhancer: 'enhancer',
	silencer: 'silencer',
	tata_box: 'TATA_signal',
	caat_signal: 'CAAT_signal',
	terminator: 'terminator',
	origin: 'rep_origin',
	exon: 'exon',
	intron: 'intron',
	five_prime_utr: "5'UTR",
	three_prime_utr: "3'UTR",
	cds: 'CDS',
	rnase_site: 'misc_feature',
	other: 'misc_feature'
};

export function partFeatureType(partType: string): string {
	return PART_FEATURE[partType] ?? 'misc_feature';
}

export function partRole(partType: string): string {
	return PART_ROLE[partType] ?? `${SO}0000110`;
}

export function regionFeatureType(regionType: string): string {
	return REGION_FEATURE[regionType] ?? 'misc_feature';
}

/** A filename stem that survives the browser download attribute. */
export function fileStem(name: string, id: string): string {
	const tail = id.includes(':') ? id.split(':').pop() : id;
	const raw = (name || tail || 'spd-record').replace(/[\\/:*?"<>|]+/g, '_').trim();
	return raw || 'spd-record';
}

/** Strip whitespace and non-letters; keep the record's own alphabet intact. */
export function normalizeSequence(raw: string, molecule: Molecule = 'dna'): string {
	const letters = raw.replace(/[^A-Za-z*]/g, '').toUpperCase();
	return molecule === 'protein' ? letters.replace(/[^A-Z*]/g, '') : letters;
}

export function toFasta(seq: ExportSequence): string {
	const letters = normalizeSequence(seq.sequence, seq.molecule ?? 'dna');
	const description = seq.description?.trim();
	const headerName = seq.name.trim().replace(/\s+/g, '_') || 'spd-record';
	const header = [`>${headerName}`, description].filter(Boolean).join(' ');
	const body = letters.match(/.{1,60}/g)?.join('\n') ?? '';
	return `${header}\n${body}\n`;
}

/**
 * GenBank flatfile from the record's own letters and features. The parser is
 * imported on demand: its reader stack is browser-only and irrelevant until a
 * person actually clicks export.
 */
export async function toGenbank(seq: ExportSequence): Promise<string> {
	const { jsonToGenbank } = await import('@teselagen/bio-parsers');
	const molecule = seq.molecule ?? 'dna';
	const isProtein = molecule === 'protein';
	const parsed = {
		name: seq.name,
		description: seq.description ?? '',
		sequence: normalizeSequence(seq.sequence, molecule),
		circular: Boolean(seq.circular),
		features: (seq.features ?? [])
			.filter((f) => Number.isFinite(f.start) && Number.isFinite(f.end) && f.start >= 1)
			.filter((f) => f.end >= f.start)
			.map((f, i) => ({
				id: `feature_${i + 1}`,
				name: f.name,
				type: f.type || 'misc_feature',
				// bio-parsers assumes 0-based inclusive by default.
				start: f.start - 1,
				end: f.end - 1,
				strand: f.strand ?? 1,
				notes: {}
			})),
		primers: [],
		parts: [],
		isProtein,
		...(molecule === 'rna' ? { type: 'RNA', doubleStranded: false } : {})
	};
	const output = jsonToGenbank(parsed, {
		isProtein,
		inclusive1BasedStart: false,
		inclusive1BasedEnd: false
	});
	if (!output) throw new Error('GenBank serialization failed');
	return output;
}

/**
 * SBOL3 JSON-LD projection of one record. Component-level only: the sequence
 * is the asserted letters and the role is the part/gene vocabulary. Feature
 * locations are intentionally not emitted yet; a Range needs a resolvable
 * Sequence reference and this writer does not guess document bases.
 */
export function toSbol3(
	input: ExportSequence & { id: string; role?: string; type?: string }
): string {
	const molecule = input.molecule ?? 'dna';
	const displayId = fileStem(input.name, input.id).replace(/[^A-Za-z0-9_.-]/g, '_');
	const safeDisplayId = /^[A-Za-z_]/.test(displayId) ? displayId : `spd_${displayId}`;
	const sequenceId = `${safeDisplayId}_sequence`;
	const document = {
		'@context': 'https://sbolstandard.org/3/sbol3-context.json',
		type: 'sbol:Component',
		'sbol:displayId': safeDisplayId,
		'sbol:version': '1',
		'sbol:name': input.name,
		...(input.description ? { 'sbol:description': input.description } : {}),
		'sbol:type': [input.type ?? ENGINEERED_REGION],
		...(input.role ? { 'sbol:role': [input.role] } : {}),
		'sbol:hasSequence': [
			{
				type: 'sbol:Sequence',
				'sbol:displayId': sequenceId,
				'sbol:version': '1',
				'sbol:elements': normalizeSequence(input.sequence, molecule),
				'sbol:encoding': molecule === 'rna' ? EDAM_RNA : EDAM_DNA
			}
		]
	};
	return `${JSON.stringify(document, null, 2)}\n`;
}
