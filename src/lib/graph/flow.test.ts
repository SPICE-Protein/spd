import { describe, expect, it } from 'vitest';
import { attachRelations, patchNode, startWalk, type WalkState } from './walk';
import { MAP_EDGE_TYPE, MAP_NODE_TYPE, toFlow } from './flow';

const ROOT = { type: 'protein', id: 'spd:protein:p1', label: 'P1' };
const A = 'spd:gene:a';
const B = 'spd:gene:b';
const A_KEY = `gene:${A}`;
const B_KEY = `gene:${B}`;
const ROOT_KEY = 'protein:spd:protein:p1';

function edge(toId: string) {
	return {
		id: `e-${toId}`,
		relationType: 'encoded_by',
		direction: 'out' as const,
		source: 'derived',
		from: { type: 'protein', id: ROOT.id },
		to: { type: 'gene', id: toId },
		other: { type: 'gene', id: toId }
	};
}

function walk(): WalkState {
	const start = startWalk(ROOT);
	return attachRelations(patchNode(start, ROOT_KEY, { expanded: true }), ROOT_KEY, [
		edge(A),
		edge(B)
	]);
}

const handlers = {
	onToggle: () => {},
	onMore: () => {},
	onHover: () => {},
	backLabel: () => ''
};

describe('toFlow', () => {
	it('uses the layout until a node was moved by hand', () => {
		const laid = toFlow(walk(), handlers);
		const moved = toFlow(walk(), handlers, { pinned: { [A_KEY]: { x: 900, y: 40 } } });

		const laidAt = laid.nodes.find((n) => n.id === A_KEY)!.position;
		const movedAt = moved.nodes.find((n) => n.id === A_KEY)!.position;
		expect(movedAt).toEqual({ x: 900, y: 40 });
		expect(laidAt).not.toEqual(movedAt);
		// Everything the reader did not touch stays where the layout put it.
		expect(moved.nodes.find((n) => n.id === B_KEY)!.position).toEqual(
			laid.nodes.find((n) => n.id === B_KEY)!.position
		);
	});

	it('leaves nodes draggable and sized', () => {
		const node = toFlow(walk(), handlers).nodes[0];
		expect(node.type).toBe(MAP_NODE_TYPE);
		expect(node.draggable).not.toBe(false);
		expect(node.style).toContain('px');
	});

	it('fades the edges of every record the pointer is not on', () => {
		const dimmed = toFlow(walk(), handlers, { highlight: A_KEY });
		const edges = dimmed.edges;
		expect(edges.every((e) => e.type === MAP_EDGE_TYPE)).toBe(true);

		const own = edges.find((e) => e.target === A_KEY)!;
		const other = edges.find((e) => e.target === B_KEY)!;
		expect(own.style).not.toContain('opacity');
		expect(other.style).toContain('opacity:0.18');
	});

	it('keeps every edge lit when nothing is hovered', () => {
		const edges = toFlow(walk(), handlers).edges;
		expect(edges.every((e) => !e.style?.includes('opacity'))).toBe(true);
	});

	it('reports whether a node holds any children at all', () => {
		const nodes = toFlow(walk(), handlers).nodes;
		const root = nodes.find((n) => n.id === ROOT_KEY)!;
		// Two children fit under the preview limit, so nothing is hidden — and
		// the card must not read that as "nothing linked".
		expect(root.data.hidden).toBe(0);
		expect(root.data.children).toBe(2);
		expect(nodes.find((n) => n.id === A_KEY)!.data.children).toBe(0);
	});
});
