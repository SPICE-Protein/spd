/**
 * Standard genetic code (NCBI table 1) plus a forgiving codon-table parser.
 *
 * Contributors get these tables from Kazusa, a paper's supplementary sheet, or
 * an Excel export — none of which agree on layout. Rather than demand one
 * rigid line format, the parser pairs **every codon-shaped token with the
 * first number that follows it**, so all of these work:
 *
 *   GCT 0.05                    (one pair per line)
 *   Ala GCT 0.05 GCC 0.30       (Kazusa column-per-amino-acid row)
 *   "GCT","0.05"   GCT=0.05     (CSV / key=value / tab separated)
 *   GCT 5%                      (percent is normalized to 0.05)
 *   {"GCT": 0.05, ...}          (JSON object, also codon_map/codonMap wrapper,
 *                                or an array of {codon, value|frequency|usage})
 *
 * Header rows and column-title lines carry no numbers, so they are skipped
 * silently instead of being reported as errors. A line with a number but no
 * codon is a typo and IS reported — never dropped in silence.
 */

export type CodonMap = Record<string, number>;

const CODON_RE = /^[ACGTU]{3}$/;
const SPLIT = /[\s,;:=|\t]+/;

/** Amino acids in the reading order a bench scientist expects, stop last. */
export interface AaGroup {
	aa: string;
	aa3: string;
	codons: string[];
}

/** Amino-acid names for one-letter codes, including the two recoded residues. */
export const AA3: Record<string, string> = {
	A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', Q: 'Gln', E: 'Glu',
	G: 'Gly', H: 'His', I: 'Ile', L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe',
	P: 'Pro', S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val',
	U: 'Sec', O: 'Pyl', '*': 'Stop'
};

/** Display order a bench scientist expects; stop last. */
const AA_ORDER = ['G', 'A', 'V', 'L', 'F', 'P', 'S', 'T', 'W', 'Y', 'Q', 'H', 'N', 'K', 'D', 'E', 'C', 'M', 'R', 'I', 'U', 'O', '*'];

export const AA_GROUPS: AaGroup[] = [
	{ aa: 'G', aa3: 'Gly', codons: ['GGT', 'GGC', 'GGA', 'GGG'] },
	{ aa: 'A', aa3: 'Ala', codons: ['GCT', 'GCC', 'GCA', 'GCG'] },
	{ aa: 'V', aa3: 'Val', codons: ['GTT', 'GTC', 'GTA', 'GTG'] },
	{ aa: 'L', aa3: 'Leu', codons: ['TTA', 'TTG', 'CTT', 'CTC', 'CTA', 'CTG'] },
	{ aa: 'F', aa3: 'Phe', codons: ['TTT', 'TTC'] },
	{ aa: 'P', aa3: 'Pro', codons: ['CCT', 'CCC', 'CCA', 'CCG'] },
	{ aa: 'S', aa3: 'Ser', codons: ['TCT', 'TCC', 'TCA', 'TCG', 'AGT', 'AGC'] },
	{ aa: 'T', aa3: 'Thr', codons: ['ACT', 'ACC', 'ACA', 'ACG'] },
	{ aa: 'W', aa3: 'Trp', codons: ['TGG'] },
	{ aa: 'Y', aa3: 'Tyr', codons: ['TAT', 'TAC'] },
	{ aa: 'Q', aa3: 'Gln', codons: ['CAA', 'CAG'] },
	{ aa: 'H', aa3: 'His', codons: ['CAT', 'CAC'] },
	{ aa: 'N', aa3: 'Asn', codons: ['AAT', 'AAC'] },
	{ aa: 'K', aa3: 'Lys', codons: ['AAA', 'AAG'] },
	{ aa: 'D', aa3: 'Asp', codons: ['GAT', 'GAC'] },
	{ aa: 'E', aa3: 'Glu', codons: ['GAA', 'GAG'] },
	{ aa: 'C', aa3: 'Cys', codons: ['TGT', 'TGC'] },
	{ aa: 'M', aa3: 'Met', codons: ['ATG'] },
	{ aa: 'R', aa3: 'Arg', codons: ['CGT', 'CGC', 'CGA', 'CGG', 'AGA', 'AGG'] },
	{ aa: 'I', aa3: 'Ile', codons: ['ATT', 'ATC', 'ATA'] },
	{ aa: '*', aa3: 'Stop', codons: ['TAA', 'TAG', 'TGA'] }
];

export const CODON_TO_AA: Record<string, string> = Object.fromEntries(
	AA_GROUPS.flatMap((g) => g.codons.map((c) => [c, g.aa] as [string, string]))
);

export const ALL_CODONS: ReadonlySet<string> = new Set(Object.keys(CODON_TO_AA));

