export const KONAMI_SEQUENCE = [
	'arrowup',
	'arrowup',
	'arrowdown',
	'arrowdown',
	'arrowleft',
	'arrowright',
	'arrowleft',
	'arrowright',
	'b',
	'a'
] as const;

export type KonamiKey = (typeof KONAMI_SEQUENCE)[number];

export function isKonamiKey(key: string): key is KonamiKey {
	return (KONAMI_SEQUENCE as readonly string[]).includes(key);
}

/**
 * Advance the matching prefix by one key. A wrong key starts over, except that
 * it can itself be the first ArrowUp of a new attempt.
 */
export function nextKonamiIndex(index: number, key: string): number {
	if (key === KONAMI_SEQUENCE[index]) return index + 1;
	return key === KONAMI_SEQUENCE[0] ? 1 : 0;
}
