/**
 * Pre-0057 the batch importer only left a browser-local list of the records
 * it created. The server now owns `origin='batch-import'`, so the old key is
 * migrated once through the claim endpoint and then removed. This module is
 * deliberately storage-injectable: the migration is a one-way door and its
 * failure modes (missing key, malformed JSON, failed claim) must be testable
 * without a browser.
 */
export const LEGACY_IMPORT_KEY = 'spd:imports:v1';

type StorageLike = Pick<Storage, 'getItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

/** Ids the old store remembers, de-duplicated, blanks dropped. */
export function readLegacyImportIds(storage: StorageLike | null = defaultStorage()): string[] {
	if (!storage) return [];
	try {
		const raw = storage.getItem(LEGACY_IMPORT_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		const ids = parsed
			.map((item) => {
				if (typeof item === 'string') return item;
				if (item && typeof item === 'object') {
					const id = (item as Record<string, unknown>).id;
					return typeof id === 'string' ? id : '';
				}
				return '';
			})
			.map((id) => id.trim())
			.filter(Boolean);
		return Array.from(new Set(ids));
	} catch {
		return [];
	}
}

export function clearLegacyImportIds(storage: StorageLike | null = defaultStorage()): void {
	try {
		storage?.removeItem(LEGACY_IMPORT_KEY);
	} catch {
		// A read-only storage is a browser condition, not a page failure.
	}
}

/**
 * Claim the browser's old marks on the server. The key is removed only after
 * the claim resolves; a failed request leaves it in place so a later visit
 * can retry. Returns the number of ids the server actually claimed.
 */
export async function migrateLegacyImports(
	claim: (ids: string[]) => Promise<{ claimed: number }>,
	storage: StorageLike | null = defaultStorage()
): Promise<number> {
	const ids = readLegacyImportIds(storage);
	if (!ids.length) return 0;
	const result = await claim(ids);
	clearLegacyImportIds(storage);
	return Number(result?.claimed ?? 0);
}
