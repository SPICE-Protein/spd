import { readJSON, writeJSON } from './local-store.svelte';

/**
 * Saved catalog views — a named query string the user wants to return to.
 *
 * A view is only a relative URL (`/proteins?organism=E.%20coli&sort=newest`)
 * plus a label; it carries no server identity and no cached results. Storing
 * the path rather than re-running the query keeps this honest: opening a view
 * re-fetches from the API exactly like typing the URL would.
 */

const KEY = 'spd:views:v1';

export interface SavedView {
	id: string;
	name: string;
	path: string;
	createdAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function normalize(raw: unknown): SavedView[] {
	if (!Array.isArray(raw)) return [];
	const out: SavedView[] = [];
	for (const row of raw) {
		if (!isRecord(row)) continue;
		const { id, name, path, createdAt } = row;
		if (
			typeof id !== 'string' ||
			typeof name !== 'string' ||
			typeof path !== 'string' ||
			typeof createdAt !== 'number' ||
			!Number.isFinite(createdAt)
		) {
			continue;
		}
		out.push({ id, name, path, createdAt });
	}
	return out;
}

function newId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		// Older browsers (and some non-secure contexts) lack randomUUID.
		return `view_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
	}
}

class SavedViews {
	views = $state<SavedView[]>([]);

	constructor() {
		this.views = normalize(readJSON<unknown>(KEY, []));
	}

	add({ name, path }: { name: string; path: string }): SavedView | undefined {
		const trimmedName = name.trim();
		const trimmedPath = path.trim();
		if (!trimmedName || !trimmedPath) return undefined;
		const view: SavedView = {
			id: newId(),
			name: trimmedName,
			path: trimmedPath,
			createdAt: Date.now()
		};
		this.views = [view, ...this.views];
		this.persist();
		return view;
	}

	remove(id: string): void {
		const next = this.views.filter((v) => v.id !== id);
		if (next.length === this.views.length) return;
		this.views = next;
		this.persist();
	}

	rename(id: string, name: string): void {
		const trimmed = name.trim();
		if (!trimmed) return;
		const view = this.views.find((v) => v.id === id);
		if (!view) return;
		view.name = trimmed;
		this.persist();
	}

	/** Newest first, matching how `add` prepends. */
	list(): SavedView[] {
		return this.views;
	}

	private persist(): void {
		writeJSON(KEY, this.views);
	}
}

export const savedViews = new SavedViews();
