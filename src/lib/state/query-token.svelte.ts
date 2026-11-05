import { browser } from '$app/environment';

/**
 * The graph-query builder lets a caller bring their own Universal API Token
 * (spd_backend §40) instead of riding the session cookie, so a tier granted to
 * that token (deeper recursion, bigger budget — §41) applies to what they run
 * here. SPD's `resolve_tier` reads `Authorization: Bearer` ahead of the cookie,
 * and CORS already allows the header cross-origin, so the wire needs nothing
 * new — only somewhere to keep the token between visits.
 *
 * Honest caveat, surfaced in the UI: this is localStorage. It survives reloads
 * but is readable by any script running on this origin, so a token is at the
 * mercy of the page's own security and of whoever sits at this machine. It is
 * the user's explicit choice to store it here; the mint panel still owns
 * revocation, and clearing this field stops sending it. Nothing is ever sent to
 * the API except as the Authorization header on the queries you run.
 */
const KEY = 'spd:query-token';

function storage(): Storage | null {
	if (!browser) return null;
	try {
		return window.localStorage;
	} catch {
		// private mode / disabled storage: the feature just won't persist
		return null;
	}
}

class QueryToken {
	value = $state('');

	constructor() {
		const saved = storage()?.getItem(KEY);
		if (saved) this.value = saved;
	}

	set(next: string) {
		this.value = next.trim();
		const s = storage();
		if (!s) return;
		if (this.value) s.setItem(KEY, this.value);
		else s.removeItem(KEY);
	}

	clear() {
		this.set('');
	}
}

export const queryToken = new QueryToken();
