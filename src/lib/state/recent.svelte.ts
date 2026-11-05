import { readJSON, remove, writeJSON } from './local-store.svelte';

/**
 * Recently viewed records, newest first, capped at 30.
 *
 * This is a local breadcrumb trail for jumping back to a record after a
 * detour, not analytics: entries never leave the browser and are deliberately
 * small (no payload, no query strings). Viewing the same record twice moves it
 * to the front rather than adding a second row.
 */

const KEY = 'spd:recent:v1';
const MAX = 30;

export interface RecentItem {
	id: string;
	entityType: string;
	name: string;
	href: string;
	viewedAt: number;
}

export type RecentInput = Omit<RecentItem, 'viewedAt'> & { viewedAt?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function normalize(raw: unknown): RecentItem[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: RecentItem[] = [];
	for (const row of raw) {
		if (!isRecord(row)) continue;
		const { id, entityType, name, href, viewedAt } = row;
		if (
			typeof id !== 'string' ||
			typeof entityType !== 'string' ||
			typeof name !== 'string' ||
			typeof href !== 'string' ||
			typeof viewedAt !== 'number' ||
			!Number.isFinite(viewedAt)
		) {
			continue;
		}
		const key = `${entityType}\u0000${id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ id, entityType, name, href, viewedAt });
		if (out.length >= MAX) break;
	}
	return out;
}

class Recent {
	items = $state<RecentItem[]>([]);

	constructor() {
		this.items = normalize(readJSON<unknown>(KEY, []));
	}

	remember(item: RecentInput): void {
		const entry: RecentItem = {
			id: item.id,
			entityType: item.entityType,
			name: item.name,
			href: item.href,
			viewedAt: item.viewedAt ?? Date.now()
		};
		// Drop the old occurrence first, then unshift: revisiting promotes the
		// record instead of creating a duplicate.
		this.items = [
			entry,
			...this.items.filter((it) => !(it.entityType === entry.entityType && it.id === entry.id))
		].slice(0, MAX);
		this.persist();
	}

	clear(): void {
		this.items = [];
		remove(KEY);
	}

	private persist(): void {
		writeJSON(KEY, this.items);
	}
}

export const recent = new Recent();
