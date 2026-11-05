/**
 * Render a whole sequence with the same canvas painter the interactive
 * DnaViewer uses, and return it as PNG data URLs for the printable record.
 *
 * The viewer virtualises rows and only paints what is on screen, so a print
 * page cannot screenshot it. This module rebuilds the same rows, applies the
 * same row-height rules, and tiles them into page-sized images.
 */
import { BIOMOLECULE_CHARS } from '$lib/format';
import {
	CHAR_W,
	BLOCK_SIZE,
	LEFT_MARGIN,
	RIGHT_MARGIN,
	getAnnotationLabelHeight,
	getAnnotationStackHeight,
	drawSequenceRowOnCanvas
} from './utils/rowRender';

export type SequenceMode = 'dna' | 'rna' | 'protein';

export interface SequenceViewFeature {
	id: number;
	name: string;
	start: number;
	end: number;
	type: string;
	color: string;
	forward?: boolean;
	description?: string;
}

export interface RenderSequenceOptions {
	sequence: string;
	mode?: SequenceMode;
	features?: SequenceViewFeature[];
	colorTheme?: string;
	/** CSS width used to lay out bases; images are rendered at 2× this. */
	width?: number;
}

const SCALE = 2;
const ROW_GAP = 8;
const MAX_CHUNK_HEIGHT = 900;

function normalizeSequence(raw: string, mode: SequenceMode): string {
	const text = (raw ?? '').toUpperCase();
	if (mode === 'protein') {
		return text.replace(new RegExp(`[^${BIOMOLECULE_CHARS}*]`, 'g'), '');
	}
	if (mode === 'rna') return text.replace(/[^ACGURYSWKMBDHVN]/g, '');
	return text.replace(/[^ACGTRYSWKMBDHVN]/g, '');
}

function buildRows(dna: string, basesPerRow: number) {
	const rows: Array<{
		rowIdx: number;
		start: number;
		end: number;
		blocks: Array<{ blockIdx: number; bases: string[]; startPos: number }>;
	}> = [];
	for (let i = 0; i < dna.length; i += basesPerRow) {
		const rowSeq = dna.slice(i, i + basesPerRow);
		const rowStart = i + 1;
		const rowEnd = Math.min(i + basesPerRow, dna.length);
		const blocks = [];
		for (let j = 0; j < rowSeq.length; j += BLOCK_SIZE) {
			blocks.push({
				blockIdx: j / BLOCK_SIZE,
				bases: rowSeq.slice(j, j + BLOCK_SIZE).split(''),
				startPos: rowStart + j
			});
		}
		rows.push({ rowIdx: i / basesPerRow, start: rowStart, end: rowEnd, blocks });
	}
	return rows;
}

function rowHeight(
	row: { start: number; end: number },
	features: SequenceViewFeature[],
	singleStrand: boolean
) {
	let h = 8;
	h += 22 + 4; // ruler + gap
	h += singleStrand ? 24 : 52;
	const rowFeatures = features.filter((f) => !(f.end < row.start || f.start > row.end));
	if (rowFeatures.length) {
		h += getAnnotationLabelHeight(rowFeatures, row);
		h += getAnnotationStackHeight(rowFeatures) + 5;
	}
	return h + 8;
}

/**
 * Draw every row into its own canvas (the painter clears its whole canvas),
 * then compose page-sized tiles. Features keep their real coordinates, so
 * each tile's ruler starts where the previous one ended.
 */
export function renderSequenceImages(options: RenderSequenceOptions): string[] {
	if (typeof document === 'undefined') return [];

	const mode = options.mode ?? 'dna';
	const dna = normalizeSequence(options.sequence, mode);
	if (!dna) return [];

	const width = options.width ?? 1000;
	const singleStrand = mode !== 'dna';
	const step = CHAR_W * BLOCK_SIZE;
	const maxBlocks = Math.max(2, Math.floor((width - LEFT_MARGIN - RIGHT_MARGIN) / step));
	const raw = Math.max(20, maxBlocks * BLOCK_SIZE);
	const basesPerRow = mode === 'dna' ? Math.floor(raw / 3) * 3 : raw;

	const features = (options.features ?? []).filter(
		(f) => Number.isFinite(f.start) && Number.isFinite(f.end) && f.start >= 1 && f.end >= f.start
	);

	const rows = buildRows(dna, basesPerRow);
	const laidOut = rows.map((row) => {
		const height = rowHeight(row, features, singleStrand);
		return { row, height };
	});

	// Tile rows into images that fit comfortably on an A4 page.
	const chunks: Array<typeof laidOut> = [];
	let current: typeof laidOut = [];
	let currentHeight = 0;
	for (const item of laidOut) {
		if (current.length && currentHeight + item.height + ROW_GAP > MAX_CHUNK_HEIGHT) {
			chunks.push(current);
			current = [];
			currentHeight = 0;
		}
		current.push(item);
		currentHeight += item.height + ROW_GAP;
	}
	if (current.length) chunks.push(current);

	const images: string[] = [];
	for (const chunk of chunks) {
		const chunkHeight = chunk.reduce((sum, item) => sum + item.height + ROW_GAP, 0);
		const out = document.createElement('canvas');
		out.width = Math.round(width * SCALE);
		out.height = Math.round(chunkHeight * SCALE);
		const outCtx = out.getContext('2d');
		if (!outCtx) continue;
		outCtx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
		outCtx.fillStyle = '#ffffff';
		outCtx.fillRect(0, 0, width, chunkHeight);

		let y = 0;
		for (const { row, height } of chunk) {
			const rowCanvas = document.createElement('canvas');
			rowCanvas.width = Math.round(width * SCALE);
			rowCanvas.height = Math.round(height * SCALE);
			const rowCtx = rowCanvas.getContext('2d');
			if (rowCtx) {
				rowCtx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
				drawSequenceRowOnCanvas(rowCtx, {
					row,
					dna,
					showEnzymes: false,
					showFeatures: features.length > 0,
					showTranslations: false,
					restrictionSites: [],
					geneFeatures: features,
					parts: [],
					primers: [],
					selectionStart: 1,
					selectionEnd: 1,
					containerWidth: width,
					hoveredFeatureId: null,
					dpr: SCALE,
					showSingleStrand: singleStrand,
					colorTheme: options.colorTheme ?? 'monochrome'
				});
				outCtx.drawImage(rowCanvas, 0, y, width, height);
			}
			y += height + ROW_GAP;
		}

		images.push(out.toDataURL('image/png'));
	}

	return images;
}

const FEATURE_COLORS: Record<string, string> = {
	cds: '#2563eb',
	exon: '#2563eb',
	gene: '#0f766e',
	promoter: '#dc2626',
	enhancer: '#dc2626',
	operator: '#dc2626',
	'5utr': '#7c3aed',
	'3utr': '#7c3aed',
	utr: '#7c3aed'
};

export function featureColor(type: string | null | undefined): string {
	const key = String(type ?? '')
		.toLowerCase()
		.replace(/[-_]/g, '');
	return FEATURE_COLORS[key] ?? '#7c3aed';
}
