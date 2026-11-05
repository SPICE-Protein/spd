/**
 * Browser-local display preferences (see /settings). fullIds switches
 * public ids from the shortened `abc123…` form to the whole string —
 * read inside format.shortPublicId(), which every table and chip calls
 * during render, so toggling repaints the app live without a reload.
 */
const KEY = 'spd_full_ids';

class DisplayState {
	fullIds = $state(typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1');

	setFullIds(v: boolean) {
		this.fullIds = v;
		if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, v ? '1' : '0');
	}
}

export const display = new DisplayState();
