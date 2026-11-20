import { describe, expect, it } from 'vitest';
import { actionableReferences } from './reagent-references';
import type { ReagentExternalReference } from './api/types';

const ref = (source: string, extra: Partial<ReagentExternalReference> = {}) =>
	({ source, ...extra }) as ReagentExternalReference;

describe('actionableReferences', () => {
	it('keeps a structure SPD can open or import', () => {
		expect(actionableReferences([ref('pdb', { externalId: '7SJI' })])).toEqual([
			ref('pdb', { externalId: '7SJI' })
		]);
	});

	it('keeps a reaction Rhea indexed by id', () => {
		expect(
			actionableReferences([
				ref('rhea', { externalId: '10940', role: 'reactions', title: 'A = B' })
			])
		).toHaveLength(1);
	});

	it('drops a table the source renders itself', () => {
		const tables = [
			ref('rhea', { role: 'reactions', table: 'rhea' }),
			ref('reactome', { role: 'pathway-reactions', table: 'pathwayreaction' }),
			ref('pathway', { role: 'pathways' }),
			ref('pdb', { role: 'protein-structures', table: 'pdb' })
		];
		expect(actionableReferences(tables)).toEqual([]);
	});

	it('drops a code no catalog accepts as an address', () => {
		expect(actionableReferences([ref('pdbe', { externalId: '9IR', role: 'ligand-code' })])).toEqual(
			[]
		);
	});

	it('keeps order and leaves the source list untouched', () => {
		const input = [
			ref('pdb', { externalId: '7SJI' }),
			ref('rhea', { role: 'reactions' }),
			ref('pdb', { externalId: '1NHE' })
		];
		expect(actionableReferences(input).map((item) => item.externalId)).toEqual(['7SJI', '1NHE']);
		expect(input).toHaveLength(3);
	});
});