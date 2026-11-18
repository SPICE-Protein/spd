import { describe, expect, it } from 'vitest';
import {
	COMPARTMENT_HUES,
	compartmentPaint,
	contrastRatio,
	parseColor,
	reactionPaint
} from './palette';

describe('pathway palette', () => {
	it('keeps every label readable on its own node in both themes', () => {
		for (const dark of [false, true]) {
			const paints = [
				...COMPARTMENT_HUES.map((_, index) => compartmentPaint(index, dark)),
				reactionPaint(dark)
			];
			for (const paint of paints) {
				// WCAG AA for body text: 4.5:1 against the fill it sits on.
				expect(contrastRatio(paint.text, paint.fill)).toBeGreaterThanOrEqual(4.5);
				// The outline has to be visible against the fill it bounds.
				expect(contrastRatio(paint.stroke, paint.fill)).toBeGreaterThanOrEqual(1.6);
			}
		}
	});

	it('does not repeat a compartment colour within one diagram', () => {
		expect(new Set(COMPARTMENT_HUES).size).toBe(COMPARTMENT_HUES.length);
	});

	it('gives the two themes opposite sides of the lightness scale', () => {
		const light = compartmentPaint(0, false);
		const dark = compartmentPaint(0, true);
		// Text and fill swap ends: dark text on a light node, and the reverse.
		expect(contrastRatio(light.text, '#ffffff')).toBeGreaterThan(
			contrastRatio(dark.text, '#ffffff')
		);
		expect(contrastRatio(dark.text, '#0b1120')).toBeGreaterThan(
			contrastRatio(light.text, '#0b1120')
		);
	});

	it('reads hsl as the same colour family it writes', () => {
		const [r, g, b] = parseColor('hsl(214 60% 40%)');
		// A blue-dominant hue: blue is the largest channel, red the smallest.
		expect(b).toBeGreaterThan(g);
		expect(g).toBeGreaterThan(r);
		expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
	});
});
