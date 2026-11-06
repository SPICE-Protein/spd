import { seasonFor, type Season } from '$lib/seasonal';

/**
 * The active garnish is intentionally client-only. The server renders the
 * ordinary page and the browser adds the mark after hydration, so a visitor
 * whose clock sits on a different side of midnight never sees a mismatch.
 */
class SeasonalState {
	season = $state<Season | null>(null);

	sync(override: string | null) {
		this.season = seasonFor(new Date(), override);
	}
}

export const seasonal = new SeasonalState();
