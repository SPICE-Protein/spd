import { describe, expect, it } from 'vitest';
import { REGION_DEFAULT_COLOR, REGION_TYPE_COLORS, cutOffset, regionsToViewerFeatures, scanDnaSites } from './geneView';
import type { GeneRegionRow } from '../../api/types';

// the 15-value vocabulary exactly as migration 0038 checks it
const VOCAB = [
	'promoter',
	'operator',
	'enhancer',
	'silencer',
	'tata_box',
	'caat_signal',
	'terminator',
	'origin',
	'exon',
	'intron',
	'five_prime_utr',
	'three_prime_utr',
	'cds',
	'rnase_site',
	'other'
];

function region(partial: Partial<GeneRegionRow>): GeneRegionRow {
	return {
		id: 'spd:gene-region:test',
		geneId: 'spd:gene:test',
		molecule: 'rna',
		regionType: 'cds',
		startPosition: 10,
		endPosition: 100,
		description: 'test region',
		proteinId: null,
		createdAt: 0,
		...partial
	};
}

describe('regionsToViewerFeatures', () => {
	it('gives every vocabulary value a stable color', () => {
		for (const rt of VOCAB) {
			expect(REGION_TYPE_COLORS[rt], `missing palette entry for ${rt}`).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});

	it('plots a closed, in-range region with description as the label', () => {
		const { features, unplaced } = regionsToViewerFeatures([region({ description: 'core promoter' })], 200);
		expect(unplaced).toHaveLength(0);
		expect(features).toHaveLength(1);
		expect(features[0].name).toBe('core promoter');
		expect(features[0].type).toBe('cds');
		expect(features[0].start).toBe(10);
		expect(features[0].end).toBe(100);
		expect(features[0].forward).toBe(true);
		expect(features[0].color).toBe(REGION_TYPE_COLORS.cds);
	});

	it('reports open-ended assertions (a missing coordinate is a legal row) as unplaced', () => {
		const rows = [region({ startPosition: null }), region({ endPosition: null })];
		const { features, unplaced } = regionsToViewerFeatures(rows, 500);
		expect(features).toHaveLength(0);
		expect(unplaced).toHaveLength(2);
		// the stranded rows come back intact — the table shows them verbatim
		expect(unplaced[0].startPosition).toBeNull();
	});

	it('strands a region whose end passes the asserted sequence instead of clamping it', () => {
		// an accepted §53 shortening of dnaSequence/rnaSequence may orphan
		// older rows; the viewer must not redraw them onto shorter letters
		const { features, unplaced } = regionsToViewerFeatures(
			[region({ startPosition: 90, endPosition: 140 })],
			130
		);
		expect(features).toHaveLength(0);
		expect(unplaced).toHaveLength(1);
	});

	it('refuses inverted ranges (guarded even though the DDL CHECK forbids them)', () => {
		const { features, unplaced } = regionsToViewerFeatures([region({ startPosition: 50, endPosition: 40 })], 500);
		expect(features).toHaveLength(0);
		expect(unplaced).toHaveLength(1);
	});

	it('draws an explicit reverse strand backward', () => {
		const { features } = regionsToViewerFeatures([region({ strand: 'reverse' })], 500);
		expect(features[0].forward).toBe(false);
	});

	it('draws an explicit forward strand forward', () => {
		const { features } = regionsToViewerFeatures([region({ strand: 'forward' })], 500);
		expect(features[0].forward).toBe(true);
	});

	it('draws an unknown or absent strand forward', () => {
		const { features } = regionsToViewerFeatures(
			[region({ strand: 'unknown' }), region({ strand: null }), region({})],
			500
		);
		expect(features.map((f) => f.forward)).toEqual([true, true, true]);
	});

	it('falls back to the default color for a type outside the palette', () => {
		const { features } = regionsToViewerFeatures([region({ regionType: 'matrix_attachment' as never })], 500);
		expect(features[0].color).toBe(REGION_DEFAULT_COLOR);
	});
});

describe('cutOffset', () => {
	it('reads the scissor point from marker spellings', () => {
		expect(cutOffset('G^AATTC', 6)).toBe(1);
		expect(cutOffset('GAATTC/6', 6)).toBe(6);
		expect(cutOffset('A|AGCTTT', 8)).toBe(1);
		// no marker at all: center estimate, never a claim
		expect(cutOffset('GAATTC', 6)).toBe(3);
	});
});

describe('scanDnaSites', () => {
	it('marks one EcoRI site (palindromic strands deduplicate)', () => {
		const sites = scanDnaSites('TTTGAATTCTTT', [{ name: 'EcoRI', recognitionSite: 'GAATTC', cutPosition: 'G^AATTC' }]);
		expect(sites).toHaveLength(1);
		// match at 0-based 3, cut one letter in → 1-based 5
		expect(sites[0].pos).toBe(5);
		expect(sites[0].name).toBe('EcoRI');
	});

	it('finds both strand readings of a non-palindromic site', () => {
		// AGGC on the shown strand at 0; its reverse complement GCCT sits at
		// index 2, which the same cutter would clip reading the other way
		const sites = scanDnaSites('AAGGCTTTGCCTAA', [
			{ name: 'TestI', recognitionSite: 'AGGC', cutPosition: 'A^GGC' }
		]);
		expect(sites.length).toBeGreaterThanOrEqual(2);
		expect(new Set(sites.map((s) => s.pos)).size).toBe(sites.length);
	});

	it('honours IUPAC ambiguity codes', () => {
		// R = A|G, so the cutter's RGAATTC finds AGAATTC at index 2; the
		// trailing A keeps the reverse-complement reading from also matching
		const sites = scanDnaSites('AAAGAATTCA', [{ name: 'AmbigI', recognitionSite: 'RGAATTC', cutPosition: '^' }]);
		expect(sites).toHaveLength(1);
		expect(sites[0].pos).toBe(3);
	});

	it('skips sites that are not pure nucleotide letters and stays silent on empty input', () => {
		expect(scanDnaSites('ACGT', [{ name: 'Junk', recognitionSite: 'GAAT?C', cutPosition: '^' }])).toHaveLength(0);
		expect(scanDnaSites('', [{ name: 'EcoRI', recognitionSite: 'GAATTC', cutPosition: 'G^AATTC' }])).toHaveLength(0);
	});
});
