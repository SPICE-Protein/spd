/**
 * Codon optimization, kept pure so the workbench can re-run it on every
 * keystroke and the same functions can be unit-tested without a browser.
 *
 * One deliberate convention: every codon that leaves this module is
 * **DNA-spelled** (`GCT`, not `GCU`). Genetic-code tables and usage maps are
 * accepted in either spelling and folded together, because Kazusa exports and
 * community uploads disagree about U/T. Translation accepts DNA or RNA input
 * and only normalizes for lookup — it never rewrites the caller's string.
 */
import { AA3 } from './codons';
import type { CodonUsageRow } from './api/types';

export type CodonErrorCode =
	'empty' | 'length' | 'alphabet' | 'unknown_codon' | 'unknown_aa' | 'no_codon';

export interface CodonErrorDetails {
	/** 0-based character positions (alphabet) or codon/residue indices. */
	positions?: number[];
	/** offending letters or codons */
	letters?: string[];
}

/** A caller-facing failure with a stable code, so the UI can choose a message
 *  and a hint instead of pattern-matching an English exception string. */
export class CodonOptimizeError extends Error {
	readonly code: CodonErrorCode;
	readonly positions: number[];
	readonly letters: string[];

	constructor(code: CodonErrorCode, message: string, details: CodonErrorDetails = {}) {
		super(message);
		this.name = 'CodonOptimizeError';
		this.code = code;
		this.positions = details.positions ?? [];
		this.letters = details.letters ?? [];
	}
}

export interface OptimizeCodon {
	codon: string;
	aa: string;
	/** usage frequency for the chosen codon; null when the dataset has no entry */
	frequency: number | null;
	/** true when this position differs from the input codon (DNA input only) */
	changed: boolean;
}

export interface OptimizeMetrics {
	/** codon adaptation index of the output, 0..1 */
	cai: number;
	/** GC fraction of the output DNA, 0..1 */
	gc: number;
	/** output DNA length in nucleotides */
	length: number;
	/** number of output codons below the rare-codon threshold */
	rareCount: number;
}

export interface OptimizeResult {
	dna: string;
	protein: string;
	inputKind: 'dna' | 'protein';
	metrics: OptimizeMetrics;
	codons: OptimizeCodon[];
}

export interface RareCodon {
	/** 0-based codon index */
	index: number;
	/** 1-based position for display */
	position: number;
	codon: string;
	aa: string;
	/** f(codon) / max f for its synonymous family, 0..1 */
	relative: number;
}

export const DEFAULT_RARE_THRESHOLD = 0.1;

// --------------------------------------------------------------- internals ----

const CODON_RE = /^[ACGT]{3}$/;
const AA_LETTERS = new Set(Object.keys(AA3));

/** DNA spelling, uppercase, no whitespace. */
function canonicalCodon(raw: string): string {
	return String(raw ?? '')
		.trim()
		.toUpperCase()
		.replace(/U/g, 'T');
}

function normalizeDna(dna: string): string {
	return String(dna ?? '')
		.replace(/\s+/g, '')
		.toUpperCase();
}

/** Numbers arrive as JSON numbers, numeric strings, percent strings, or
 *  {frequency|value|usage} wrappers, exactly like the codon detail page. */
function toNumber(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string') {
		const raw = value.trim();
		const pct = raw.endsWith('%');
		const body = pct ? raw.slice(0, -1) : raw;
		const n = Number(body);
		return Number.isFinite(n) ? (pct ? n / 100 : n) : null;
	}
	if (value && typeof value === 'object') {
		const rec = value as Record<string, unknown>;
		for (const key of ['frequency', 'value', 'usage', 'rscu', 'relativeUsage']) {
			if (key in rec) {
				const n = toNumber(rec[key]);
				if (n !== null) return n;
			}
		}
	}
	return null;
}

