/**
 * The flatfile formats a sequence record leaves in, other than GenBank.
 *
 * Every writer here is a projection of the same `ExportSequence`: SPD already
 * holds the asserted letters and the feature rows, so a format is only a
 * question of line shapes. GenBank is written by `@teselagen/bio-parsers`;
 * EMBL, GFF3, BED and SBOL2 have no writer in that package and are built here.
 *
 * Feature coordinates arrive 1-based inclusive (the way SPD stores a region).
 * Each writer converts at its own boundary, because every downstream format
 * counts bases differently and getting that wrong is silent.
 */

import type { ExportFeature, ExportSequence, Molecule } from './bio';
import { normalizeSequence } from './bio';

/** Bits of a record the flatfiles want that are not part of the letters. */
export interface SequenceMeta {
	/** Source organism, written to the EMBL `OS` line. */
	organism?: string;
	/** Upstream accession, written to the EMBL `AC` line. */
	accession?: string;
	keywords?: string[];
	/** SO term for the record itself, e.g. a gene or an engineered region. */
	role?: string;
	/** Stable SPD id, used to name the SBOL objects. */
	id?: string;
}

const EMBL_MOL_TYPE: Record<Molecule, string> = {
	dna: 'genomic DNA',
	rna: 'transcribed RNA',
	protein: 'protein'
};

/** INSDC `ID` class for each molecule. */
const EMBL_CLASS: Record<Molecule, string> = {
	dna: 'DNA',
	rna: 'RNA',
	protein: 'protein'
};

/** Sequence Ontology term for a GenBank feature key, used by the SBOL2 writer. */
const FEATURE_ROLE: Record<string, string> = {
	CDS: '0000316',
	gene: '0000704',
	promoter: '0000167',
	RBS: '0000139',
	terminator: '0000141',
	tag: '0000327',
	regulatory: '0005836',
	enhancer: '0000165',
	operator: '0000057',
	silencer: '0000627',
	exon: '0000147',
	intron: '0000188',
	"5'UTR": '0000204',
	"3'UTR": '0000205',
	rep_origin: '0000296',
	TATA_signal: '0000170',
	CAAT_signal: '0000172',
	misc_feature: '0000110'
};

/** SBOL2 role for one feature key, falling back to a plain sequence feature. */
export function featureRole(type: string): string {
	return `http://identifiers.org/SO:${FEATURE_ROLE[type] ?? '0000110'}`;
}

function letters(seq: ExportSequence): string {
	return normalizeSequence(seq.sequence, seq.molecule ?? 'dna');
}

function readableFeatures(seq: ExportSequence): ExportFeature[] {
	return (seq.features ?? []).filter(
		(f) =>
			Number.isFinite(f.start) &&
			Number.isFinite(f.end) &&
			f.start >= 1 &&
			f.end >= f.start &&
			f.end <= letters(seq).length
	);
}

/** A filename/identifier-safe stem: no whitespace, no shell or URL delimiters. */
export function identifierStem(name: string, id = ''): string {
	const tail = id.includes(':') ? id.split(':').pop()! : id;
	const raw = (name || tail || 'spd-record').replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
	const safe = raw || 'spd-record';
	return /^[A-Za-z_]/.test(safe) ? safe : `spd_${safe}`;
}

/** A free-text EMBL line, wrapped at the column the flatfile reserves for it. */
function wrapLine(text: string, prefix: string, width: number): string[] {
	const out: string[] = [];
	let rest = text;
	while (rest.length > 0) {
		out.push(`${prefix}${rest.slice(0, width)}`);
		rest = rest.slice(width);
	}
	return out.length ? out : [prefix.trimEnd()];
}

function emblLocation(feature: ExportFeature): string {
	const span = `${feature.start}..${feature.end}`;
	return feature.strand === -1 ? `complement(${span})` : span;
}

function emblQualifier(key: string, value: string): string[] {
	const clean = value.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
	const head = `FT                   /${key}="`;
	const lines: string[] = [];
	let rest = clean;
	const firstRoom = 80 - head.length - 1;
	while (rest.length > firstRoom) {
		lines.push(`${head}${rest.slice(0, firstRoom)}`);
		rest = rest.slice(firstRoom);
		// Later lines continue the quoted value at the same column.
	}
	lines.push(`${head}${rest}"`);
	return lines;
}

/**
 * EMBL flatfile, the INSDC sibling of GenBank. Written here rather than read
 * back from a parser: `jsonToGenbank` is the only flatfile writer in the
 * package, and an EMBL file that disagrees with its own `SQ` counts is worse
 * than no file, so the counts are computed from the letters being written.
 */
