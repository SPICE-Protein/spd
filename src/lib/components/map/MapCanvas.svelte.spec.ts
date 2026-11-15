import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MapCanvas from './MapCanvas.svelte';
import { attachRelations, patch, rootNode, type WalkNode } from '$lib/graph/walk';

const ROOT = { type: 'protein', id: 'spd:protein:p1', label: 'Lysozyme C' };

function edge(toId: string, relationType = 'structure_of') {
	return {
		id: `${ROOT.id}->${toId}`,
		relationType,
		direction: 'out' as const,
		source: 'derived',
		from: { type: 'protein', id: ROOT.id },
		to: { type: 'pdb-entry', id: toId },
		other: { type: 'pdb-entry', id: toId, label: toId.slice(-4), subtitle: 'X-RAY' }
	};
}

/** Root opened once, holding the edges it is given. */
function tree(edges = [edge('spd:pdb:193l'), edge('spd:pdb:194l')]): WalkNode[] {
	const root = rootNode(ROOT);
	const opened = patch([root], root.key, { expanded: true, status: 'loaded' });
	return attachRelations(opened, root.key, edges);
}

/**
 * Svelte Flow measures its pane before it draws anything, so every test has to
 * wait for the cards to land rather than reading the DOM straight after render.
 * Queries go through the document rather than accessibility locators: the
 * canvas is one application region, and what these tests pin is the wiring.
 */
async function mount(
	nodes: WalkNode[],
	handlers = { onToggle: () => {}, onMore: () => {} },
	expected = 3
) {
	render(MapCanvas, { nodes, ...handlers });
	await vi.waitFor(() => {
		expect(document.querySelectorAll('.svelte-flow__node')).toHaveLength(expected);
	});
}

describe('MapCanvas', () => {
	it('draws a card per record with its relation verb and subtitle', async () => {
		await mount(tree());

		const text = document.body.textContent ?? '';
		expect(text).toContain('Lysozyme C');
		expect(text).toContain('193l');
		expect(text).toContain('194l');
		expect(text).toContain('X-RAY');
	});

	it('gives each card a link to its record page', async () => {
		await mount(tree());

		const hrefs = [...document.querySelectorAll('a')].map((el) => el.getAttribute('href'));
		expect(hrefs).toContain('/proteins/spd:protein:p1');
		expect(hrefs).toContain('/pdb-entries/spd:pdb:193l');
	});

	it('asks the page to expand the node that was clicked', async () => {
		const onToggle = vi.fn();
		await mount(tree(), { onToggle, onMore: () => {} });

		const card = document.querySelector<HTMLElement>('button[aria-label*="193l"]');
		expect(card).not.toBeNull();
		card!.click();
		expect(onToggle).toHaveBeenCalledWith('pdb-entry:spd:pdb:193l');
	});

	it('offers the children a node is not showing', async () => {
		// Nine edges, eight slots: the card must offer the ninth.
		const onMore = vi.fn();
		await mount(
			tree(Array.from({ length: 9 }, (_, i) => edge(`spd:pdb:10${i}l`))),
			{ onToggle: () => {}, onMore },
			9
		);

		const rootKey = 'protein:spd:protein:p1';
		const more = [...document.querySelectorAll('button')].find(
			(el) => el.textContent?.trim() === '+1'
		);
		expect(more).toBeDefined();
		more!.click();
		expect(onMore).toHaveBeenCalledWith(rootKey);
	});
});
