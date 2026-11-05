import { browser } from '$app/environment';

/**
 * Tiny SSR-safe wrapper around localStorage.
 *
 * Everything under $lib/state is browser-local by design: the Market, saved
 * views, recents and drafts are conveniences for the person at this machine,
 * never server state. The guard matters because these modules are imported by
 * pages that SvelteKit renders on the server first; there `window` does not
 * exist and the stores must quietly fall back to their defaults.
 *
 * Storage access can also throw (private mode, disabled cookies, quota). None
 * of that should break a page, so every operation degrades to a no-op.
 */

function storage(): Storage | null {
	if (!browser) return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

/** Parse a JSON value, returning `fallback` for missing, corrupt or unreadable slots. */
export function readJSON<T>(key: string, fallback: T): T {
	const ls = storage();
	if (!ls) return fallback;
	try {
		const raw = ls.getItem(key);
		if (raw === null) return fallback;
		return JSON.parse(raw) as T;
	} catch {
		// A corrupt slot must not take the feature down with it. Callers
		// validate the shape before trusting it.
		return fallback;
	}
}

/** Persist a JSON value; silently keeps working when storage is unavailable. */
export function writeJSON<T>(key: string, value: T): void {
	const ls = storage();
	if (!ls) return;
	try {
		ls.setItem(key, JSON.stringify(value));
	} catch {
		/* out of quota: the in-memory state still works for this visit */
	}
}

/** Drop a slot; no-op outside the browser or when storage refuses access. */
export function remove(key: string): void {
	const ls = storage();
	if (!ls) return;
	try {
		ls.removeItem(key);
	} catch {
		/* ignore */
	}
}
