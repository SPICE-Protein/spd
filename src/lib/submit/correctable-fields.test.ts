import { describe, expect, it } from 'vitest';
import { correctableFieldKeys } from './correctable-fields';

describe('correctableFieldKeys', () => {
	it('normalizes the underscore spelling pages use', () => {
		expect(correctableFieldKeys('cell_line')).toEqual(correctableFieldKeys('cell-line'));
		expect(correctableFieldKeys('restriction_enzyme')).toEqual(
			correctableFieldKeys('restriction-enzyme')
		);
		expect(correctableFieldKeys('pdb_entry')).toEqual(correctableFieldKeys('pdb-entry'));
	});

	it('offers only keys the apply registry accepts', () => {
		const reagent = correctableFieldKeys('reagent') ?? [];
		expect(reagent).toContain('casNumber');
		expect(reagent).toContain('molecularFormula');
		expect(reagent).not.toContain('suppliers');
		// importer-owned section tree and source trail are not assertions
		expect(reagent).not.toContain('pubchemSections');
		expect(reagent).not.toContain('upstreamCreated');
	});

	it('keeps correction fields in the server registry order', () => {
		expect(correctableFieldKeys('protein')?.slice(0, 3)).toEqual([
			'preferredName',
			'geneName',
			'entryName'
		]);
	});

	it('returns null for types outside the correction vocabulary', () => {
		expect(correctableFieldKeys('sequence')).toBeNull();
		expect(correctableFieldKeys('fold')).toBeNull();
		expect(correctableFieldKeys(undefined)).toBeNull();
	});
});
