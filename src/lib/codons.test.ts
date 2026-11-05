import { describe, expect, it } from 'vitest';
import { AA_GROUPS, aaGroupsFor, aaStats, codonToAaFor, expectedSum, nonStandardCodons, parseCodonTable } from './codons';

describe('codon table parser', () => {
	it('pairs every codon with the number that follows it, across layouts', () => {
		const text = [
			'# comment',
			'Codon\tFrequency\tAA',
			'Ala\tGCT\t0.05',
			'Ala\tGCC\t0.30',
			'Ser TCA 0.12 AGU 0.30',
			'GCT,0.05',
			'gct = 0.05'
		].join('\n');
		const p = parseCodonTable(text);
		expect(p.map).toEqual({ GCT: 0.05, GCC: 0.3, TCA: 0.12, AGU: 0.3 });
		expect(p.bad).toEqual([]);
		// the repeated GCT rows are surfaced rather than silently merged
		expect(p.duplicates.sort()).toEqual(['GCT']);
	});

	it('normalizes percent tokens', () => {
		const p = parseCodonTable('Trp TGG 100%\nSer TCA 12%');
		expect(p.map).toEqual({ TGG: 1, TCA: 0.12 });
	});

	it('skips header rows but reports a number that lost its codon', () => {
		const p = parseCodonTable('Codon Frequency Percent\nXX\t0.50\nATG 1');
		expect(p.map).toEqual({ ATG: 1 });
		expect(p.bad).toEqual(['XX\t0.50']);
	});

	it('reads JSON objects, wrappers, and {codon,value} arrays', () => {
		expect(parseCodonTable('{"GCT": 0.5, "GCC": "0.5"}').map).toEqual({ GCT: 0.5, GCC: 0.5 });
		expect(parseCodonTable('{"codon_map": {"GCT": 0.5}}').map).toEqual({ GCT: 0.5 });
		expect(
			parseCodonTable('[{"codon":"GCT","frequency":0.5},{"codon":"gcc","value":"50%"}]').map
		).toEqual({
			GCT: 0.5,
			GCC: 0.5
		});
		expect(parseCodonTable('{not json').jsonError).not.toBe('');
	});

	it('keeps RNA spellings as written', () => {
		expect(parseCodonTable('GCU 1.0').map).toEqual({ GCU: 1 });
	});

	it('surfaces keys outside the standard code', () => {
		expect(nonStandardCodons({ GCT: 1, TGA: 0.5, XAA: 0.2 })).toEqual(['XAA']);
	});

	it('groups totals by the standard code', () => {
		const s = aaStats({ GCT: 0.5, GCC: 0.5 });
		const ala = s.find((x) => x.aa3 === 'Ala');
		expect(ala).toMatchObject({ found: 2, codons: 4, sum: 1 });
	});

	it('groups an RNA-spelled table with its DNA twins', () => {
		const s = aaStats({ GCU: 1, AGU: 0.5, UGG: 1 });
		expect(s.find((x) => x.aa3 === 'Ala')).toMatchObject({ found: 1, sum: 1 });
		expect(s.find((x) => x.aa3 === 'Ser')).toMatchObject({ found: 1, sum: 0.5 });
		expect(s.find((x) => x.aa3 === 'Trp')).toMatchObject({ found: 1, sum: 1 });
		expect(nonStandardCodons({ GCU: 1, AGU: 0.5, XAA: 0.1 })).toEqual(['XAA']);
	});

	it('renders any genetic code from its own codon→amino-acid table', () => {
		const code = codonToAaFor(AA_GROUPS);
		// vertebrate mitochondrial code: AGA/AGG stop, ATA Met, TGA Trp
		code.AGA = '*';
		code.AGG = '*';
		code.ATA = 'M';
		code.TGA = 'W';
		const groups = aaGroupsFor(code);
		expect(groups.find((g) => g.aa === '*')?.codons).toEqual(expect.arrayContaining(['AGA', 'AGG']));
		expect(groups.find((g) => g.aa === 'M')?.codons).toEqual(expect.arrayContaining(['ATA']));
		expect(groups.find((g) => g.aa === 'W')?.codons).toEqual(expect.arrayContaining(['TGA']));
		// the standard table is not mutated just because a caller built a variant
		expect(groups.find((g) => g.aa === '*')?.codons).not.toContain('TGA');
	});

	it('keeps an unknown amino-acid letter instead of dropping its codons', () => {
		const groups = aaGroupsFor({ GCT: 'A', TGA: 'X' });
		expect(groups.find((g) => g.aa === 'X')?.codons).toEqual(['TGA']);
		expect(groups.find((g) => g.aa === 'A')?.codons).toEqual(['GCT']);
	});

	it('expects totals per reading', () => {
		expect(expectedSum('relative_frequency', 6)).toBe(1);
		expect(expectedSum('rscu', 6)).toBe(6);
		expect(expectedSum('optimal_set', 6)).toBeNull();
		expect(expectedSum('other', 6)).toBeNull();
	});
});
