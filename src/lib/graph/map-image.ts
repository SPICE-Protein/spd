/**
 * The map as a file: the same cards and rays the canvas draws, rendered into
 * a standalone SVG and optionally rasterised to PNG.
 *
 * This is a projection of the walk model, not a screenshot of the DOM. The
 * canvas is HTML inside transformed layers with web fonts and CSS variables,
 * none of which survives an image encoder faithfully; the map's own geometry
 * (a rectangle, two text lines, a straight ray) does, and it renders at any
 * scale without a capture dependency.
 */

import { enumLabel } from '$lib/i18n';
import { shortPublicId } from '$lib/format';
import type { ExportFormat } from '$lib/export/types';
import type { FlowGraph, MapNodeData } from './flow';
import { NODE_H, NODE_W, type WalkNode } from './walk';

export interface MapPalette {
	background: string;
	card: string;
	border: string;
	text: string;
	muted: string;
}

/** The dark theme's values, used when there is no document to ask. */
const FALLBACK: MapPalette = {
	background: '#0a0a0a',
	card: '#121212',
	border: '#2a2a2a',
	text: '#ededed',
	muted: '#9a9a9a'
};

/**
 * The theme states its colours in `oklch()` and gives some of them alpha (the
 * border is white at 10%), which an older SVG viewer may not understand.
 * Round-trip each value through a one-pixel canvas — the browser's own colour
 * parser — and composite it over the exported background, so the file holds
 * the colours as they appear on screen and nothing else has to parse them.
 */
function solid(value: string, backdrop: string): string {
	if (!value || typeof document === 'undefined') return value;
	const canvas = document.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext('2d');
	if (!ctx) return value;
	// A colour the parser rejects leaves fillStyle untouched, so a probe value
	// that no theme uses detects it.
	const probe = '#010203';
	ctx.fillStyle = probe;
	ctx.fillStyle = value;
	if (ctx.fillStyle === probe && value.trim().toLowerCase() !== probe) return value;
	ctx.fillStyle = backdrop;
	ctx.fillRect(0, 0, 1, 1);
	ctx.fillStyle = value;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	return `rgb(${r}, ${g}, ${b})`;
}

function cssVar(name: string, fallback: string, backdrop: string): string {
	if (typeof window === 'undefined') return fallback;
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return solid(value || fallback, backdrop);
}

export function readPalette(): MapPalette {
	// The background is the canvas everything else is composited onto, so it
	// comes first and has nothing behind it.
	const background = cssVar('--background', FALLBACK.background, '#000000');
	const card = cssVar('--card', FALLBACK.card, background);
	// Cards are opaque, so the labels and the border are composited onto the
	// card they are drawn on rather than the page behind it.
	return {
		background,
		card,
		border: cssVar('--border', FALLBACK.border, card),
		text: cssVar('--foreground', FALLBACK.text, card),
		muted: cssVar('--muted-foreground', FALLBACK.muted, card)
	};
}

export interface MapImage {
	svg: string;
	width: number;
	height: number;
}

export interface MapImageOptions {
	palette?: MapPalette;
	padding?: number;
	/** Attribution printed in the corner; set to '' to leave it out. */
	footer?: string;
}

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/** Cut a string to the width a line can hold; wide glyphs count double. */
function fit(value: string, widthPx: number, fontSize: number): string {
	const budget = Math.floor(widthPx / (fontSize * 0.55));
	let used = 0;
	let out = '';
	for (const char of value) {
		const w = char.codePointAt(0)! > 0x2e80 ? 2 : 1;
		if (used + w > budget) return `${out}…`;
		used += w;
		out += char;
	}
	return out;
}

function textLength(value: string, fontSize: number): number {
	let units = 0;
	for (const char of value) units += char.codePointAt(0)! > 0x2e80 ? 2 : 1;
	return units * fontSize * 0.55;
}

/** One card: title, the edge that placed it (or its type), and its subtitle. */
function card(walk: WalkNode, x: number, y: number, p: MapPalette): string {
	const title = walk.label || shortPublicId(walk.id);
	const verb = walk.relation
		? `${walk.direction === 'in' ? '←' : '→'} ${enumLabel('relation', walk.relation)}`
		: enumLabel('et', walk.type.replace(/-/g, '_'));
	const lines = [
		`<text x="${x + 12}" y="${y + 24}" font-family="${SANS}" font-size="13" font-weight="600" fill="${p.text}">${escapeXml(fit(title, NODE_W - 24, 13))}</text>`,
		`<text x="${x + 12}" y="${y + 40}" font-family="${MONO}" font-size="10" fill="${p.muted}">${escapeXml(fit(verb, NODE_W - 24, 10))}</text>`
	];
	if (walk.subtitle) {
		lines.push(
			`<text x="${x + 12}" y="${y + 54}" font-family="${MONO}" font-size="10" fill="${p.muted}">${escapeXml(fit(walk.subtitle, NODE_W - 24, 10))}</text>`
		);
	}
	return [
		`<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" fill="${p.card}" stroke="${p.border}" stroke-width="1"/>`,
		...lines
	].join('');
}

