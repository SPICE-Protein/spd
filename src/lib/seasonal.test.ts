import { describe, expect, it } from 'vitest';
import { parseSeasonOverride, seasonFor, seasonNoteKey } from './seasonal';

function local(year: number, month: number, day: number): Date {
	return new Date(year, month - 1, day, 12);
}

describe('seasonal calendar', () => {
	it('marks the scientific dates', () => {
		expect(seasonFor(local(2026, 3, 14))).toBe('pi-day');
		expect(seasonFor(local(2026, 4, 25))).toBe('dna-day');
	});

	it('uses the Chinese calendar for lunar new year and mid-autumn', () => {
		expect(seasonFor(local(2024, 2, 10))).toBe('lunar-new-year');
		expect(seasonFor(local(2024, 9, 17))).toBe('mid-autumn');
		expect(seasonFor(local(2026, 2, 17))).toBe('lunar-new-year');
		expect(seasonFor(local(2026, 9, 25))).toBe('mid-autumn');
	});

	it('keeps winter solstice and Christmas on separate days', () => {
		expect(seasonFor(local(2026, 12, 21))).toBe('winter-solstice');
		expect(seasonFor(local(2026, 12, 22))).toBe('winter-solstice');
		expect(seasonFor(local(2026, 12, 23))).toBeNull();
		expect(seasonFor(local(2026, 12, 24))).toBe('christmas');
		expect(seasonFor(local(2026, 12, 26))).toBe('christmas');
		expect(seasonFor(local(2026, 12, 27))).toBeNull();
	});

	it('returns nothing on an ordinary day', () => {
		expect(seasonFor(local(2026, 11, 6))).toBeNull();
	});
});

describe('seasonal override', () => {
	it('accepts aliases', () => {
		expect(parseSeasonOverride('xmas')).toBe('christmas');
		expect(parseSeasonOverride('CNY')).toBe('lunar-new-year');
		expect(parseSeasonOverride('mid-autumn-festival')).toBe('mid-autumn');
	});

	it('turns the garnish off explicitly', () => {
		expect(parseSeasonOverride('none')).toBeNull();
		expect(seasonFor(local(2026, 12, 24), 'none')).toBeNull();
	});

	it('falls back to the calendar for an unknown value', () => {
		expect(parseSeasonOverride('halloween')).toBeUndefined();
		expect(seasonFor(local(2026, 12, 24), 'halloween')).toBe('christmas');
	});
});

describe('seasonal note key', () => {
	it('maps a season to its message key', () => {
		expect(seasonNoteKey('lunar-new-year')).toBe('season_lunar_new_year_note');
		expect(seasonNoteKey(null)).toBeNull();
	});
});
