import { describe, expect, it } from 'vitest';
import { groupCatalysts } from './catalysts';

describe('groupCatalysts', () => {
	it('collapses rows that read the same and counts them', () => {
		const groups = groupCatalysts([
			{ accession: 'P1', name: 'Amidase', ecNumber: '3.5.1.4', reviewed: true },
			{ accession: 'P2', name: 'Amidase', ecNumber: '3.5.1.4', reviewed: true },
			{ accession: 'P3', name: 'Urease', ecNumber: '3.5.1.5', reviewed: true }
		]);
		expect(groups).toHaveLength(2);
		expect(groups[0]).toMatchObject({ count: 2, enzyme: { accession: 'P1' } });
		expect(groups[1]).toMatchObject({ count: 1, enzyme: { accession: 'P3' } });
	});

	it('takes the protein link from whichever member has it', () => {
		// The reader sees one row; if any of its duplicates is in SPD the row
		// leads there, and the accession shown is the one that resolved.
		const groups = groupCatalysts([
			{ accession: 'P1', name: 'Amidase', ecNumber: '3.5.1.4', reviewed: true },
			{
				accession: 'P2',
				name: 'Amidase',
				ecNumber: '3.5.1.4',
				reviewed: true,
				proteinId: 'spd:protein:aaaa'
			}
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0].count).toBe(2);
		expect(groups[0].proteinId).toBe('spd:protein:aaaa');
		expect(groups[0].linkedAccession).toBe('P2');
	});

	it('keeps a complex row a complex, even though it carries one accession', () => {
		const groups = groupCatalysts([
			{
				accession: 'Q13535',
				name: 'ATM/ATR kinase [nucleoplasm]',
				uniprot: ['Q13535', 'Q13315'],
				reactomeId: 'R-HSA-421853'
			}
		]);
		expect(groups[0].complexMembers).toEqual(['Q13535', 'Q13315']);
		expect(groups[0].proteinId).toBeUndefined();
	});

	it('leaves a row without an identifier as one unlinked row', () => {
		const groups = groupCatalysts([{ name: 'unnamed catalyst' }]);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({ count: 1, proteinId: undefined });
		expect(groups[0].complexMembers).toBeUndefined();
	});
});