/** Lay the current canvas out as SVG, honouring every dragged card. */
export function mapSvg(graph: FlowGraph, options: MapImageOptions = {}): MapImage {
	const palette = options.palette ?? readPalette();
	const padding = options.padding ?? 40;
	const footer = options.footer ?? 'SPD · d.spicebio.top';

	const boxes = graph.nodes.map((node) => ({
		key: node.id,
		walk: (node.data as unknown as MapNodeData).walk,
		x: node.position.x,
		y: node.position.y
	}));
	const minX = Math.min(...boxes.map((b) => b.x), 0) - padding;
	const minY = Math.min(...boxes.map((b) => b.y), 0) - padding;
	const maxX = Math.max(...boxes.map((b) => b.x + NODE_W), NODE_W) + padding;
	const maxY = Math.max(...boxes.map((b) => b.y + NODE_H), NODE_H) + padding + (footer ? 16 : 0);
	const width = maxX - minX;
	const height = maxY - minY;

	const at = new Map(boxes.map((b) => [b.key, b]));
	// Cards are drawn at the box's own origin, so the rays have to be shifted by
	// the same amount or they would point at where the cards used to be.
	const centre = (key: string) => {
		const box = at.get(key);
		return box
			? { x: box.x - minX + NODE_W / 2, y: box.y - minY + NODE_H / 2 }
			: null;
	};

	const rays: string[] = [];
	for (const edge of graph.edges) {
		const from = centre(edge.source);
		const to = centre(edge.target);
		if (!from || !to) continue;
		const back = Boolean((edge.data as { back?: boolean } | undefined)?.back);
		rays.push(
			`<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${palette.border}" stroke-width="1.25"${back ? ' stroke-dasharray="4 3"' : ''}/>`
		);
		if (back && edge.label) {
			const label = String(edge.label);
			const w = textLength(label, 10) + 8;
			const cx = (from.x + to.x) / 2;
			const cy = (from.y + to.y) / 2;
			rays.push(
				`<rect x="${cx - w / 2}" y="${cy - 8}" width="${w}" height="16" fill="${palette.background}" stroke="${palette.border}" stroke-width="1"/>`,
				`<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-family="${MONO}" font-size="10" fill="${palette.muted}">${escapeXml(label)}</text>`
			);
		}
	}

	const cards = boxes.map((box) => card(box.walk, box.x - minX, box.y - minY, palette));
	const footerText = footer
		? `<text x="${width - padding}" y="${height - padding / 2}" text-anchor="end" font-family="${MONO}" font-size="10" fill="${palette.muted}">${escapeXml(footer)}</text>`
		: '';

	const svg = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
		`<rect width="${width}" height="${height}" fill="${palette.background}"/>`,
		...rays,
		...cards,
		footerText,
		'</svg>'
	].join('');
	return { svg, width, height };
}

/**
 * Rasterise through the browser's own SVG renderer. Text is drawn by the
 * system font stack, so a machine without the app's web fonts still gets
 * readable labels rather than boxes.
 */
export async function svgToPng(image: MapImage, scale = 2): Promise<Blob> {
	const url = URL.createObjectURL(new Blob([image.svg], { type: 'image/svg+xml;charset=utf-8' }));
	try {
		const bitmap = new Image();
		bitmap.src = url;
		await bitmap.decode();
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(image.width * scale);
		canvas.height = Math.round(image.height * scale);
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2D canvas unavailable');
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))), 'image/png');
		});
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** The two entries the map's export menu offers. */
export function mapImageFormats(graph: () => FlowGraph, base: string): ExportFormat[] {
	return [
		{
			key: 'map-png',
			label: 'PNG',
			filename: `${base}.png`,
			mime: 'image/png',
			blob: () => svgToPng(mapSvg(graph()))
		},
		{
			key: 'map-svg',
			label: 'SVG',
			filename: `${base}.svg`,
			mime: 'image/svg+xml;charset=utf-8',
			build: () => mapSvg(graph()).svg
		}
	];
}
