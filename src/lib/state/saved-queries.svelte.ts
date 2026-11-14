import type { EdgeSpec, NodeSpec } from '$lib/graph/registry';
import { readJSON, writeJSON } from './local-store.svelte';

/**
 * Saved graph queries ("views") — a builder tree the user wants to run again.
 *
 * Like the Market and the saved catalog views, this lives only in this browser:
 * a tree is a draft of a request, never server state. Saving deep-clones the
 * roots because the builder edits its reactive tree in place — keeping the same
 * array would silently rewrite the saved view on the next keystroke.
 */

const KEY = 'spd:saved-queries:v1';
const MAX_VIEWS = 30;
/** The tallest legal tier is 10; anything far deeper is a corrupt file. */
const MAX_SPEC_DEPTH = 32;

export interface SavedQueryView {
	id: string;
	name: string;
	roots: NodeSpec[];
	savedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** Fields we cannot trust are read as strings, never coerced to objects. */
function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/** Identity is the trimmed, case-insensitive name. */
function identity(name: string): string {
	return name.trim().toLowerCase();
}

/**
 * Rebuild one node from untrusted storage. Null means the shape cannot be
 * rendered, which drops the whole view rather than half-loading it. The depth
 * cap bounds recursion so a hand-edited file cannot exhaust the stack.
 */
function normalizeNode(raw: unknown, depth: number): NodeSpec | null {
	if (!isRecord(raw) || depth > MAX_SPEC_DEPTH) return null;
	if (typeof raw.type !== 'string' || !raw.type.trim()) return null;
	if (!Array.isArray(raw.edges)) return null;
	const edges: EdgeSpec[] = [];
	for (const edge of raw.edges) {
		if (!isRecord(edge) || typeof edge.edge !== 'string' || !edge.edge.trim()) return null;
		const child = normalizeNode(edge.child, depth + 1);
		if (!child) return null;
		edges.push({ edge: edge.edge, child });
	}
	return {
		type: raw.type,
		id: text(raw.id),
		source: text(raw.source),
		limit: text(raw.limit),
		select: text(raw.select),
		edges
	};
}

/** Rebuild the list from untrusted storage, dropping views we cannot load. */
function normalize(raw: unknown): SavedQueryView[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: SavedQueryView[] = [];
	for (const row of raw) {
		if (out.length >= MAX_VIEWS) break;
		if (!isRecord(row)) continue;
		const { id, name, roots, savedAt } = row;
		if (typeof id !== 'string' || !id.trim()) continue;
		if (typeof name !== 'string' || !name.trim()) continue;
		if (typeof savedAt !== 'string') continue;
		if (!Array.isArray(roots)) continue;
		const specs: NodeSpec[] = [];
		let valid = true;
		for (const root of roots) {
			const spec = normalizeNode(root, 0);
			if (!spec) {
				valid = false;
				break;
			}
			specs.push(spec);
		}
		if (!valid) continue;
		// A hand-edited file may hold two entries the store itself would merge.
		const key = identity(name);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ id, name: name.trim(), roots: specs, savedAt });
	}
	return out;
}

let seq = 0;
/** `Date.now()` alone collides on a double save within the same millisecond. */
function newId(): string {
	seq += 1;
	return `sq_${Date.now().toString(36)}_${seq.toString(36)}`;
}

/**
 * Deep-copy a builder tree. `$state.snapshot` unwraps the reactive proxy first:
 * `structuredClone` refuses proxies, and pages pass their `$state` roots.
 */
function cloneRoots(roots: NodeSpec[]): NodeSpec[] {
	return structuredClone($state.snapshot(roots));
}

export class SavedQueries {
	views = $state<SavedQueryView[]>([]);

	constructor() {
		// Hydrate once, at module creation, so a client navigation already has
		// the list without waiting for an effect.
		this.views = normalize(readJSON<unknown>(KEY, []));
	}

	save(name: string, roots: NodeSpec[]): SavedQueryView | undefined {
		const trimmed = name.trim();
		if (!trimmed) return undefined;
		const key = identity(trimmed);
		const existing = this.views.find((v) => identity(v.name) === key);
		const view: SavedQueryView = {
			id: existing?.id ?? newId(),
			name: trimmed,
			roots: cloneRoots(roots),
			savedAt: new Date().toISOString()
		};
		// Re-saving a name replaces that entry instead of appending a duplicate,
		// and moves it to the front because the list is newest-first.
		this.views = [view, ...this.views.filter((v) => v.id !== view.id)].slice(0, MAX_VIEWS);
		this.persist();
		// Return a detached copy: callers must not be able to mutate the stored
		// tree just by holding onto the save result.
		return structuredClone(view);
	}

	remove(id: string): void {
		const next = this.views.filter((v) => v.id !== id);
		if (next.length === this.views.length) return;
		this.views = next;
		this.persist();
	}

	load(id: string): NodeSpec[] | null {
		const view = this.views.find((v) => v.id === id);
		// The builder mutates whatever it receives, so never hand out the stored
		// tree itself.
		return view ? structuredClone($state.snapshot(view.roots)) : null;
	}

	rename(id: string, name: string): SavedQueryView | undefined {
		const trimmed = name.trim();
		if (!trimmed) return undefined;
		if (!this.views.some((v) => v.id === id)) return undefined;
		const key = identity(trimmed);
		// Renaming onto another view's name would break the one-name-one-entry
		// invariant, so drop the entry that loses the name.
		this.views = this.views
			.map((v) => (v.id === id ? { ...v, name: trimmed } : v))
			.filter((v) => v.id === id || identity(v.name) !== key);
		this.persist();
		const updated = this.views.find((v) => v.id === id);
		return updated ? structuredClone($state.snapshot(updated)) : undefined;
	}

	private persist(): void {
		writeJSON(KEY, this.views);
	}
}

export const savedQueries = new SavedQueries();
