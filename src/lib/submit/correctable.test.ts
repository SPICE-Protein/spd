import { describe, expect, it } from 'vitest';
import {
	CORRECTABLE_TYPES,
	entityTypeOfId,
	isCorrectable,
	isCorrectableId
} from './correctable';

describe('correctable vocabulary', () => {
	it('matches the server registry', () => {
		// mirrored from corrections/apply.rs::correctable
		expect([...CORRECTABLE_TYPES].sort()).toEqual(
			[
				'biobrick',
				'cell-line',
				'enzyme',
				'gene',
				'pathway',
				'pdb-entry',
				'protein',
				'reaction',
				'reagent',
				'restriction-enzyme',
				'strain'
			].sort()
		);
	});

	it('accepts the landed types and rejects evidence rows', () => {
		for (const t of CORRECTABLE_TYPES) expect(isCorrectable(t)).toBe(true);
		expect(isCorrectable('gene-region')).toBe(false);
		expect(isCorrectable('sequence')).toBe(false);
		expect(isCorrectable('fold')).toBe(false);
		expect(isCorrectable('correction')).toBe(false);
		expect(isCorrectable('')).toBe(false);
		expect(isCorrectable(null)).toBe(false);
	});

	it('reads the type out of a public id', () => {
		expect(entityTypeOfId('spd:gene:abc')).toBe('gene');
		expect(entityTypeOfId('spd:protein:abc')).toBe('protein');
		expect(entityTypeOfId('spd:pdb-entry:1abc')).toBe('pdb-entry');
		expect(entityTypeOfId('not-a-public-id')).toBeNull();
		expect(entityTypeOfId('spd:')).toBeNull();
		expect(entityTypeOfId(null)).toBeNull();
	});

	it('gates ids by the same vocabulary', () => {
		expect(isCorrectableId('spd:gene:abc')).toBe(true);
		expect(isCorrectableId('spd:cell-line:abc')).toBe(true);
		expect(isCorrectableId('spd:sequence:abc')).toBe(false);
		expect(isCorrectableId('spd:media-recipe:abc')).toBe(false);
		expect(isCorrectableId('')).toBe(false);
	});

	it('normalizes the underscore spelling pages use', () => {
		expect(isCorrectable('cell_line')).toBe(true);
		expect(isCorrectable('restriction_enzyme')).toBe(true);
		expect(isCorrectable('wet_lab_validation')).toBe(false);
	});
});
