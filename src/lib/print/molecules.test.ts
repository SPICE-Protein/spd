import { describe, expect, it } from 'vitest';
import { reactionMolecules, reagentMolecules } from './molecules';

describe('print molecule extras', () => {
	it('prefers the isomeric reagent SMILES', () => {
		expect(reagentMolecules({ smiles: 'CCO', isomericSmiles: 'C[C@H](O)' })).toEqual([
			{ smiles: 'C[C@H](O)' }
		]);
	});

	it('skips a reagent with no structure', () => {
		expect(reagentMolecules({ smiles: '   ' })).toEqual([]);
	});

	it('collects only reaction participants that carry SMILES', () => {
		expect(
			reactionMolecules({
				participants: [
					{ name: 'ATP', smiles: 'C1=NC=NC2=C1N=CN2' },
					{ name: 'water', smiles: '' },
					{ name: 'ADP', smiles: 'C1=NC=NC2=C1N=CN2' }
				]
			})
		).toEqual([
			{ smiles: 'C1=NC=NC2=C1N=CN2', caption: 'ATP' },
			{ smiles: 'C1=NC=NC2=C1N=CN2', caption: 'ADP' }
		]);
	});
});