/** codonToAa → Map in DNA spelling. Duplicate T/U spellings collapse. */
function codeMap(codonToAa: Record<string, string> | null | undefined): Map<string, string> {
	const map = new Map<string, string>();
	for (const [rawCodon, rawAa] of Object.entries(codonToAa ?? {})) {
		const codon = canonicalCodon(rawCodon);
		if (!CODON_RE.test(codon)) continue;
		let aa = String(rawAa ?? '')
			.trim()
			.toUpperCase();
		if (!aa) continue;
		if (aa === 'STOP' || aa === 'TER' || aa === 'TERM') aa = '*';
		map.set(codon, aa);
	}
	return map;
}

/** usage (any spelling) → Map in DNA spelling. */
function usageMap(usage: Record<string, number> | null | undefined): Map<string, number> {
	const map = new Map<string, number>();
	for (const [rawCodon, rawValue] of Object.entries(usage ?? {})) {
		const codon = canonicalCodon(rawCodon);
		if (!CODON_RE.test(codon)) continue;
		const n = toNumber(rawValue);
		if (n === null) continue;
		const previous = map.get(codon);
		map.set(codon, previous === undefined ? n : Math.max(previous, n));
	}
	return map;
}

function codonsFor(code: Map<string, string>, aa: string): string[] {
	const out: string[] = [];
	for (const [codon, residue] of code) {
		if (residue === aa) out.push(codon);
	}
	// ASCII sort, not localeCompare: tie-breaking must not depend on the
	// browser's locale.
	return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function maxFrequency(code: Map<string, string>, aa: string, usage: Map<string, number>): number {
	let max = 0;
	for (const codon of codonsFor(code, aa)) {
		const f = usage.get(codon) ?? 0;
		if (f > max) max = f;
	}
	return max;
}

function aaLabel(aa: string): string {
	return AA3[aa] ? `${aa} (${AA3[aa]})` : aa;
}

function bestCodon(aa: string, codons: string[], usage: Map<string, number>): OptimizeCodon {
	const ranked = [...codons].sort((a, b) => {
		const fa = usage.get(a) ?? 0;
		const fb = usage.get(b) ?? 0;
		if (fb !== fa) return fb - fa;
		return a < b ? -1 : a > b ? 1 : 0;
	});
	const codon = ranked[0];
	return {
		codon,
		aa,
		frequency: usage.has(codon) ? (usage.get(codon) as number) : null,
		changed: false
	};
}

function normalizeProtein(protein: string): string {
	return String(protein ?? '')
		.replace(/\s+/g, '')
		.toUpperCase();
}

/** A row can hold one map at the top level or one per species. Keys are
 *  folded to DNA spelling so downstream lookups agree with translation. */
function normalizeUsageRecord(raw: unknown): Record<string, number> {
	const out: Record<string, number> = {};
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
	for (const [rawCodon, rawValue] of Object.entries(raw as Record<string, unknown>)) {
		const codon = canonicalCodon(rawCodon);
		if (!CODON_RE.test(codon)) continue;
		const n = toNumber(rawValue);
		if (n === null) continue;
		// A T/U duplicate spelling names the same codon; keep the stronger
		// reading rather than letting object insertion order decide.
		const previous = out[codon];
		out[codon] = previous === undefined ? n : Math.max(previous, n);
	}
	return out;
}

// ------------------------------------------------------------------ public ----

/**
 * Translate a CDS. Input may be DNA (`ATGGCU`) or RNA (`AUGGCU`), with
 * whitespace/newlines; the result uses one-letter amino acids and `*` for a
 * stop. A terminal stop is explicitly allowed; an internal stop also comes
 * through as `*` so the UI can warn instead of refusing to translate.
 */
export function translateCds(dna: string, codonToAa: Record<string, string>): string {
	const seq = normalizeDna(dna);
	if (!seq) {
		throw new CodonOptimizeError('empty', 'No DNA sequence was provided');
	}

	if (!/^[ACGTU]+$/.test(seq)) {
		const letters = [...new Set([...seq].filter((ch) => !/[ACGTU]/.test(ch)))];
		const positions: number[] = [];
		for (let i = 0; i < seq.length; i++) {
			if (!/[ACGTU]/.test(seq[i])) positions.push(i);
		}
		throw new CodonOptimizeError('alphabet', `Non-nucleotide letter(s): ${letters.join(', ')}`, {
			letters,
			positions
		});
	}

	if (seq.length % 3 !== 0) {
		throw new CodonOptimizeError('length', `Sequence length ${seq.length} is not a multiple of 3`, {
			positions: [seq.length]
		});
	}

	const code = codeMap(codonToAa);
	const residues: string[] = [];
	const missingIndices: number[] = [];
	const missingCodons = new Set<string>();
	for (let i = 0; i < seq.length; i += 3) {
		const codon = canonicalCodon(seq.slice(i, i + 3));
		const aa = code.get(codon);
		if (aa === undefined) {
			missingIndices.push(i / 3);
			missingCodons.add(codon);
			continue;
		}
		residues.push(aa);
	}
	if (missingIndices.length) {
		throw new CodonOptimizeError(
			'unknown_codon',
			`Codon(s) not in this genetic code: ${[...missingCodons].join(', ')}`,
			{ positions: missingIndices, letters: [...missingCodons] }
		);
	}
	return residues.join('');
}

/**
 * For every residue pick the synonymous codon with the highest usage
 * frequency; ties go to the alphabetically first codon so two runs (and two
 * browsers) produce the same DNA. A terminal stop is appended unless the
 * protein already ends with `*`.
 */
export function optimizeProtein(
	protein: string,
	codonToAa: Record<string, string>,
	usage: Record<string, number>
): OptimizeResult {
	const code = codeMap(codonToAa);
	const frequencies = usageMap(usage);
	const seq = normalizeProtein(protein);
	if (!seq) {
		throw new CodonOptimizeError('empty', 'No protein sequence was provided');
	}

	const unknown: number[] = [];
	const unknownLetters = new Set<string>();
	for (let i = 0; i < seq.length; i++) {
		if (!AA_LETTERS.has(seq[i])) {
			unknown.push(i);
			unknownLetters.add(seq[i]);
		}
	}
	if (unknown.length) {
		throw new CodonOptimizeError(
			'unknown_aa',
			`Unknown amino-acid letter(s): ${[...unknownLetters].join(', ')}`,
			{ positions: unknown, letters: [...unknownLetters] }
		);
	}

	const chosen: OptimizeCodon[] = [];
	for (let i = 0; i < seq.length; i++) {
		const aa = seq[i];
		const synonyms = codonsFor(code, aa);
		if (!synonyms.length) {
			throw new CodonOptimizeError(
				'no_codon',
				`No codon in this genetic code maps to ${aaLabel(aa)}`,
				{ positions: [i], letters: [aa] }
			);
		}
		chosen.push(bestCodon(aa, synonyms, frequencies));
	}

	if (!seq.endsWith('*')) {
		const stops = codonsFor(code, '*');
		if (!stops.length) {
			throw new CodonOptimizeError('no_codon', 'This genetic code has no stop codon to append', {
				positions: [seq.length],
				letters: ['*']
			});
		}
		chosen.push(bestCodon('*', stops, frequencies));
	}

	const dna = chosen.map((c) => c.codon).join('');
	const codonStrings = chosen.map((c) => c.codon);
	return {
		dna,
		protein: seq,
		inputKind: 'protein',
		metrics: {
			cai: cai(codonStrings, usage, codonToAa),
			gc: gcContent(dna),
			length: dna.length,
			rareCount: rareCodons(codonStrings, usage, codonToAa).length
		},
		codons: chosen
	};
}

/** Translate a CDS and optimize it, marking which codons the optimizer
 *  changed. A stop codon appended to a CDS that lacked one is marked changed. */
export function optimizeCds(
	dna: string,
	codonToAa: Record<string, string>,
	usage: Record<string, number>
): OptimizeResult {
	const original = normalizeDna(dna);
	const protein = translateCds(original, codonToAa);
	const optimized = optimizeProtein(protein, codonToAa, usage);
	const originalCodons = original.match(/.{3}/g) ?? [];
	const codons = optimized.codons.map((item, i) => ({
		...item,
		changed: canonicalCodon(originalCodons[i] ?? '') !== item.codon
	}));
	return { ...optimized, protein, inputKind: 'dna', codons };
}

/**
 * Codon adaptation index: geometric mean of f(codon)/max f for synonymous
 * codons, excluding Met, Trp and stops. A family with no usage information is
 * skipped (there is no denominator); if nothing is eligible the result is 1.
 */
export function cai(
	codons: string[],
	usage: Record<string, number>,
	codonToAa: Record<string, string>
): number {
	const code = codeMap(codonToAa);
	const frequencies = usageMap(usage);
	const ratios: number[] = [];

	for (const raw of codons ?? []) {
		const codon = canonicalCodon(raw);
		const aa = code.get(codon);
		if (aa === undefined || aa === '*' || aa === 'M' || aa === 'W') continue;
		const max = maxFrequency(code, aa, frequencies);
		if (max <= 0) continue;
		const f = frequencies.get(codon) ?? 0;
		ratios.push(Math.min(1, Math.max(0, f / max)));
	}

	if (!ratios.length) return 1;
	if (ratios.some((r) => r <= 0)) return 0;
	const meanLog = ratios.reduce((sum, r) => sum + Math.log(r), 0) / ratios.length;
	return Math.exp(meanLog);
}

/** Fraction of G/C among nucleotide letters; whitespace and other characters
 *  are ignored so a wrapped sequence gives the same answer. */
export function gcContent(dna: string): number {
	let gc = 0;
	let total = 0;
	for (const ch of String(dna ?? '').toUpperCase()) {
		if (ch === 'G' || ch === 'C') {
			gc++;
			total++;
		} else if (ch === 'A' || ch === 'T' || ch === 'U') {
			total++;
		}
	}
	return total ? gc / total : 0;
}

/** Codons whose relative adaptiveness is below `threshold`. Met, Trp and
 *  stops are excluded; a codon with no usage entry counts as 0 (unknown is
 *  reported separately by the workbench). */
export function rareCodons(
	codons: string[],
	usage: Record<string, number>,
	codonToAa: Record<string, string>,
	threshold = DEFAULT_RARE_THRESHOLD
): RareCodon[] {
	const code = codeMap(codonToAa);
	const frequencies = usageMap(usage);
	const out: RareCodon[] = [];

	for (let i = 0; i < (codons ?? []).length; i++) {
		const codon = canonicalCodon(codons[i]);
		const aa = code.get(codon);
		if (aa === undefined || aa === '*' || aa === 'M' || aa === 'W') continue;
		const max = maxFrequency(code, aa, frequencies);
		if (max <= 0) continue;
		const relative = Math.min(1, Math.max(0, (frequencies.get(codon) ?? 0) / max));
		if (relative < threshold) out.push({ index: i, position: i + 1, codon, aa, relative });
	}
	return out;
}

/**
 * Read the usage map out of a codon-usage snapshot. Single-species rows keep
 * one map at the top level; multi-species rows keep one per `species[]` entry.
 * When `taxonId` is supplied, only that species' map is returned — an unknown
 * taxon yields `{}` rather than silently borrowing another organism's table.
 */
export function codonUsageFromRow(row: CodonUsageRow, taxonId?: number): Record<string, number> {
	if (!row) return {};
	const wanted = taxonId != null && Number.isFinite(Number(taxonId)) ? Number(taxonId) : null;
	const species = Array.isArray(row.species) ? row.species : [];

	if (wanted !== null) {
		const match = species.find((sp) => Number(sp.taxonId) === wanted);
		if (match?.codonMap) return normalizeUsageRecord(match.codonMap);
		// A single-species row keeps its map at the top level; the species
		// entry is only a label, so the matching taxon may still resolve here.
		if (match && row.snapshotKind !== 'multi' && row.codonMap) {
			return normalizeUsageRecord(row.codonMap);
		}
		if (row.taxonId != null && Number(row.taxonId) === wanted) {
			return normalizeUsageRecord(row.codonMap);
		}
		return {};
	}

	if (row.snapshotKind !== 'multi' && row.codonMap) {
		return normalizeUsageRecord(row.codonMap);
	}
	const firstSpeciesMap = species.find((sp) => sp.codonMap);
	if (firstSpeciesMap?.codonMap) return normalizeUsageRecord(firstSpeciesMap.codonMap);
	return normalizeUsageRecord(row.codonMap);
}
