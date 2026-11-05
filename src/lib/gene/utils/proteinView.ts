/**
 * Protein-mode projections for the gene-viewer canvas family (round 9).
 * Pure mapping: stored annotation rows (0034) become viewer features with
 * stable colors; the GRAVY readout is the viewer's own display math over
 * source-asserted residues and is always labelled "(viewer)" where shown —
 * SPD never computes science, and neither does this file pretend to.
 */
import proteinAlphabet from '../../genome/data/proteinAlphabet';
import type { ProteinAnnotationRecord } from '../../api/types';

export interface ViewerGeneFeature {
	id: number;
	name: string;
	start: number;
	end: number;
	type: string;
	color: string;
	forward?: boolean;
	description?: string;
	residue?: string;
}

interface AlphabetEntry {
	hydrophobicity?: number;
	colorByFamily?: string;
	color?: string;
	mass?: number;
}

const ALPHABET = proteinAlphabet as Record<string, AlphabetEntry>;

/** Letter → family colour (TeselaGen proteinAlphabet `colorByFamily`). */
export const AA_FAMILY_COLORS: Record<string, string> = {};
/** Letter → chemistry colour (the hsl wheel entry `color`). */
export const AA_CHEM_COLORS: Record<string, string> = {};
for (const [letter, entry] of Object.entries(ALPHABET)) {
	if (typeof letter === 'string' && letter.length === 1) {
		if (entry?.colorByFamily) AA_FAMILY_COLORS[letter] = entry.colorByFamily;
		if (entry?.color) AA_CHEM_COLORS[letter] = entry.color;
	}
}

/** Unknown codes (X, and anything the alphabet lacks) stay the base color;
 * callers pass the canvas fallback. */
export function aaColor(letter: string, theme: 'aa_family' | 'aa_chem'): string | undefined {
	const table = theme === 'aa_family' ? AA_FAMILY_COLORS : AA_CHEM_COLORS;
	return table[letter.toUpperCase()];
}

/** Feature-track palette by UniProt FT code. Deterministic — the same type
 * colors the same block in every render of every record. */
export const FEATURE_TYPE_COLORS: Record<string, string> = {
	SIGNAL: '#f1c40f',
	TRANSIT: '#f39c12',
	PROPEP: '#e67e22',
	CHAIN: '#95a5a6',
	PEPTIDE: '#b2babb',
	DOMAIN: '#3498db',
	SUBDOMAIN: '#5dade2',
	MOTIF: '#48c9b0',
	REGION: '#aeb6bf',
	COMPBIAS: '#b3b6b7',
	ACT_SITE: '#e74c3c',
	BINDING_SITE: '#ec7063',
	SITE: '#f1948a',
	MOD_RES: '#9b59b6',
	CROSSLINK: '#8e44ad',
	DISULFID: '#2ecc71',
	CARBOHYD: '#d35400',
	LIPID: '#ba4a00',
	TRANSMEM: '#16a085',
	TOPO_DOM: '#1abc9c',
	INTRAMEM: '#76d7c4',
	DNA_BIND: '#2e86c1',
	RNA_BIND: '#5499c7',
	ZN_FING: '#7d3c98',
	COILED: '#34495e',
	HELIX: '#7f8c8d',
	STRAND: '#27ae60',
	TURN: '#8e44ad'
};

export const FEATURE_DEFAULT_COLOR = '#64748b';

/** The closed UniProt FT vocabulary the API accepts, in table order. */
export const PROTEIN_FEATURE_TYPES = Object.keys(FEATURE_TYPE_COLORS);

/** Map stored annotation rows to canvas features. Features UniProt left at
 * '?' (null coordinates) are reported as `unplaced` instead of invented
 * positions — the table below the viewer shows every row regardless. */
export function annotationsToViewerFeatures(
	rows: ProteinAnnotationRecord[],
	seqLength = Infinity
): { features: ViewerGeneFeature[]; unplaced: number } {
	const features: ViewerGeneFeature[] = [];
	let unplaced = 0;
	rows.forEach((row, index) => {
		const start = row.startPosition;
		const end = row.endPosition;
		if (start == null || end == null || start < 1 || end < start) {
			unplaced += 1;
			return;
		}
		const clampedEnd = Math.min(end, seqLength);
		if (clampedEnd < start) {
			// the row speaks of a range beyond the bytes we render (a newer
			// source sequence than this record); honest: do not draw it.
			unplaced += 1;
			return;
		}
		features.push({
			id: index + 1,
			name: row.featureType,
			start,
			end: clampedEnd,
			type: row.featureType,
			color: FEATURE_TYPE_COLORS[row.featureType] ?? FEATURE_DEFAULT_COLOR,
			forward: true,
			...(row.description ? { description: row.description } : {}),
			...(row.residue ? { residue: row.residue } : {})
		});
	});
	return { features, unplaced };
}

/** GRAVY over the residues the alphabet recognizes (average Kyte–Doolittle
 * style hydropathy). Display math, viewer-labelled at every call site. */
export function gravy(sequence: string): number | null {
	const values: number[] = [];
	for (const ch of sequence.toUpperCase()) {
		const entry = ALPHABET[ch];
		if (entry && typeof entry.hydrophobicity === 'number') values.push(entry.hydrophobicity);
	}
	if (values.length === 0) return null;
	return values.reduce((a, b) => a + b, 0) / values.length;
}
