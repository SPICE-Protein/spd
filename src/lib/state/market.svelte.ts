import { readJSON, remove, writeJSON } from './local-store.svelte';

/**
 * The Market — a personal shortlist of records, kept in this browser only.
 *
 * SPD has no server-side "shopping cart": the Market is a scratch collection
 * for comparing reagents, planning a synthesis or collecting candidates before
 * a submission. Nothing here is ever uploaded, and clearing the browser forgets
 * it. Entries are deduplicated by entity type + public id so adding a record
 * twice from two pages cannot produce two rows.
 */

const KEY = 'spd:market:v1';

export interface MarketItem {
	id: string;
	entityType: string;
	name: string;
	href: string;
	note?: string;
	tags?: string[];
	addedAt: number;
}

/** What callers hand to `add`: the timestamp is assigned here. */
export type MarketItemInput = Omit<MarketItem, 'addedAt'> & { addedAt?: number };

export type MarketPatch = Partial<Pick<MarketItem, 'name' | 'href' | 'note' | 'tags'>>;

function slot(entityType: string, id: string): string {
	// The separator is a NUL because it cannot occur in either component;
	// a colon would collide if an entity type ever contained one.
	return `${entityType}\u0000${id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** Rebuild the list from untrusted storage, dropping rows we cannot render. */
function normalize(raw: unknown): MarketItem[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: MarketItem[] = [];
	for (const row of raw) {
		if (!isRecord(row)) continue;
		const { id, entityType, name, href, addedAt } = row;
		if (
			typeof id !== 'string' ||
			typeof entityType !== 'string' ||
			typeof name !== 'string' ||
			typeof href !== 'string' ||
			typeof addedAt !== 'number' ||
			!Number.isFinite(addedAt)
		) {
			continue;
		}
		const key = slot(entityType, id);
		if (seen.has(key)) continue;
		seen.add(key);
		const item: MarketItem = { id, entityType, name, href, addedAt };
		if (typeof row.note === 'string') item.note = row.note;
		if (Array.isArray(row.tags)) {
			item.tags = row.tags.filter((t): t is string => typeof t === 'string');
		}
		out.push(item);
	}
	return out;
}

function csvCell(value: unknown): string {
	const text = value == null ? '' : String(value);
	// RFC 4180: quote anything that contains a delimiter, quote or newline,
	// and double embedded quotes.
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

class Market {
	items = $state<MarketItem[]>([]);

	constructor() {
		// Hydrate once, at module creation, so the first paint on a client
		// navigation already has the collection.
		this.items = normalize(readJSON<unknown>(KEY, []));
	}

	has(entityType: string, id: string): boolean {
		return this.items.some((it) => it.entityType === entityType && it.id === id);
	}

	add(item: MarketItemInput): MarketItem | undefined {
		if (this.has(item.entityType, item.id)) {
			// Dedup is by identity, not by content: re-adding from another page
			// must not duplicate or overwrite a note the user already wrote.
			return this.items.find((it) => it.entityType === item.entityType && it.id === item.id);
		}
		const entry: MarketItem = {
			id: item.id,
			entityType: item.entityType,
			name: item.name,
			href: item.href,
			addedAt: item.addedAt ?? Date.now()
		};
		if (item.note !== undefined) entry.note = item.note;
		if (item.tags !== undefined) entry.tags = [...item.tags];
		this.items = [entry, ...this.items];
		this.persist();
		return entry;
	}

	remove(entityType: string, id: string): void {
		const next = this.items.filter((it) => !(it.entityType === entityType && it.id === id));
		if (next.length === this.items.length) return;
		this.items = next;
		this.persist();
	}

	toggle(item: MarketItemInput): void {
		if (this.has(item.entityType, item.id)) this.remove(item.entityType, item.id);
		else this.add(item);
	}

	update(entityType: string, id: string, patch: MarketPatch): void {
		const index = this.items.findIndex((it) => it.entityType === entityType && it.id === id);
		if (index < 0) return;
		const current = this.items[index];
		this.items[index] = {
			...current,
			...patch,
			// Identity and provenance are not patchable.
			id: current.id,
			entityType: current.entityType,
			addedAt: current.addedAt
		};
		this.persist();
	}

	clear(): void {
		this.items = [];
		remove(KEY);
	}

	/** Pretty JSON suitable for a file download. */
	toJSON(): string {
		return JSON.stringify(this.items, null, 2);
	}

	/** Spreadsheet export with a stable header and RFC 4180 escaping. */
	toCSV(): string {
		const header = ['id', 'entityType', 'name', 'href', 'note', 'tags', 'addedAt'];
		const rows = this.items.map((it) => [
			it.id,
			it.entityType,
			it.name,
			it.href,
			it.note ?? '',
			(it.tags ?? []).join(';'),
			it.addedAt
		]);
		return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
	}

	private persist(): void {
		writeJSON(KEY, this.items);
	}
}

export const market = new Market();