export function toEmbl(seq: ExportSequence, meta: SequenceMeta = {}): string {
	const molecule = seq.molecule ?? 'dna';
	const sequence = letters(seq);
	const name = identifierStem(seq.name).toUpperCase().slice(0, 16);
	const topology = seq.circular ? 'circular' : 'linear';
	const lines: string[] = [];

	lines.push(
		`ID   ${name}; SV 1; ${topology}; ${EMBL_CLASS[molecule]}; STD; UNC; ${sequence.length} BP.`
	);
	lines.push('XX');
	if (meta.accession) {
		lines.push(`AC   ${meta.accession};`);
		lines.push('XX');
	}
	const description = (seq.description ?? '').trim();
	if (description) {
		lines.push(...wrapLine(description, 'DE   ', 75));
		lines.push('XX');
	}
	const keywords = (meta.keywords ?? []).filter((k) => k.trim());
	lines.push(`KW   ${keywords.length ? `${keywords.join('; ')}.` : '.'}`);
	lines.push('XX');
	lines.push(`OS   ${meta.organism ?? '.'}`);
	lines.push('XX');
	lines.push('FH   Key             Location/Qualifiers');
	lines.push('FH');
	lines.push(`FT   source          1..${sequence.length}`);
	lines.push(...emblQualifier('mol_type', EMBL_MOL_TYPE[molecule]));
	if (meta.organism) lines.push(...emblQualifier('organism', meta.organism));
	for (const feature of readableFeatures(seq)) {
		const key = (feature.type || 'misc_feature').slice(0, 16).padEnd(16);
		lines.push(`FT   ${key}${emblLocation(feature)}`);
		if (feature.name) lines.push(...emblQualifier('label', feature.name));
	}
	lines.push('XX');

	const counts = { A: 0, C: 0, G: 0, T: 0, U: 0, other: 0 };
	for (const base of sequence) {
		if (base in counts) counts[base as keyof typeof counts] += 1;
		else counts.other += 1;
	}
	const tally =
		molecule === 'protein'
			? `0 A; 0 C; 0 G; 0 T; ${counts.other} other`
			: `${counts.A} A; ${counts.C} C; ${counts.G} G; ${counts.T + counts.U} T; ${counts.other} other`;
	lines.push(`SQ   Sequence ${sequence.length} BP; ${tally};`);
	for (const row of sequence.match(/.{1,60}/g) ?? []) {
		lines.push(`     ${(row.match(/.{1,10}/g) ?? []).join(' ')}`);
	}
	lines.push('//');
	return `${lines.join('\n')}\n`;
}

