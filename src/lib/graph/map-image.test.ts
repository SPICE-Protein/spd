import { describe, expect, it } from 'vitest';
import type { EntityRelation } from '$lib/api/types';
import { toFlow, type FlowGraph } from './flow';
import { mapSvg, type MapPalette } from './map-image';
import { NODE_H, NODE_W, attachRelations, patchNode, startWalk, type WalkState } from './walk';

const ROOT = { type: 'protein', id: 'spd:protein:p1', label: 'P1' };
const SEQ = 'spd:sequence:s1';
const PALETTE: MapPalette = {
	background: '#000001',
	card: '#000002',
	border: '#000003',
	text: '#000004',
	muted: '#000005'
};

function edge(
	relationType: string,
	fromType: string,
	fromId: string,
	toType: string,
	toId: string,
	other?: { type: string; id: string; label?: string | null; subtitle?: string | null }
): EntityRelation {
	return {
		id: `${fromId}->${toId}:${relationType}`,
		relationType,
		direction: 'out',
		source: 'derived',
		from: { type: fromType, id: fromId },
		to: { type: toType, id: toId },
		...(other ? { other } : {})
	};
}

/** Root opened to one sequence, and the sequence points back at the root. */
function looped(): FlowGraph {
	const walk = startWalk(ROOT);
	const rootKey = walk.nodes[0].key;
	const opened = attachRelations(patchNode(walk, rootKey, { expanded: true }), rootKey, [
		edge('sequence_of', 'protein', ROOT.id, 'sequence', SEQ, {
			type: 'sequence',
			id: SEQ,
			label: 'Chain A',
			subtitle: '412 aa'
		})
	]);
	const seqKey = `sequence:${SEQ}`;
	const both = attachRelations(patchNode(opened, seqKey, { expanded: true }), seqKey, [
		edge('encoded_by', 'sequence', SEQ, 'protein', ROOT.id)
	]);
	return toFlow(both, {
		onToggle: () => {},
		onMore: () => {},
		onHover: () => {},
		backLabel: (e) => `back: ${e.relation}`
	});
}

const count = (svg: string, tag: string) => svg.split(`<${tag}`).length - 1;

describe('mapSvg', () => {
	it('draws the background, one card per node and one ray per edge', () => {
		const graph = looped();
		const image = mapSvg(graph, { palette: PALETTE });
		expect(graph.nodes).toHaveLength(2);
		expect(graph.edges).toHaveLength(2);
		// One card each, the background, and a chip behind the backlink label.
		expect(count(image.svg, 'rect')).toBe(graph.nodes.length + 2);
		expect(count(image.svg, 'line')).toBe(graph.edges.length);
	});

	it('keeps every card inside the padded box', () => {
		const graph = looped();
		const padding = 31;
		const image = mapSvg(graph, { palette: PALETTE, padding });
		const maxX = Math.max(...graph.nodes.map((n) => n.position.x + NODE_W));
		const minX = Math.min(...graph.nodes.map((n) => n.position.x));
		const maxY = Math.max(...graph.nodes.map((n) => n.position.y + NODE_H));
		const minY = Math.min(...graph.nodes.map((n) => n.position.y));
		expect(image.width).toBe(Math.max(maxX, NODE_W) + padding - (Math.min(minX, 0) - padding));
		expect(image.height).toBeGreaterThanOrEqual(maxY - minY + padding * 2);
	});

	it('escapes the labels it prints', () => {
		const walk = startWalk({ type: 'protein', id: 'spd:protein:p<1>', label: 'A & B <c>' });
		const graph = toFlow(walk, {
			onToggle: () => {},
			onMore: () => {},
			onHover: () => {},
			backLabel: () => ''
		});
		const { svg } = mapSvg(graph, { palette: PALETTE });
		expect(svg).toContain('A &amp; B &lt;c&gt;');
		expect(svg).not.toContain('A & B <c>');
	});

	it('writes the relation verb the edge that placed the card carried', () => {
		const { svg } = mapSvg(looped(), { palette: PALETTE });
		expect(svg).toContain('Chain A');
		expect(svg).toContain('412 aa');
		// The backlink is dashed and carries its label in a chip.
		expect(svg).toContain('stroke-dasharray="4 3"');
		expect(svg).toContain('back: encoded_by');
	});

	it('uses the palette it is given instead of the page tokens', () => {
		const { svg } = mapSvg(looped(), { palette: PALETTE });
		for (const colour of Object.values(PALETTE)) expect(svg).toContain(colour);
	});

	it('prints the footer only when asked', () => {
		const graph = looped();
		expect(mapSvg(graph, { palette: PALETTE, footer: 'SPD' }).svg).toContain('SPD');
		expect(mapSvg(graph, { palette: PALETTE, footer: '' }).svg).not.toContain('d.spicebio.top');
	});

	it('cuts a label that would run past the card', () => {
		const walk = startWalk({ type: 'protein', id: 'spd:protein:p1', label: 'x'.repeat(200) });
		const graph = toFlow(walk, {
			onToggle: () => {},
			onMore: () => {},
			onHover: () => {},
			backLabel: () => ''
		});
		const { svg } = mapSvg(graph, { palette: PALETTE });
		expect(svg).toContain('…');
		expect(svg).not.toContain('x'.repeat(200));
	});

	it('names a card by its public id when it has no label', () => {
		const walk: WalkState = startWalk({ type: 'protein', id: 'spd:protein:abcdef012345' });
		const graph = toFlow(walk, {
			onToggle: () => {},
			onMore: () => {},
			onHover: () => {},
			backLabel: () => ''
		});
		const { svg } = mapSvg(graph, { palette: PALETTE });
		expect(svg).not.toContain('undefined');
	});
});
