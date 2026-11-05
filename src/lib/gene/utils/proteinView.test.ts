import { describe, expect, it } from 'vitest';
import {
	AA_CHEM_COLORS,
	AA_FAMILY_COLORS,
	FEATURE_DEFAULT_COLOR,
	FEATURE_TYPE_COLORS,
	annotationsToViewerFeatures,
	aaColor,
	gravy
} from './proteinView';
import type { ProteinAnnotationRecord } from '../../api/types';

function row(partial: Partial<ProteinAnnotationRecord>): ProteinAnnotationRecord {
	return {
		id: 'spd:protein-annotation:test',
		sequenceId: 'spd:sequence:test',
		featureType: 'DOMAIN',
		startPosition: 10,
		endPosition: 100,
		description: '',
		evidence: [],
		license: 'CC-BY-4.0',
		createdAt: 0,
		...partial
	};
}

describe('annotationsToViewerFeatures', () => {
	it('maps known feature types to their stable palette entry', () => {
		const { features, unplaced } = annotationsToViewerFeatures([row({ featureType: 'DOMAIN' })]);
		expect(unplaced).toBe(0);
		expect(features[0].color).toBe(FEATURE_TYPE_COLORS.DOMAIN);
		expect(features[0].name).toBe('DOMAIN');
		expect(features[0].start).toBe(10);
	});

	it('falls back to the default color for types outside the palette', () => {
		const { features } = annotationsToViewerFeatures([row({ featureType: 'TURN' })]);
		// TURN is IN the vocabulary — test the fallback with a type the
		// palette deliberately omits (viewer never invents a color here).
		const unknown = annotationsToViewerFeatures([row({ featureType: 'Mystery' })]);
		expect(unknown.features[0].color).toBe(FEATURE_DEFAULT_COLOR);
		expect(features[0].color).toBe(FEATURE_TYPE_COLORS.TURN);
	});

	it('skips UniProt "?" features instead of inventing positions', () => {
		const { features, unplaced } = annotationsToViewerFeatures([
			row({ featureType: 'MOD_RES', startPosition: null, endPosition: null }),
			row({ featureType: 'SITE', startPosition: 5, endPosition: null })
		]);
		expect(features).toHaveLength(0);
		expect(unplaced).toBe(2);
	});

	it('clamps ranges past the rendered bytes and keeps determinism', () => {
		const input = [row({ featureType: 'HELIX', startPosition: 20, endPosition: 30 })];
		const a = annotationsToViewerFeatures(input, 25);
		const b = annotationsToViewerFeatures(input, 25);
		expect(a.features[0].end).toBe(25);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it('carries description/residue through and drops external accessions', () => {
		const { features } = annotationsToViewerFeatures([
			row({
				featureType: 'MOD_RES',
				startPosition: 7,
				endPosition: 7,
				description: 'Phosphoserine',
				residue: 'Ser',
				externalSource: 'Pfam',
				externalId: 'PF00069'
			})
		]);
		expect(features[0]).toMatchObject({
			description: 'Phosphoserine',
			residue: 'Ser'
		});
		expect(features[0]).not.toHaveProperty('externalSource');
		expect(features[0]).not.toHaveProperty('externalId');
	});
});

describe('aa colors and GRAVY', () => {
	it('provides family and chemistry tables with fallback to undefined', () => {
		expect(AA_FAMILY_COLORS.A).toBe('#00FFFF');
		expect(typeof AA_CHEM_COLORS.R).toBe('string');
		// The alphabet even colors the ambiguity codes (J/X/Z) — a digit is
		// the only thing that cannot resolve.
		expect(aaColor('1', 'aa_family')).toBeUndefined();
	});

	it('GRAVY averages recognized residues and ignores unknown ones', () => {
		// Alanine hydrophobicity is 1.8 in the ported alphabet.
		expect(gravy('AAA')).toBeCloseTo(1.8);
		expect(gravy('XXX')).toBeNull();
		expect(gravy('AAX')).toBeCloseTo(1.8);
	});
});
