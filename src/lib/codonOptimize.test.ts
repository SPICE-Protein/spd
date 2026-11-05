import { describe, expect, it } from 'vitest';
import { CODON_TO_AA } from './codons';
import type { CodonUsageRow } from './api/types';
import {
	CodonOptimizeError,
	cai,
	codonUsageFromRow,
	gcContent,
	optimizeCds,
	optimizeProtein,
	rareCodons,
	translateCds,
	type CodonErrorCode
} from './codonOptimize';

const CODE = CODON_TO_AA;

const USAGE: Record<string, number> = {
	ATG: 1,
	TGG: 1,
	GCT: 0.1,
	GCC: 0.5,
	GCA: 0.2,
	GCG: 0.2,
	TAA: 0.5,
	TAG: 0.2,
	TGA: 0.3
};

function expectCode(fn: () => unknown, code: CodonErrorCode) {
	try {
		fn();
	} catch (e) {
		expect(e).toBeInstanceOf(CodonOptimizeError);
		expect((e as CodonOptimizeError).code).toBe(code);
		return;
	}
	throw new Error(`expected a CodonOptimizeError with code ${code}`);
}

describe('translateCds', () => {
	it('translates DNA and RNA spellings to the same protein', () => {
		expect(translateCds('ATGGCTTAA', CODE)).toBe('MA*');
		expect(translateCds('AUGGCUUAA', CODE)).toBe('MA*');
		expect(translateCds('atg gcu taa\n', CODE)).toBe('MA*');
	});

	it('allows a terminal stop and reports an internal stop as *', () => {
		expect(translateCds('ATGTAA', CODE)).toBe('M*');
		expect(translateCds('ATGTAAGCT', CODE)).toBe('M*A');
	});

	it('rejects an empty sequence, a bad length, and non-nucleotide letters', () => {
		expectCode(() => translateCds('', CODE), 'empty');
		expectCode(() => translateCds('ATGG', CODE), 'length');
		expectCode(() => translateCds('ATGNNN', CODE), 'alphabet');
		expectCode(() => translateCds('ATGGCTX', CODE), 'alphabet');
	});

	it('rejects a codon the supplied genetic code does not know', () => {
		const code = { ATG: 'M', GCT: 'A' };
		expectCode(() => translateCds('ATGTAA', code), 'unknown_codon');
	});
});

describe('optimizeProtein', () => {
	it('chooses the highest-frequency synonymous codon and appends a stop', () => {
		const r = optimizeProtein('MA', CODE, USAGE);
		expect(r.dna).toBe('ATGGCCTAA');
		expect(r.protein).toBe('MA');
		expect(r.inputKind).toBe('protein');
		expect(r.codons.map((c) => c.codon)).toEqual(['ATG', 'GCC', 'TAA']);
		expect(r.codons[1]).toMatchObject({ aa: 'A', frequency: 0.5, changed: false });
		expect(r.codons[2]).toMatchObject({ aa: '*' });
		expect(r.metrics).toMatchObject({ length: 9, gc: gcContent('ATGGCCTAA') });
	});

	it('does not append a second stop when the protein already ends with *', () => {
		const r = optimizeProtein('M*', CODE, USAGE);
		expect(r.dna).toBe('ATGTAA');
		expect(r.codons).toHaveLength(2);
	});

	it('tie-breaks alphabetically, independent of input order', () => {
		const flat = { GCA: 0.5, GCC: 0.5, GCG: 0.5, GCT: 0.5, TAA: 0.5, TAG: 0.5, TGA: 0.5 };
		const reversed = Object.fromEntries(Object.entries(flat).reverse());
		const a = optimizeProtein('A*', CODE, flat);
		const b = optimizeProtein('A*', CODE, reversed);
		expect(a.dna).toBe('GCATAA');
		expect(b.dna).toBe(a.dna);
	});

	it('appends the highest-frequency stop codon, not the first alphabetically', () => {
		const r = optimizeProtein('M', CODE, { ATG: 1, TAA: 0.1, TAG: 0.2, TGA: 0.7 });
		expect(r.dna).toBe('ATGTGA');
	});

	it('falls back alphabetically when usage has no entry, reporting null frequency', () => {
		const r = optimizeProtein('A*', CODE, {});
		expect(r.dna).toBe('GCATAA');
		expect(r.codons[0].frequency).toBeNull();
		expect(r.codons[1].frequency).toBeNull();
	});

	it('errors for an unknown amino-acid letter', () => {
		expectCode(() => optimizeProtein('MX', CODE, USAGE), 'unknown_aa');
	});

	it('errors when the code has no codon for an amino acid or no stop', () => {
		expectCode(() => optimizeProtein('A', { ATG: 'M', TAA: '*' }, USAGE), 'no_codon');
		expectCode(() => optimizeProtein('M', { ATG: 'M' }, USAGE), 'no_codon');
	});

	it('rejects an empty protein', () => {
		expectCode(() => optimizeProtein('  ', CODE, USAGE), 'empty');
	});
});

