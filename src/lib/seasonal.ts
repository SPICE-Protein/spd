/**
 * Calendar-aware garnish, never content. The active season only changes a
 * small mark in the header, a search placeholder and one line on the home
 * page; records, API output and print pages stay untouched.
 *
 * Add `?season=christmas` to any URL to preview a season, or `?season=none`
 * to turn the garnish off for that page.
 */
export type Season =
	'christmas' | 'lunar-new-year' | 'pi-day' | 'dna-day' | 'mid-autumn' | 'winter-solstice';

const ALIASES: Record<string, Season | null> = {
	christmas: 'christmas',
	xmas: 'christmas',
	santa: 'christmas',
	'lunar-new-year': 'lunar-new-year',
	'spring-festival': 'lunar-new-year',
	'chinese-new-year': 'lunar-new-year',
	cny: 'lunar-new-year',
	'pi-day': 'pi-day',
	pi: 'pi-day',
	'dna-day': 'dna-day',
	dna: 'dna-day',
	'mid-autumn': 'mid-autumn',
	'mid-autumn-festival': 'mid-autumn',
	midautumn: 'mid-autumn',
	moon: 'mid-autumn',
	'winter-solstice': 'winter-solstice',
	solstice: 'winter-solstice',
	winter: 'winter-solstice',
	none: null,
	off: null
};

/** `undefined` means "no override"; `null` means "explicitly off". */
export function parseSeasonOverride(value: string | null | undefined): Season | null | undefined {
	if (!value) return undefined;
	const key = value.trim().toLowerCase();
	return Object.prototype.hasOwnProperty.call(ALIASES, key) ? ALIASES[key] : undefined;
}

const LUNAR = new Intl.DateTimeFormat('en-u-ca-chinese', {
	month: 'numeric',
	day: 'numeric'
});

function lunarMonthDay(date: Date): { month: number; day: number } | null {
	try {
		const parts = LUNAR.formatToParts(date);
		const month = Number(parts.find((part) => part.type === 'month')?.value);
		const day = Number(parts.find((part) => part.type === 'day')?.value);
		if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
		return { month, day };
	} catch {
		return null;
	}
}

function dateSeason(date: Date): Season | null {
	const month = date.getMonth() + 1;
	const day = date.getDate();

	if (month === 3 && day === 14) return 'pi-day';
	if (month === 4 && day === 25) return 'dna-day';

	const lunar = lunarMonthDay(date);
	if (lunar?.month === 1 && lunar.day === 1) return 'lunar-new-year';
	if (lunar?.month === 8 && lunar.day === 15) return 'mid-autumn';

	// The solstice itself moves between the 21st and 22nd depending on the
	// year and time zone; two days covers both without spilling into Christmas.
	if (month === 12 && (day === 21 || day === 22)) return 'winter-solstice';
	if (month === 12 && (day === 24 || day === 25 || day === 26)) return 'christmas';

	return null;
}

export function seasonFor(now: Date, override?: string | null): Season | null {
	const parsed = parseSeasonOverride(override);
	return parsed === undefined ? dateSeason(now) : parsed;
}

/** i18n key for the one-line home note, or null when nothing is active. */
export function seasonNoteKey(season: Season | null): string | null {
	return season ? `season_${season.replace(/-/g, '_')}_note` : null;
}
