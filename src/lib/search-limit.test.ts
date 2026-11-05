import { describe, expect, it } from 'vitest';
import { SEARCH_TERM_MAX_BYTES, searchTermBytes, searchTermTooLong } from './search-limit';

describe('search term byte limit', () => {
	it('counts UTF-8 bytes, not JavaScript characters', () => {
		expect(searchTermBytes('a')).toBe(1);
		expect(searchTermBytes('蛋')).toBe(3);
		expect(searchTermBytes('🔥')).toBe(4);
	});

	it('accepts 48 bytes and rejects 49', () => {
		// D1's LIKE pattern is `%term%`; its 50-byte ceiling leaves 48 for the
		// term. 16 CJK characters are exactly 48 bytes.
		expect(SEARCH_TERM_MAX_BYTES).toBe(48);
		expect(searchTermTooLong('a'.repeat(48))).toBe(false);
		expect(searchTermTooLong('a'.repeat(49))).toBe(true);
		expect(searchTermTooLong('蛋白激酶抑制剂靶点研究蛋白激酶抑')).toBe(false);
		expect(searchTermTooLong('蛋白激酶抑制剂靶点研究蛋白激酶抑制')).toBe(true);
	});
});