/** The standard table's codon order, reused to keep every code's display stable. */
const CODON_ORDER: string[] = AA_GROUPS.flatMap((g) => g.codons);
const CODON_RANK = new Map(CODON_ORDER.map((c, i) => [c, i]));

/**
 * Group a codon→amino-acid map by amino acid. Genetic code tables are data,
 * not a hard-coded table 1: the standard code, the vertebrate mitochondrial
 * code (AGA/AGG = stop, ATA = Met) and every other NCBI table render from the
 * same function. Codons the order does not know sort last, never dropped.
 */
export function aaGroupsFor(codeToAa: Record<string, string> | null | undefined): AaGroup[] {
	if (!codeToAa || !Object.keys(codeToAa).length) return AA_GROUPS;
	const byAa = new Map<string, string[]>();
	for (const [codon, aa] of Object.entries(codeToAa)) {
		const key = String(aa ?? '').trim().toUpperCase();
		if (!/^[ACGTU]{3}$/i.test(codon) || !key) continue;
		const list = byAa.get(key) ?? [];
		list.push(codon.toUpperCase());
		byAa.set(key, list);
	}
	const order = [...AA_ORDER, ...[...byAa.keys()].filter((aa) => !AA_ORDER.includes(aa))];
	return order
		.filter((aa) => byAa.has(aa))
		.map((aa) => ({
			aa,
			aa3: AA3[aa] ?? aa,
			codons: (byAa.get(aa) ?? []).sort(
				(a, b) => (CODON_RANK.get(a) ?? 9999) - (CODON_RANK.get(b) ?? 9999)
			)
		}));
}

/** Flatten any grouping back to codon→amino acid. */
export function codonToAaFor(groups: AaGroup[]): Record<string, string> {
	return Object.fromEntries(groups.flatMap((g) => g.codons.map((c) => [c, g.aa] as [string, string])));
}

/**
 * A table row can carry more than one reading of the same codon (duplicated
 * rows, or two columns that name it twice). Last one wins and the count is
 * surfaced, because a silent overwrite is how a wrong number survives review.
 */
export interface ParseResult {
	map: CodonMap;
	/** original lines that carried a number but no recognizable codon */
	bad: string[];
	/** codons seen more than once */
	duplicates: string[];
	/** true when the text looked like JSON but could not be read as a table */
	jsonError: string;
}

function toNum(tok: string | undefined | null): number | null {
	if (tok == null) return null;
	const raw = tok.trim();
	if (!raw) return null;
	const pct = /%$/.test(raw);
	const body = pct ? raw.slice(0, -1) : raw;
	if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(body)) return null;
	const n = Number(body) / (pct ? 100 : 1);
	return Number.isFinite(n) ? n : null;
}

function isCodon(tok: string | undefined): tok is string {
	return typeof tok === 'string' && CODON_RE.test(tok.toUpperCase());
}

function put(map: CodonMap, dup: string[], codon: string, value: number) {
	const key = codon.toUpperCase();
	if (map[key] !== undefined && !dup.includes(key)) dup.push(key);
	map[key] = value;
}

/** Numbers arrive as JSON numbers, as strings, and as percent strings. */
function coerce(v: unknown): number | null {
	if (typeof v === 'number') return Number.isFinite(v) ? v : null;
	if (typeof v === 'string') return toNum(v);
	if (v && typeof v === 'object') {
		const rec = v as Record<string, unknown>;
		for (const k of ['frequency', 'value', 'usage', 'rscu', 'relativeUsage']) {
			const c = coerce(rec[k]);
			if (c !== null) return c;
		}
	}
	return null;
}

function parseJson(src: string, out: ParseResult): void {
	let raw: unknown;
	try {
		raw = JSON.parse(src);
	} catch (e) {
		out.jsonError = e instanceof Error ? e.message : String(e);
		return;
	}
	const pairs: Array<[unknown, unknown]> = [];
	if (Array.isArray(raw)) {
		for (const it of raw) {
			const rec = (it ?? {}) as Record<string, unknown>;
			const key = rec.codon ?? rec.Codon ?? rec.name ?? rec.code;
			const val = rec.value ?? rec.frequency ?? rec.usage ?? rec.rscu ?? rec.relativeUsage;
			pairs.push([key, val]);
		}
	} else if (raw && typeof raw === 'object') {
		const rec = raw as Record<string, unknown>;
		const inner = rec.codon_map ?? rec.codonMap ?? rec.preferredCodons ?? rec.table ?? rec;
		if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
			for (const [k, v] of Object.entries(inner as Record<string, unknown>)) pairs.push([k, v]);
		} else {
			out.jsonError = 'expected an object of codon → number';
			return;
		}
	} else {
		out.jsonError = 'expected an object or an array';
		return;
	}
	for (const [k, v] of pairs) {
		const codon = typeof k === 'string' ? k.trim().toUpperCase() : '';
		const n = coerce(v);
		if (isCodon(codon) && n !== null) put(out.map, out.duplicates, codon, n);
		else out.bad.push(`${String(k)} ${String(v)}`.trim());
	}
}

