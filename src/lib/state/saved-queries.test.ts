import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EdgeSpec, NodeSpec } from '$lib/graph/registry';

/**
 * The store is a singleton that hydrates in its constructor, so the fake
 * localStorage has to exist before the import below is evaluated. A fresh
 * `new SavedQueries()` then re-runs hydration against whatever a test put in
 * that slot.
 */
const fake = vi.hoisted(() => {
	const data = new Map<string, string>();
	const storage = {
		get length(): number {
			return data.size;
		},
		clear(): void {
			data.clear();
		},
		getItem(key: string): string | null {
			return data.has(key) ? (data.get(key) as string) : null;
		},
		key(index: number): string | null {
			return Array.from(data.keys())[index] ?? null;
		},
		removeItem(key: string): void {
			data.delete(key);
		},
		setItem(key: string, value: string): void {
			data.set(key, String(value));
		}
	};
	(globalThis as unknown as { window: unknown }).window = { localStorage: storage };
	(globalThis as unknown as { localStorage: unknown }).localStorage = storage;
	return storage;
});

vi.mock('$app/environment', () => ({ browser: true }));

import { SavedQueries, savedQueries } from './saved-queries.svelte';

const KEY = 'spd:saved-queries:v1';

function node(type = 'gene', edges: EdgeSpec[] = []): NodeSpec {
	return { type, id: 'spd:gene:seq1', source: '', limit: '', select: '', edges };
}

beforeEach(() => {
	fake.clear();
	for (const view of [...savedQueries.views]) savedQueries.remove(view.id);
});

describe('saved graph queries', () => {
	it('saves and loads a tree, trimming the name', () => {
		const roots = [node()];
		const saved = savedQueries.save('  HSFA2d evidence  ', roots);

		expect(saved).toBeDefined();
		expect(saved!.name).toBe('HSFA2d evidence');
		expect(saved!.roots).toEqual(roots);
		expect(savedQueries.views).toHaveLength(1);
		expect(savedQueries.load(saved!.id)).toEqual(roots);

		const stored = JSON.parse(fake.getItem(KEY) as string);
		expect(stored).toHaveLength(1);
		expect(stored[0].roots).toEqual(roots);
	});

	it('clones on save and on load, so edits never reach the stored tree', () => {
		const roots = [node()];
		const saved = savedQueries.save('Tree', roots)!;

		// A later builder edit mutates the original array.
		roots[0].type = 'protein';
		roots[0].edges.push({ edge: 'proteins', child: node('protein') });

		expect(savedQueries.load(saved.id)![0].type).toBe('gene');
		expect(savedQueries.load(saved.id)![0].edges).toHaveLength(0);

		// A loaded tree belongs to the builder alone.
		const first = savedQueries.load(saved.id)!;
		first[0].type = 'fold';
		first[0].edges.push({ edge: 'folds', child: node('fold') });

		const second = savedQueries.load(saved.id)!;
		expect(second[0].type).toBe('gene');
		expect(second[0].edges).toHaveLength(0);
	});

	it('replaces a same-name view instead of appending a duplicate', () => {
		savedQueries.save('My tree', [node('gene')]);
		savedQueries.save('  my TREE    ', [node('protein')]);

		expect(savedQueries.views).toHaveLength(1);
		expect(savedQueries.views[0].name).toBe('my TREE');
		expect(savedQueries.views[0].roots[0].type).toBe('protein');
	});

	it('rejects an empty or whitespace-only name', () => {
		expect(savedQueries.save('   ', [node()])).toBeUndefined();
		expect(savedQueries.views).toHaveLength(0);
		expect(JSON.parse(fake.getItem(KEY) ?? '[]')).toEqual([]);
	});

	it('keeps at most 30 views, newest first', () => {
		for (let i = 0; i < 35; i++) savedQueries.save(`View ${i}`, [node()]);

		expect(savedQueries.views).toHaveLength(30);
		expect(savedQueries.views[0].name).toBe('View 34');
		expect(savedQueries.views[29].name).toBe('View 5');
		expect(JSON.parse(fake.getItem(KEY) as string)).toHaveLength(30);
	});

	it('removes one view by id', () => {
		const a = savedQueries.save('A', [node()])!;
		const b = savedQueries.save('B', [node()])!;

		savedQueries.remove(a.id);
		expect(savedQueries.views.map((v) => v.id)).toEqual([b.id]);
		expect(savedQueries.load(a.id)).toBeNull();
	});
});

describe('saved graph query hydration', () => {
	it('falls back to an empty list for invalid JSON', () => {
		fake.setItem(KEY, '{ not json');

		expect(new SavedQueries().views).toEqual([]);
	});

	it('falls back to an empty list for a non-array payload', () => {
		fake.setItem(KEY, JSON.stringify({ views: [] }));

		expect(new SavedQueries().views).toEqual([]);
	});

	it('drops malformed entries and keeps the structurally valid one', () => {
		const good = {
			id: 'a',
			name: 'Good',
			roots: [node()],
			savedAt: '2026-01-02T03:04:05.000Z'
		};
		fake.setItem(
			KEY,
			JSON.stringify([
				good,
				{ id: 'b', name: 'No roots', roots: 'nope', savedAt: 'x' },
				{ id: 'c', name: 'Bad root', roots: [{ type: '', edges: [] }], savedAt: 'x' },
				{ id: 'd', name: 'Bad edge', roots: [{ type: 'gene', edges: [{ edge: 'x' }] }], savedAt: 'x' },
				{ id: 'e', name: 'Bad savedAt', roots: [], savedAt: 5 },
				{ id: '', name: 'No id', roots: [node()], savedAt: 'x' },
				'not an object'
			])
		);

		const store = new SavedQueries();
		expect(store.views.map((v) => v.name)).toEqual(['Good']);
		expect(store.views[0].roots[0].source).toBe('');
	});

	it('rejects a tree nested past the depth guard', () => {
		let root = node('gene');
		for (let i = 0; i < 40; i++) root = node('gene', [{ edge: 'parent', child: root }]);
		fake.setItem(KEY, JSON.stringify([{ id: 'deep', name: 'Deep', roots: [root], savedAt: 'x' }]));

		expect(new SavedQueries().views).toHaveLength(0);
	});

	it('caps a hand-edited file at 30 entries', () => {
		const rows = Array.from({ length: 40 }, (_, i) => ({
			id: `i${i}`,
			name: `N${i}`,
			roots: [node()],
			savedAt: '2026-01-01T00:00:00.000Z'
		}));
		fake.setItem(KEY, JSON.stringify(rows));

		expect(new SavedQueries().views).toHaveLength(30);
	});
});
