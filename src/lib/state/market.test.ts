import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The stores are singletons that hydrate in their constructors, so the fake
 * localStorage has to exist before the imports below are evaluated. Likewise
 * `$app/environment` reports `browser: false` under the Node test runner; the
 * mock is what lets the storage paths run at all.
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

import { listDrafts } from './drafts.svelte';
import { market } from './market.svelte';
import { recent } from './recent.svelte';
import { savedViews } from './saved-views.svelte';

beforeEach(() => {
	fake.clear();
	market.clear();
	recent.clear();
	for (const view of [...savedViews.list()]) savedViews.remove(view.id);
});

describe('market', () => {
	it('deduplicates by entity type and public id', () => {
		market.add({ id: 'p1', entityType: 'protein', name: 'First', href: '/proteins/p1' });
		market.add({ id: 'p1', entityType: 'protein', name: 'Second', href: '/proteins/p1' });

		expect(market.items).toHaveLength(1);
		expect(market.items[0].name).toBe('First');
		expect(market.has('protein', 'p1')).toBe(true);
		expect(market.has('gene', 'p1')).toBe(false);
	});

	it('removes and toggles one identity at a time', () => {
		const item = { id: 'g1', entityType: 'gene', name: 'Gene', href: '/genes/g1' };
		market.toggle(item);
		expect(market.has('gene', 'g1')).toBe(true);
		market.toggle(item);
		expect(market.has('gene', 'g1')).toBe(false);
	});

	it('escapes commas, quotes and newlines in CSV cells', () => {
		market.add({
			id: 'p2',
			entityType: 'protein',
			name: 'Name, "quoted"',
			href: '/proteins/p2',
			note: 'line one\nline two',
			tags: ['a', 'b']
		});

		const csv = market.toCSV();
		expect(csv.split('\n')[0]).toBe('id,entityType,name,href,note,tags,addedAt');
		expect(csv).toContain('"Name, ""quoted"""');
		expect(csv).toContain('"line one\nline two"');
		expect(csv).toContain(',a;b,');
	});

	it('persists mutations and exports valid JSON', () => {
		market.add({ id: 'p3', entityType: 'protein', name: 'P3', href: '/proteins/p3' });
		const stored = JSON.parse(fake.getItem('spd:market:v1') as string);
		expect(stored).toHaveLength(1);
		expect(JSON.parse(market.toJSON())).toHaveLength(1);
	});
});

describe('saved views', () => {
	it('adds, renames and removes a view', () => {
		const view = savedViews.add({ name: '  E. coli  ', path: '/proteins?organism=E.%20coli' });
		expect(view).toBeDefined();
		expect(savedViews.list()[0].name).toBe('E. coli');
		expect(savedViews.list()[0].path).toBe('/proteins?organism=E.%20coli');

		savedViews.rename(view!.id, 'E. coli proteins');
		expect(savedViews.list()[0].name).toBe('E. coli proteins');

		savedViews.remove(view!.id);
		expect(savedViews.list()).toHaveLength(0);
	});

	it('refuses a blank name or path', () => {
		expect(savedViews.add({ name: '  ', path: '/genes' })).toBeUndefined();
		expect(savedViews.add({ name: 'Genes', path: '  ' })).toBeUndefined();
		expect(savedViews.list()).toHaveLength(0);
	});
});

describe('recent', () => {
	it('promotes a revisited record instead of duplicating it', () => {
		recent.remember({ id: 'p1', entityType: 'protein', name: 'P1', href: '/p1', viewedAt: 1 });
		recent.remember({ id: 'p1', entityType: 'protein', name: 'P1', href: '/p1', viewedAt: 2 });

		expect(recent.items).toHaveLength(1);
		expect(recent.items[0].viewedAt).toBe(2);
	});

	it('keeps at most 30 entries', () => {
		for (let i = 0; i < 35; i++) {
			recent.remember({
				id: `p${i}`,
				entityType: 'protein',
				name: `P${i}`,
				href: `/p${i}`,
				viewedAt: i
			});
		}
		expect(recent.items).toHaveLength(30);
		expect(recent.items[0].id).toBe('p34');
	});
});

describe('draft listing', () => {
	it('parses submit slots, ignores malformed rows and sorts newest first', () => {
		fake.setItem('spd:draft:submit/protein', JSON.stringify({ at: 100, values: { a: 'b' } }));
		fake.setItem('spd:draft:submit/[kind]', JSON.stringify({ at: 200, values: { x: 'y' } }));
		fake.setItem('spd:draft:submit/gene', JSON.stringify({ at: 300, values: {} }));
		fake.setItem('spd:draft:broken', '{ not json');
		fake.setItem('spd:draft:no-at', JSON.stringify({ values: { a: 'b' } }));
		fake.setItem('spd:unrelated', 'kept');

		const drafts = listDrafts();
		expect(drafts.map((d) => d.key)).toEqual(['submit/gene', 'submit/[kind]', 'submit/protein']);
		expect(drafts.map((d) => d.label)).toEqual(['gene', 'submit/[kind]', 'protein']);
		expect(drafts.map((d) => d.at)).toEqual([300, 200, 100]);
	});
});
