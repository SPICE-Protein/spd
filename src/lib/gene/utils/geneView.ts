/**
 * Gene-region projections for the gene page viewer tracks (round 12).
 * Pure mapping: stored `gene_regions` rows (migration 0038) become viewer
 * features with stable colors. A region without BOTH endpoints, or one that
 * reaches past the asserted sequence, is reported as `unplaced` and never
 * invented onto the canvas — an editorially shortened sequence strands its
 * old evidence rows (§53 doctrine); the table still shows them, with a badge.
 * The lowercase region_type vocabulary is what the viewer's shape table
 * already keys on (cds/exon → arrow, promoter/… → promoter shape).
 */
import type { GeneRegionRow } from '../../api/types';
import type { ViewerGeneFeature } from './proteinView';

/** region_type → track colour. One deterministic hue per vocabulary value:
 * the same kind of region colors the same block on every record. */
export const REGION_TYPE_COLORS: Record<string, string> = {
	promoter: '#f1c40f',
	operator: '#e67e22',
	enhancer: '#d35400',
	silencer: '#9b59b6',
	tata_box: '#c0392b',
	caat_signal: '#a04000',
	terminator: '#2ecc71',
	origin: '#7f8c8d',
	exon: '#3498db',
	intron: '#5dade2',
	five_prime_utr: '#48c9b0',
	three_prime_utr: '#1abc9c',
	cds: '#e74c3c',
	rnase_site: '#8e44ad',
	other: '#64748b'
};

export const REGION_DEFAULT_COLOR = '#64748b';

/** Map one molecule's region rows to canvas features over the sequence the
 * page renders. Rows of the other molecule are filtered out by the caller —
 * coordinates live per molecule, and mixing tracks would be the lie. */
export function regionsToViewerFeatures(
	rows: GeneRegionRow[],
	seqLength: number
): { features: ViewerGeneFeature[]; unplaced: GeneRegionRow[] } {
	const features: ViewerGeneFeature[] = [];
	const unplaced: GeneRegionRow[] = [];
	rows.forEach((row, index) => {
		const start = row.startPosition;
		const end = row.endPosition;
		if (start == null || end == null || start < 1 || end < start || end > seqLength) {
			// open-ended assertion or stranded by a shortened sequence:
			// honest reads "unplaced", never a guessed bar
			unplaced.push(row);
			return;
		}
		features.push({
			id: index + 1,
			name: row.description,
			start,
			end,
			type: row.regionType,
			color: REGION_TYPE_COLORS[row.regionType] ?? REGION_DEFAULT_COLOR,
			// only an explicit reverse strand flips the arrow; absent/unknown
			// keeps the viewer's default reading instead of inventing a claim
			forward: row.strand !== 'reverse',
			description: row.description
		});
	});
	return { features, unplaced };
}

// ------------------------------------------------------------- site scan ----

/** IUPAC letter → regex class. Anything outside this table is not a letter
 * the catalog claims to be nucleotides, so that cutter is skipped — loudly
 * enough by omission (the table keeps showing the row). */
const IUPAC_CLASS: Record<string, string> = {
	A: 'A', C: 'C', G: 'G', T: 'T',
	R: '[AG]', Y: '[CT]', W: '[AT]', S: '[GC]', K: '[GT]', M: '[AC]',
	B: '[CGT]', D: '[AGT]', H: '[ACT]', V: '[ACG]', N: '[ACGT]'
};

const COMPLEMENT: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C', R: 'Y', Y: 'R', W: 'S', S: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D', N: 'N' };

export interface ScannedSite {
	name: string;
	/** 1-based position of the scissor point on the shown strand */
	pos: number;
	seq: string;
	color: string;
}

/** Marker offset in a cutPosition like `G^AATTC` / `G/AATTC` / `GAATTC/6`.
 * We take the count of non-marker letters before the FIRST marker — that is
 * the cut's offset from the site's 5' end on its own strand. No marker (or a
 * shape we cannot read) falls back to the site center: a display estimate,
 * never a claim. */
export function cutOffset(cutPosition: string, siteLen: number): number {
	const first = cutPosition.search(/[/|^]/);
	if (first < 0) return Math.floor(siteLen / 2);
	let letters = 0;
	for (const ch of cutPosition.slice(0, first)) if (ch !== '/' && ch !== '|' && ch !== '^') letters++;
	return letters;
}

function toRegex(pattern: string): RegExp | null {
	let body = '';
	for (const ch of pattern.toUpperCase()) {
		const cls = IUPAC_CLASS[ch];
		if (!cls) return null;
		body += cls;
	}
	if (!body) return null;
	return new RegExp(body, 'g');
}

const SITE_PALETTE = ['#8b96b5', '#7c9cbf', '#9b8bb5', '#8bb59e', '#b5a08b', '#8bb0b5'];
function siteColor(name: string): string {
	let h = 0;
	for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % SITE_PALETTE.length;
	return SITE_PALETTE[h];
}

/**
 * Where the catalog's DNA cutters land on this asserted sequence. This is
 * viewer display math (like GC% and the translation rail): the page scans
 * the letters it was given and marks what matches — SPD stores no site
 * positions, and only DNA cutters (§56 `targetMolecule === 'dna'`) are ever
 * handed to a DNA track. Overlapping matches are kept; a cutter whose
 * recognition site is not pure IUPAC letters is skipped.
 */
export function scanDnaSites(
	seq: string,
	cutters: Array<{ name: string; recognitionSite?: unknown; cutPosition?: unknown }>,
	max = 600
): ScannedSite[] {
	const s = seq.toUpperCase();
	const out: ScannedSite[] = [];
	const seen = new Set<string>();
	for (const c of cutters) {
		const pattern = String(c.recognitionSite ?? '').toUpperCase();
		const re = pattern ? toRegex(pattern) : null;
		if (!re) continue;
		const rcPattern = [...pattern].reverse().map((ch) => COMPLEMENT[ch] ?? '?').join('');
		if (rcPattern.includes('?')) continue;
		const len = pattern.length;
		const offset = cutOffset(String(c.cutPosition ?? ''), len);
		const scan = (regex: RegExp, onRc: boolean) => {
			regex.lastIndex = 0;
			let m: RegExpExecArray | null;
			while ((m = regex.exec(s)) && out.length < max) {
				const cutTop = onRc ? m.index + (len - offset) : m.index + offset;
				const key = `${c.name}:${cutTop}`;
				if (!seen.has(key) && cutTop >= 0 && cutTop <= s.length) {
					seen.add(key);
					out.push({ name: c.name, pos: cutTop + 1, seq: pattern, color: siteColor(c.name) });
				}
				regex.lastIndex = m.index + 1;
			}
		};
		const rcRe = toRegex(rcPattern);
		scan(re, false);
		if (rcRe && rcPattern !== pattern) scan(rcRe, true);
	}
	return out.sort((a, b) => a.pos - b.pos);
}
