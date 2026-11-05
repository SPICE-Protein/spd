import { describe, expect, it, vi } from 'vitest';
import {
	LEGACY_IMPORT_KEY,
	clearLegacyImportIds,
	migrateLegacyImports,
	readLegacyImportIds
} from './legacy-imports';

function storage(initial: string | null = null) {
	const data = new Map<string, string>();
	if (initial !== null) data.set(LEGACY_IMPORT_KEY, initial);
	return {
		getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
		removeItem: (key: string) => {
			data.delete(key);
		},
		has: () => data.has(LEGACY_IMPORT_KEY)
	};
}

describe('legacy batch-import marks', () => {
	it('reads object rows, string rows, blanks and duplicates', () => {
		const s = storage(
			JSON.stringify([
				{ id: 'spd:biobrick:1' },
				{ id: 'spd:biobrick:1' },
				{ id: '  ' },
				'spd:strain:2',
				{ name: 'missing id' }
			])
		);
		expect(readLegacyImportIds(s)).toEqual(['spd:biobrick:1', 'spd:strain:2']);
	});

	it('degrades to an empty list for a missing or malformed key', () => {
		expect(readLegacyImportIds(storage())).toEqual([]);
		expect(readLegacyImportIds(storage('not json'))).toEqual([]);
		expect(readLegacyImportIds(storage('{"id":"not an array"}'))).toEqual([]);
		expect(readLegacyImportIds(null)).toEqual([]);
	});

	it('claims once and removes the key only after success', async () => {
		const s = storage(JSON.stringify([{ id: 'a' }, { id: 'b' }]));
		const claim = vi.fn(async () => ({ claimed: 2 }));

		await expect(migrateLegacyImports(claim, s)).resolves.toBe(2);
		expect(claim).toHaveBeenCalledTimes(1);
		expect(claim).toHaveBeenCalledWith(['a', 'b']);
		expect(s.has()).toBe(false);
	});

	it('keeps the key when the claim fails, so a later visit can retry', async () => {
		const s = storage(JSON.stringify([{ id: 'a' }]));
		const claim = vi.fn(async () => {
			throw new Error('offline');
		});

		await expect(migrateLegacyImports(claim, s)).rejects.toThrow('offline');
		expect(s.has()).toBe(true);
	});

	it('does nothing when the old key is absent', async () => {
		const s = storage();
		const claim = vi.fn(async () => ({ claimed: 0 }));
		await expect(migrateLegacyImports(claim, s)).resolves.toBe(0);
		expect(claim).not.toHaveBeenCalled();
	});

	it('clears the key explicitly', () => {
		const s = storage(JSON.stringify([{ id: 'a' }]));
		clearLegacyImportIds(s);
		expect(s.has()).toBe(false);
	});
});