describe('optimizeCds', () => {
	it('translates, optimizes, and marks changed codons', () => {
		const r = optimizeCds('ATGGCTTAA', CODE, USAGE);
		expect(r.inputKind).toBe('dna');
		expect(r.protein).toBe('MA*');
		expect(r.dna).toBe('ATGGCCTAA');
		expect(r.codons.map((c) => c.changed)).toEqual([false, true, false]);
		expect(r.codons.map((c) => c.codon)).toEqual(['ATG', 'GCC', 'TAA']);
	});

	it('appends a stop to a CDS that lacks one and marks the addition', () => {
		const r = optimizeCds('ATGGCT', CODE, USAGE);
		expect(r.protein).toBe('MA');
		expect(r.dna).toBe('ATGGCCTAA');
		expect(r.codons).toHaveLength(3);
		expect(r.codons[2]).toMatchObject({ codon: 'TAA', aa: '*', changed: true });
	});

	it('treats an RNA input codon as unchanged when only the spelling differs', () => {
		const r = optimizeCds('AUGGCUUAA', CODE, USAGE);
		expect(r.dna).toBe('ATGGCCTAA');
		expect(r.codons.map((c) => c.changed)).toEqual([false, true, false]);
	});

	it('propagates translation failures', () => {
		expectCode(() => optimizeCds('ATGG', CODE, USAGE), 'length');
		expectCode(() => optimizeCds('ATGNNN', CODE, USAGE), 'alphabet');
	});
});

describe('cai', () => {
	const code = {
		GCT: 'A',
		GCC: 'A',
		GCA: 'A',
		GCG: 'A',
		TTT: 'F',
		TTC: 'F',
		ATG: 'M',
		TGG: 'W',
		TAA: '*'
	};

	it('is 1 when every codon is the family maximum', () => {
		expect(cai(['GCC'], { GCC: 1, GCT: 0, GCA: 0, GCG: 0 }, code)).toBe(1);
		expect(cai(['TTC'], { TTC: 1, TTT: 0 }, code)).toBe(1);
	});

	it('uses the geometric mean of relative adaptiveness', () => {
		expect(cai(['GCT'], { GCC: 1, GCT: 0.5, GCA: 0, GCG: 0 }, code)).toBeCloseTo(0.5);
		expect(cai(['GCT', 'TTC'], { GCT: 0.5, GCC: 1, TTC: 0.5, TTT: 1 }, code)).toBeCloseTo(0.5);
	});

	it('treats a missing usage entry as zero adaptiveness', () => {
		expect(cai(['GCT'], { GCC: 1 }, code)).toBe(0);
	});

	it('returns 1 when there are no eligible codons', () => {
		expect(cai([], {}, code)).toBe(1);
		expect(cai(['ATG', 'TGG', 'TAA'], {}, code)).toBe(1);
	});

	it('stays inside 0..1', () => {
		const value = cai(['GCT', 'TTC'], { GCT: 2, GCC: 1, TTC: 0.01, TTT: 1 }, code);
		expect(value).toBeGreaterThanOrEqual(0);
		expect(value).toBeLessThanOrEqual(1);
	});
});

describe('gcContent', () => {
	it('counts G/C over nucleotide letters only', () => {
		expect(gcContent('ATGC')).toBe(0.5);
		expect(gcContent('GGCC')).toBe(1);
		expect(gcContent('ATAT')).toBe(0);
		expect(gcContent('augc')).toBe(0.5);
		expect(gcContent('AT GC\n')).toBe(0.5);
		expect(gcContent('')).toBe(0);
	});
});

