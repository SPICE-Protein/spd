/**
 * The backend's local search builds a `%term%` LIKE pattern. Cloudflare D1's
 * SQLite build caps LIKE patterns at 50 bytes, so a term longer than 48 bytes
 * (plus two wildcards) answers INTERNAL_ERROR instead of an empty result.
 * Count UTF-8 bytes, not JS code points: one CJK character is three bytes.
 */
export const SEARCH_TERM_MAX_BYTES = 48;

export function searchTermBytes(term: string): number {
	return new TextEncoder().encode(term).length;
}

export function searchTermTooLong(term: string): boolean {
	return searchTermBytes(term) > SEARCH_TERM_MAX_BYTES;
}
