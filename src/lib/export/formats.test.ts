import { describe, expect, it } from 'vitest';
import { anyToJson } from '@teselagen/bio-parsers';
import {
	identifierStem,
	toBed,
	toEmbl,
	toFeatureTable,
	toGff3,
	toRecordJson,
	toSbol2
} from './formats';

const RECORD = {
	name: 'test part',
	description: 'a part & <b>',
	sequence: 'ATGCGTACGT',
	molecule: 'dna' as const,
	features: [
		{ type: 'CDS', name: 'test CDS', start: 2, end: 9, strand: -1 as const },
		{ type: 'promoter', name: 'pTac', start: 1, end: 5, strand: 1 as const }
	]
};

describe('EMBL export', () => {
	const text = toEmbl(RECORD, { organism: 'Escherichia coli', accession: 'JX000001' });

	it('opens with an ID line and closes with //', () => {
		const lines = text.split('\n');
		expect(lines[0]).toBe('ID   TEST_PART; SV 1; linear; DNA; STD; UNC; 10 BP.');
		expect(lines.at(-2)).toBe('//');
	});

	it('carries the accession, organism and description', () => {
		expect(text).toContain('AC   JX000001;');
		expect(text).toContain('OS   Escherichia coli');
		expect(text).toContain('DE   a part & <b>');
	});

	it('writes each feature with its location and label', () => {
		expect(text).toContain('FT   CDS             complement(2..9)');
		expect(text).toContain('FT                   /label="test CDS"');
		expect(text).toContain('FT   promoter        1..5');
	});

	it('counts the bases it actually wrote', () => {
		expect(text).toContain('SQ   Sequence 10 BP; 2 A; 2 C; 3 G; 3 T; 0 other;');
		expect(text).toContain('     ATGCGTACGT');
	});

	it('keeps every line inside the flatfile width', () => {
		for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(80);
	});

	it('wraps a long description instead of overrunning the line', () => {
		const long = 'x'.repeat(200);
		const wrapped = toEmbl({ ...RECORD, description: long }).split('\n');
		const de = wrapped.filter((l) => l.startsWith('DE   '));
		expect(de.length).toBeGreaterThan(1);
		expect(de.join('').replace(/DE {3}/g, '')).toBe(long);
	});
});

describe('GFF3 export', () => {
	it('round-trips through a third-party GFF parser', async () => {
		const text = toGff3(RECORD, { id: 'spd:biobrick:1' });
		const [parsed] = await anyToJson(text, { fileName: 'record.gff3' });
		expect(parsed.success).toBe(true);
		expect(parsed.parsedSequence.sequence).toBe('ATGCGTACGT');
		expect(parsed.parsedSequence.features).toHaveLength(2);
		expect(parsed.parsedSequence.features[0]).toMatchObject({
			start: 2,
			end: 9,
			strand: -1,
			type: 'CDS'
		});
		expect(parsed.parsedSequence.features[1]).toMatchObject({ start: 1, end: 5, strand: 1 });
	});

	it('declares the sequence region and keeps one row per feature', () => {
		const lines = toGff3(RECORD).split('\n');
		expect(lines[0]).toBe('##gff-version 3');
		expect(lines[1]).toBe('##sequence-region test_part 1 10');
		expect(lines[2].split('\t')).toEqual([
			'test_part',
			'SPD',
			'CDS',
			'2',
			'9',
			'.',
			'-',
			'0',
			'ID=cds_1;Name=test CDS'
		]);
	});

	it('can leave the letters out', () => {
		expect(toGff3(RECORD, {}, { withSequence: false })).not.toContain('##FASTA');
	});
});

describe('BED export', () => {
	it('writes 0-based, end-exclusive rows', () => {
		const lines = toBed(RECORD).split('\n');
		expect(lines[0]).toBe('track name="test part" description="test part"');
		expect(lines[1]).toBe('test_part\t1\t9\ttest CDS\t0\t-');
		expect(lines[2]).toBe('test_part\t0\t5\tpTac\t0\t+');
	});
});

describe('feature table export', () => {
	it('quotes the cells a CSV reader would split', () => {
		const text = toFeatureTable({
			...RECORD,
			features: [{ type: 'CDS', name: 'a, b', start: 1, end: 3, strand: 1 }]
		});
		expect(text.split('\n')[0]).toBe('start,end,strand,type,name');
		expect(text).toContain('1,3,+,CDS,"a, b"');
	});

	it('writes a tab-separated table without quoting', () => {
		const text = toFeatureTable(RECORD, { delimiter: '\t' });
		expect(text.split('\n')[1]).toBe('2\t9\t-\tCDS\ttest CDS');
	});

	it('drops features that fall outside the letters', () => {
		const text = toFeatureTable({
			...RECORD,
			features: [{ type: 'CDS', name: 'off the end', start: 8, end: 40, strand: 1 }]
		});
		expect(text.trim().split('\n')).toHaveLength(1);
	});
});

describe('SBOL2 export', () => {
	const text = toSbol2(RECORD, { role: 'http://identifiers.org/SO:0000804' });

	it('writes a ComponentDefinition carrying the letters', () => {
		expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(text).toContain(
			'<sbol:ComponentDefinition rdf:about="http://spd.spicebio.top/sbol2/test_part">'
		);
		expect(text).toContain('<sbol:displayId>test_part</sbol:displayId>');
		expect(text).toContain('<sbol:elements>ATGCGTACGT</sbol:elements>');
		expect(text).toContain('biopax-level3.owl#DnaRegion');
		expect(text.trimEnd().endsWith('</rdf:RDF>')).toBe(true);
	});

	it('turns each feature into an annotation with a range', () => {
		expect(text).toContain('<sbol:sequenceAnnotation rdf:about="http://spd.spicebio.top/sbol2/test_part_feature_1">');
		expect(text).toContain('<sbol:start>2</sbol:start>');
		expect(text).toContain('<sbol:end>9</sbol:end>');
		expect(text).toContain('http://sbols.org/v2#reverseComplement');
		expect(text).toContain('<sbol:role rdf:resource="http://identifiers.org/SO:0000316"/>');
	});

	it('escapes markup in the description rather than emitting broken XML', () => {
		expect(text).toContain('<dcterms:description>a part &amp; &lt;b&gt;</dcterms:description>');
	});
});

describe('record JSON export', () => {
	it('writes the record as it came back, indented', () => {
		expect(toRecordJson({ id: 'spd:gene:1', symbol: 'GFP' })).toBe(
			'{\n  "id": "spd:gene:1",\n  "symbol": "GFP"\n}\n'
		);
	});
});

describe('identifier stem', () => {
	it('folds spaces and leading digits', () => {
		expect(identifierStem('test part')).toBe('test_part');
		expect(identifierStem('3x GFP', 'spd:gene:abc')).toBe('spd_3x_GFP');
		expect(identifierStem('', 'spd:gene:abc')).toBe('abc');
	});
});
