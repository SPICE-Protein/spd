import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MapCanvas from './MapCanvas.svelte';
import { attachRelations, patchNode, startWalk, type WalkState } from '$lib/graph/walk';

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
function tree(edges = [edge('spd:pdb:193l'), edge('spd:pdb:194l')]): WalkState {
	const walk = startWalk(ROOT);
	const key = walk.nodes[0].key;
	return attachRelations(patchNode(walk, key, { expanded: true, status: 'loaded' }), key, edges);
}

/**
 * Svelte Flow measures its pane before it draws anything, so every test has to
 * wait for the cards to land rather than reading the DOM straight after render.
 * Queries go through the document rather than accessibility locators: the
 * canvas is one application region, and what these tests pin is the wiring.
 */
async function mount(
	walk: WalkState,
	handlers = { onToggle: () => {}, onMore: () => {} },
	expected = 3
) {
	render(MapCanvas, { walk, ...handlers });
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

	it('asks the page to expand the node that was double-clicked', async () => {
		const onToggle = vi.fn();
		await mount(tree(), { onToggle, onMore: () => {} });

		const card = document.querySelector<HTMLElement>('button[aria-label*="193l"]');
		expect(card).not.toBeNull();
		// One click belongs to the canvas (select, drag); only a second one
		// expands.
		card!.click();
		expect(onToggle).not.toHaveBeenCalled();
		card!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(onToggle).toHaveBeenCalledWith('pdb-entry:spd:pdb:193l');
	});

	it('draws the loop back to the record that was already there', async () => {
		const walk = tree();
		const sequence = walk.nodes.find((n) => n.type === 'pdb-entry')!;
		const looped = attachRelations(patchNode(walk, sequence.key, { expanded: true }), sequence.key, [
			{
				id: 'back',
				relationType: 'structure_of',
				direction: 'in' as const,
				source: 'derived',
				from: { type: 'pdb-entry', id: sequence.id },
				to: { type: 'protein', id: ROOT.id },
				other: { type: 'protein', id: ROOT.id, label: 'Lysozyme C' }
			}
		]);
		await mount(looped, { onToggle: () => {}, onMore: () => {} }, 3);

		// One protein card, not a second copy of it, and an edge carrying the
		// verb the missing card would have shown. Edges land a tick after the
		// cards, so wait for them rather than reading straight through.
		await vi.waitFor(() => {
			expect(document.querySelectorAll('.svelte-flow__edge')).toHaveLength(3);
		});
		expect(document.querySelectorAll('.svelte-flow__node')).toHaveLength(3);
		expect(document.querySelectorAll('.svelte-flow__edge')).toHaveLength(3);
		// Edge labels are portalled out of the edge group, so they are read from
		// their own container.
		// Edge labels are portalled out of the edge group, under a container of
		// their own. The verb is translated, so the marker is the arrow.
		const labels = document.querySelector('.svelte-flow__edge-labels')?.textContent ?? '';
		expect(labels).toContain('←');
	});

	it('asks the page to tidy the map', async () => {
		const onTidy = vi.fn();
		render(MapCanvas, { walk: tree(), onToggle: () => {}, onMore: () => {}, onTidy });
		await vi.waitFor(() => {
			expect(document.querySelectorAll('.svelte-flow__node')).toHaveLength(3);
		});

		const tidy = [...document.querySelectorAll('button')].find((el) =>
			['Tidy', '整理'].includes(el.textContent?.trim() ?? '')
		);
		expect(tidy).toBeDefined();
		tidy!.click();
		expect(onTidy).toHaveBeenCalled();
	});

	it('offers the children a node is not showing', async () => {
		// Nine edges, eight slots: the card must offer the ninth.
		const onMore = vi.fn();
		const rootKey = 'protein:spd:protein:p1';
		await mount(
			tree(Array.from({ length: 9 }, (_, i) => edge(`spd:pdb:10${i}l`))),
			{ onToggle: () => {}, onMore },
			9
		);

		const more = [...document.querySelectorAll('button')].find(
			(el) => el.textContent?.trim() === '+1'
		);
		expect(more).toBeDefined();
		more!.click();
		expect(onMore).toHaveBeenCalledWith(rootKey);
	});
});
