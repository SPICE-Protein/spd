/**
 * What a pathway node is painted with.
 *
 * The diagram is read at a glance: a compartment is identified by hue, and the
 * text on top of it has to stay legible whatever that hue is. Lightness is
 * therefore fixed per theme rather than derived from the hue — a node is dark
 * with light text in the dark theme and light with dark text in the light one,
 * and no palette entry can land in the middle where neither reads.
 */

export interface NodePaint {
	/** Body fill. */
	fill: string;
	/** Outline, which is also the legend swatch. */
	stroke: string;
	/** Label colour, chosen against `fill` — see the contrast test. */
	text: string;
}

/** Compartment hues; the index is the compartment's position in the topology. */
export const COMPARTMENT_HUES = [214, 158, 32, 275, 350, 190, 88, 305];

const wrapHue = (hue: number) => ((hue % 360) + 360) % 360;

export function compartmentPaint(index: number, dark: boolean): NodePaint {
	const hue = wrapHue(COMPARTMENT_HUES[index % COMPARTMENT_HUES.length]);
	return dark
		? {
				fill: `hsl(${hue} 38% 19%)`,
				stroke: `hsl(${hue} 55% 55%)`,
				text: `hsl(${hue} 45% 93%)`
			}
		: {
				fill: `hsl(${hue} 70% 96%)`,
				stroke: `hsl(${hue} 60% 40%)`,
				text: `hsl(${hue} 62% 20%)`
			};
}

/** Reactions are not a compartment; they stay neutral grey. */
export function reactionPaint(dark: boolean): NodePaint {
	return dark
		? { fill: 'hsl(215 20% 20%)', stroke: 'hsl(215 14% 62%)', text: 'hsl(210 30% 94%)' }
		: { fill: 'hsl(210 28% 97%)', stroke: 'hsl(215 18% 52%)', text: 'hsl(215 32% 18%)' };
}

export function compartmentSwatch(index: number, dark: boolean): string {
	return compartmentPaint(index, dark).stroke;
}

// ---- contrast -------------------------------------------------------------
// Exported so the palette can be checked rather than eyeballed: every pair the
// diagram puts on top of each other has to clear WCAG AA (4.5:1) for text.

export function parseColor(value: string): [number, number, number] {
	const text = value.trim();
	if (text.startsWith('#')) {
		const hex = text.slice(1);
		const full =
			hex.length === 3
				? hex
						.split('')
						.map((c) => c + c)
						.join('')
				: hex;
		return [
			parseInt(full.slice(0, 2), 16),
			parseInt(full.slice(2, 4), 16),
			parseInt(full.slice(4, 6), 16)
		];
	}
	const hsl = text.match(/^hsl\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/i);
	if (!hsl) throw new Error(`unsupported colour: ${value}`);
	const [h, s, l] = [Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100];
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	const [r, g, b] =
		h < 60
			? [c, x, 0]
			: h < 120
				? [x, c, 0]
				: h < 180
					? [0, c, x]
					: h < 240
						? [0, x, c]
						: h < 300
							? [x, 0, c]
							: [c, 0, x];
	return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function luminance([r, g, b]: [number, number, number]): number {
	const channel = (value: number) => {
		const v = value / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio between two colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
	const [lighter, darker] = [luminance(parseColor(a)), luminance(parseColor(b))].sort(
		(x, y) => y - x
	);
	return (lighter + 0.05) / (darker + 0.05);
}