export function parseCodonTable(text: string): ParseResult {
	const out: ParseResult = { map: {}, bad: [], duplicates: [], jsonError: '' };
	const src = (text ?? '').trim();
	if (!src) return out;
	if (src.startsWith('{') || src.startsWith('[')) {
		parseJson(src, out);
		return out;
	}
	for (const line of src.split(/\r?\n/)) {
		const l = line.trim();
		if (!l || l.startsWith('#') || l.startsWith('//')) continue;
		const toks = l.split(SPLIT).filter(Boolean);
		if (toks.length < 2) {
			// a lone codon or a lone number is not a table row; only call it out
			// when it looks like the contributor meant to write one
			if (isCodon(toks[0]) || toNum(toks[0]) !== null) out.bad.push(line);
			continue;
		}
		let seenCodon = false;
		let seenNumber = false;
		for (let i = 0; i < toks.length; i++) {
			if (!isCodon(toks[i])) {
				if (toNum(toks[i]) !== null) seenNumber = true;
				continue;
			}
			seenCodon = true;
			const codon = toks[i].toUpperCase();
			let n: number | null = null;
			for (let j = i + 1; j < toks.length; j++) {
				if (isCodon(toks[j])) break;
				const c = toNum(toks[j]);
				if (c !== null) {
					n = c;
					i = j; // consume the number so the next codon cannot reuse it
					break;
				}
			}
			if (n === null) continue; // codon named without a number (a header row)
			put(out.map, out.duplicates, codon, n);
		}
		if (!seenCodon && seenNumber) out.bad.push(line);
		if (!seenCodon && !seenNumber) continue; // column titles
	}
	return out;
}

/**
 * Tables are published in either spelling (DNA `GCT` or RNA `GCU`). Grouping
 * and display treat them as the same codon — but storage never rewrites what
 * the contributor wrote, so a U table and a T table stay two snapshots.
 */
export function rnaTwin(dnaCodon: string): string {
	return dnaCodon.replace(/T/g, 'U');
}

/** Value for a standard (DNA-spelled) codon, accepting its RNA twin. */
export function lookupCodon(map: CodonMap, dnaCodon: string): number | undefined {
	const direct = map[dnaCodon];
	if (direct !== undefined) return direct;
	return map[rnaTwin(dnaCodon)];
}

/** Keys written in RNA spelling — worth telling the contributor about. */
export function rnaSpellings(map: CodonMap): string[] {
	return Object.keys(map).filter((k) => k.includes('U'));
}

export interface AaStat {
	aa: string;
	aa3: string;
	codons: number;
	found: number;
	sum: number;
}

/** Per-amino-acid coverage + running total: where the table is complete,
 *  where it is thin, and whether the numbers behave like the chosen mode. */
export function aaStats(map: CodonMap, groups: AaGroup[] = AA_GROUPS): AaStat[] {
	return groups.map((g) => {
		let found = 0;
		let sum = 0;
		for (const c of g.codons) {
			const v = lookupCodon(map, c);
			if (v !== undefined) {
				found++;
				sum += v;
			}
		}
		return { aa: g.aa, aa3: g.aa3, codons: g.codons.length, found, sum };
	});
}

/** Codons in the map that the standard table does not know in either spelling
 *  (rare — e.g. a contributor spelling out a selenocysteine codon). Never
 *  dropped silently. */
export function nonStandardCodons(map: CodonMap, allowed: ReadonlySet<string> = ALL_CODONS): string[] {
	return Object.keys(map).filter((k) => !allowed.has(k.toUpperCase().replace(/U/g, 'T')));
}

export type CodonMode = 'relative_frequency' | 'rscu' | 'optimal_set' | 'other';

/** What one amino acid's values should add up to, per reading of the table.
 *  `null` = no expectation (an optimal-codon set carries weights). */
export function expectedSum(mode: CodonMode, codonsInGroup: number): number | null {
	if (mode === 'relative_frequency') return 1;
	if (mode === 'rscu') return codonsInGroup;
	return null;
}

export const CODON_MODES: CodonMode[] = ['relative_frequency', 'rscu', 'optimal_set', 'other'];

/** Trim a float to something a human can compare against an expectation. */
export function fmtSum(v: number): string {
	return String(Math.round(v * 1000) / 1000);
}
