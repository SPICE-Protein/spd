import { describe, it, expect } from 'vitest';
import {
	ENGINEERED_REGION,
	fileStem,
	normalizeSequence,
	partFeatureType,
	regionFeatureType,
	toFasta,
	toGenbank,
	toSbol3
} from './bio';

describe('bio export', () => {
	it('normalizes letters without changing the asserted alphabet', () => {
		expect(normalizeSequence('atg cgt\nacg')).toBe('ATGCGTACG');
		expect(normalizeSequence('aug cgu')).toBe('AUGCGU');
		expect(normalizeSequence('MKV*', 'protein')).toBe('MKV*');
	});

	it('writes a plain FASTA header and 60-column body', () => {
		const text = toFasta({
			name: 'lacZ part',
			description: 'spd:biobrick:1',
			sequence: 'A'.repeat(61),
			molecule: 'dna'
		});
		const [header, first, second] = text.trimEnd().split('\n');
		expect(header).toBe('>lacZ_part spd:biobrick:1');
		expect(first).toHaveLength(60);
		expect(second).toHaveLength(1);
	});

	it('maps SPD vocabularies onto GenBank and SO terms', () => {
		expect(partFeatureType('rbs')).toBe('RBS');
		expect(partFeatureType('protein_tag')).toBe('tag');
		expect(partFeatureType('unknown')).toBe('misc_feature');
		expect(regionFeatureType('five_prime_utr')).toBe("5'UTR");
		expect(regionFeatureType('origin')).toBe('rep_origin');
		expect(regionFeatureType('unknown')).toBe('misc_feature');
	});

	it('keeps filenames safe for the download attribute', () => {
		expect(fileStem('pET-28a / GFP', 'spd:vector:abc')).toBe('pET-28a _ GFP');
		expect(fileStem('', 'spd:gene:abc')).toBe('abc');
	});

	it('serializes the record through the GenBank writer', async () => {
		const text = await toGenbank({
			name: 'test_part',
			description: 'a part',
			sequence: 'ATGCGTACGT',
			features: [{ type: 'CDS', name: 'test CDS', start: 1, end: 9, strand: 1 }]
		});
		expect(text).toContain('LOCUS');
		expect(text).toContain('DEFINITION  a part');
		expect(text).toMatch(/CDS\s+1\.\.9/);
		expect(text).toContain('/label="test CDS"');
		expect(text).toContain('ATGCGTACGT');
	});

	it('emits an SBOL3 Component with an embedded Sequence', () => {
		const doc = JSON.parse(
			toSbol3({
				id: 'spd:biobrick:1',
				name: 'B0034',
				sequence: 'aaagaggagaaa',
				role: 'https://identifiers.org/SO:0000139'
			})
		);
		expect(doc['@context']).toBe('https://sbolstandard.org/3/sbol3-context.json');
		expect(doc.type).toBe('sbol:Component');
		expect(doc['sbol:type']).toEqual([ENGINEERED_REGION]);
		expect(doc['sbol:role']).toEqual(['https://identifiers.org/SO:0000139']);
		expect(doc['sbol:hasSequence'][0]['sbol:elements']).toBe('AAAGAGGAGAAA');
		expect(doc['sbol:hasSequence'][0]['sbol:encoding']).toContain('format_1207');
	});
});