describe('rareCodons', () => {
	it('reports positions whose relative adaptiveness is below the threshold', () => {
		const rare = rareCodons(
			['GCT', 'GCC', 'ATG', 'TGG', 'TAA'],
			{ GCT: 0.05, GCC: 0.95, ATG: 1, TGG: 1, TAA: 1 },
			CODE
		);
		expect(rare).toHaveLength(1);
		expect(rare[0]).toMatchObject({ index: 0, position: 1, codon: 'GCT', aa: 'A' });
		expect(rare[0].relative).toBeCloseTo(0.05 / 0.95);
	});

	it('honours a custom threshold', () => {
		const usage = { GCT: 0.05, GCC: 0.95 };
		expect(rareCodons(['GCT'], usage, CODE, 0.01)).toEqual([]);
		expect(rareCodons(['GCT'], usage, CODE, 0.06)).toHaveLength(1);
	});

	it('excludes Met, Trp and stops', () => {
		expect(rareCodons(['ATG', 'TGG', 'TAA'], { ATG: 1, TGG: 1, TAA: 1 }, CODE)).toEqual([]);
	});

	it('treats a missing usage entry as a zero-frequency codon', () => {
		const rare = rareCodons(['GCT'], { GCC: 0.9 }, CODE);
		expect(rare).toHaveLength(1);
		expect(rare[0].relative).toBe(0);
	});

	it('does nothing when the family has no usage information at all', () => {
		expect(rareCodons(['GCT'], {}, CODE)).toEqual([]);
	});
});

describe('codonUsageFromRow', () => {
	it('reads and normalizes a single-species top-level map', () => {
		const row = {
			id: 'cu_1',
			source: 'Kazusa',
			selectionMode: 'relative_frequency',
			taxonId: 9606,
			codonMap: {
				GCT: 0.5,
				gcc: '0.5',
				GCA: { frequency: 0.1 },
				GCG: { value: '0.2' },
				GCU: '12%',
				XXX: 1
			}
		} as unknown as CodonUsageRow;
		expect(codonUsageFromRow(row)).toEqual({ GCT: 0.5, GCC: 0.5, GCA: 0.1, GCG: 0.2 });
		expect(codonUsageFromRow(row, 9606)).toEqual({ GCT: 0.5, GCC: 0.5, GCA: 0.1, GCG: 0.2 });
		expect(codonUsageFromRow(row, 10090)).toEqual({});
	});

	it('selects the requested species from a multi-species row', () => {
		const row = {
			id: 'cu_multi',
			source: 'Kazusa',
			selectionMode: 'relative_frequency',
			snapshotKind: 'multi',
			species: [
				{ taxonId: 1, codonMap: { GCU: 1, GCT: 0.5 } },
				{ taxonId: 2, codonMap: { GCC: { frequency: '0.7' } } }
			]
		} as unknown as CodonUsageRow;
		expect(codonUsageFromRow(row, 1)).toEqual({ GCT: 1 });
		expect(codonUsageFromRow(row, 2)).toEqual({ GCC: 0.7 });
		expect(codonUsageFromRow(row, 3)).toEqual({});
		expect(codonUsageFromRow(row)).toEqual({ GCT: 1 });
	});

	it('accepts an RNA-spelled table and returns DNA-spelled keys', () => {
		const row = {
			id: 'cu_rna',
			source: 'Kazusa',
			selectionMode: 'relative_frequency',
			codonMap: { GCU: 0.5, GCC: 0.5 }
		} as unknown as CodonUsageRow;
		expect(codonUsageFromRow(row)).toEqual({ GCT: 0.5, GCC: 0.5 });
	});

	it('uses the top-level map when a single-species row labels its species', () => {
		const row = {
			id: 'cu_single_species',
			source: 'Kazusa',
			selectionMode: 'relative_frequency',
			snapshotKind: 'single',
			species: [{ taxonId: 5, scientificName: 'Test species' }],
			codonMap: { GCT: 0.4 }
		} as unknown as CodonUsageRow;
		expect(codonUsageFromRow(row, 5)).toEqual({ GCT: 0.4 });
	});
});