function gffEscape(value: string): string {
	return value.replace(/%/g, '%25').replace(/[\t\n\r]/g, ' ').replace(/[;,=&]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function seqid(seq: ExportSequence, meta: SequenceMeta): string {
	return gffEscape(identifierStem(seq.name, meta.id));
}

export interface Gff3Options {
	/**
	 * Append a `##FASTA` section. On by default: these files are one record
	 * each, so without the letters a reader has a feature table pointing at a
	 * sequence it does not have.
	 */
	withSequence?: boolean;
}

/**
 * GFF3, one line per feature plus the `##sequence-region` directive. GFF3 is
 * 1-based inclusive like SPD, so only the strand glyph and the attribute
 * encoding need care.
 */
export function toGff3(
	seq: ExportSequence,
	meta: SequenceMeta = {},
	options: Gff3Options = {}
): string {
	const sequence = letters(seq);
	const id = seqid(seq, meta);
	const lines = ['##gff-version 3', `##sequence-region ${id} 1 ${sequence.length}`];
	readableFeatures(seq).forEach((feature, i) => {
		const type = gffEscape(feature.type || 'misc_feature');
		const strand = feature.strand === -1 ? '-' : '+';
		const phase = type === 'CDS' ? '0' : '.';
		const attributes = [`ID=${type.toLowerCase()}_${i + 1}`];
		if (feature.name) attributes.push(`Name=${gffEscape(feature.name)}`);
		lines.push(
			[id, 'SPD', type, feature.start, feature.end, '.', strand, phase, attributes.join(';')].join('\t')
		);
	});
	if (options.withSequence !== false) {
		lines.push('##FASTA', `>${id}`);
		for (const row of sequence.match(/.{1,60}/g) ?? []) lines.push(row);
	}
	return `${lines.join('\n')}\n`;
}

/**
 * BED6, one line per feature. BED is 0-based and end-exclusive, so the start
 * loses one and the end does not.
 */
export function toBed(seq: ExportSequence, meta: SequenceMeta = {}): string {
	const id = identifierStem(seq.name, meta.id);
	const label = (seq.name || id).replace(/[\t\n\r]/g, ' ').trim();
	const lines = [`track name="${label}" description="${label}"`];
	for (const feature of readableFeatures(seq)) {
		const name = (feature.name || feature.type || 'feature').replace(/[\t\n\r]/g, ' ').trim();
		const strand = feature.strand === -1 ? '-' : '+';
		lines.push([id, feature.start - 1, feature.end, name, 0, strand].join('\t'));
	}
	return `${lines.join('\n')}\n`;
}

export interface FeatureTableOptions {
	delimiter?: ',' | '\t';
}

/** The feature rows as a spreadsheet: what a bench scientist pastes into Excel. */
export function toFeatureTable(seq: ExportSequence, options: FeatureTableOptions = {}): string {
	const delimiter = options.delimiter ?? ',';
	const cell = (value: string | number) => {
		const text = String(value);
		return delimiter === ','
			? /[",\n]/.test(text)
				? `"${text.replace(/"/g, '""')}"`
				: text
			: text.replace(/[\t\n\r]/g, ' ');
	};
	const rows: Array<Array<string | number>> = [['start', 'end', 'strand', 'type', 'name']];
	for (const feature of readableFeatures(seq)) {
		rows.push([
			feature.start,
			feature.end,
			feature.strand === -1 ? '-' : '+',
			feature.type || 'misc_feature',
			feature.name ?? ''
		]);
	}
	return `${rows.map((row) => row.map(cell).join(delimiter)).join('\n')}\n`;
}

function xmlEscape(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

const SBOL2_TYPE: Record<Molecule, string> = {
	dna: 'DnaRegion',
	rna: 'RnaRegion',
	protein: 'Protein'
};

const SBOL2_ENCODING: Record<Molecule, string> = {
	dna: 'http://www.chem.qmul.ac.uk/iubmb/misc/naseq.html',
	rna: 'http://www.chem.qmul.ac.uk/iubmb/misc/naseq.html',
	protein: 'http://www.chem.qmul.ac.uk/iupac/AminoAcid/'
};

const SBOL2_BASE = 'http://spd.spicebio.top/sbol2/';

/**
 * SBOL2 as RDF/XML, the dialect SynBioHub and ICE ingest. Features become
 * SequenceAnnotations with a Range each; the letters carry their own
 * `sbol:Sequence` object so the document stands alone.
 */
export function toSbol2(seq: ExportSequence, meta: SequenceMeta = {}): string {
	const molecule = seq.molecule ?? 'dna';
	const sequence = letters(seq);
	const displayId = identifierStem(seq.name, meta.id);
	const about = `${SBOL2_BASE}${displayId}`;
	const type = `http://www.biopax.org/release/biopax-level3.owl#${SBOL2_TYPE[molecule]}`;
	const lines: string[] = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
		'         xmlns:sbol="http://sbols.org/v2#"',
		'         xmlns:dcterms="http://purl.org/dc/terms/">',
		`  <sbol:ComponentDefinition rdf:about="${about}">`,
		`    <sbol:displayId>${xmlEscape(displayId)}</sbol:displayId>`,
		'    <sbol:version>1</sbol:version>',
		`    <dcterms:title>${xmlEscape(seq.name)}</dcterms:title>`
	];
	if (seq.description?.trim()) {
		lines.push(`    <dcterms:description>${xmlEscape(seq.description.trim())}</dcterms:description>`);
	}
	lines.push(`    <sbol:type rdf:resource="${type}"/>`);
	if (meta.role) lines.push(`    <sbol:role rdf:resource="${xmlEscape(meta.role)}"/>`);
	lines.push(`    <sbol:sequence rdf:resource="${about}_sequence"/>`);

	readableFeatures(seq).forEach((feature, i) => {
		const n = i + 1;
		const featureId = `${about}_feature_${n}`;
		lines.push(`    <sbol:sequenceAnnotation rdf:about="${featureId}">`);
		lines.push(`      <sbol:displayId>feature_${n}</sbol:displayId>`);
		lines.push(`      <sbol:component rdf:about="${featureId}_component">`);
		lines.push(`        <sbol:displayId>feature_${n}_component</sbol:displayId>`);
		lines.push(`        <sbol:type rdf:resource="${type}"/>`);
		lines.push(`        <sbol:role rdf:resource="${featureRole(feature.type)}"/>`);
		lines.push('      </sbol:component>');
		lines.push(`      <sbol:location rdf:about="${featureId}_range">`);
		lines.push(`        <sbol:displayId>feature_${n}_range</sbol:displayId>`);
		lines.push(`        <sbol:start>${feature.start}</sbol:start>`);
		lines.push(`        <sbol:end>${feature.end}</sbol:end>`);
		lines.push(
			`        <sbol:orientation rdf:resource="http://sbols.org/v2#${
				feature.strand === -1 ? 'reverseComplement' : 'inline'
			}"/>`
		);
		lines.push('      </sbol:location>');
		lines.push('    </sbol:sequenceAnnotation>');
	});

	lines.push('  </sbol:ComponentDefinition>');
	lines.push(`  <sbol:Sequence rdf:about="${about}_sequence">`);
	lines.push(`    <sbol:displayId>${xmlEscape(displayId)}_sequence</sbol:displayId>`);
	lines.push('    <sbol:version>1</sbol:version>');
	lines.push(`    <sbol:elements>${xmlEscape(sequence)}</sbol:elements>`);
	lines.push(`    <sbol:encoding rdf:resource="${SBOL2_ENCODING[molecule]}"/>`);
	lines.push('  </sbol:Sequence>');
	lines.push('</rdf:RDF>');
	return `${lines.join('\n')}\n`;
}

/**
 * The record exactly as the API returned it. Nothing is projected: this is the
 * format for the person who wants every field SPD holds, not a reader's view.
 */
export function toRecordJson(record: unknown): string {
	return `${JSON.stringify(record, null, 2)}\n`;
}
