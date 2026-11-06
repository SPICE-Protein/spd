import { describe, expect, it } from 'vitest';
import { KONAMI_SEQUENCE, nextKonamiIndex } from './konami';

describe('Konami sequence', () => {
	it('reaches the end only after the full sequence', () => {
		let index = 0;
		for (const key of KONAMI_SEQUENCE) index = nextKonamiIndex(index, key);
		expect(index).toBe(KONAMI_SEQUENCE.length);
	});

	it('resets on a wrong key', () => {
		expect(nextKonamiIndex(3, 'x')).toBe(0);
	});

	it('restarts when the wrong key is itself the first key', () => {
		expect(nextKonamiIndex(3, 'arrowup')).toBe(1);
	});
});
