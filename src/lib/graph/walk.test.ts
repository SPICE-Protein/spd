import { describe, expect, it } from 'vitest';
import type { EntityRelation } from '$lib/api/types';
import {
	CHILD_LIMIT,
	NODE_H,
	NODE_W,
	RING,
	RING_PUSH,
	attachRelations,
	childrenOf,
	farSide,
	hiddenChildren,
	layoutWalk,
	nodeKey,
	patchNode,
	startWalk,
	visibleEdges,
	visibleNodes,
	type WalkState
} from './walk';

const ROOT = { type: 'protein', id: 'spd:protein:p1', label: 'P1' };

function edge(
	relationType: string,
	fromType: string,
	fromId: string,
	toType: string,
	toId: string,
	extra: Partial<EntityRelation> = {}
): EntityRelation {
	return {
		id: `${fromId}->${toId}:${relationType}`,
		relationType,
		direction: extra.direction ?? 'out',
		source: 'derived',
		from: { type: fromType, id: fromId },
		to: { type: toType, id: toId },
		...extra
	};
}

const SEQ = 'spd:sequence:s1';
const GENE = 'spd:gene:g1';

/** Root opened once, holding one sequence and one gene. */
function opened(): WalkState {
	const walk = startWalk(ROOT);
	const rootKey = walk.nodes[0].key;
	return attachRelations(patchNode(walk, rootKey, { expanded: true }), rootKey, [
		edge('sequence_of', 'protein', ROOT.id, 'sequence', SEQ, {
			other: { type: 'sequence', id: SEQ, label: 'Chain A', subtitle: '412 aa' }
		}),
		edge('encoded_by', 'protein', ROOT.id, 'gene', GENE)
	]);
}

describe('nodeKey', () => {
	it('joins type and id', () => {
		expect(nodeKey({ type: 'pdb-entry', id: 'spd:pdb:1abc' })).toBe('pdb-entry:spd:pdb:1abc');
	});
});

describe('farSide', () => {
	it('prefers the backend label', () => {
		const far = farSide(
			edge('sequence_of', 'protein', ROOT.id, 'sequence', SEQ, {
				other: { type: 'sequence', id: SEQ, label: 'Chain A' }
			}),
			nodeKey(ROOT)
		);
		expect(far.label).toBe('Chain A');
	});

	it('picks the endpoint that is not the node when `other` is absent', () => {
		const out = farSide(edge('encoded_by', 'protein', ROOT.id, 'gene', GENE), nodeKey(ROOT));
		expect(out.id).toBe(GENE);
		// The same row read from the far side answers the other endpoint.
		const back = farSide(
			edge('encoded_by', 'protein', ROOT.id, 'gene', GENE, { direction: 'in' }),
			nodeKey({ type: 'gene', id: GENE })
		);
		expect(back.id).toBe(ROOT.id);
	});
});

describe('attachRelations', () => {
	it('adds one child and one edge per relation', () => {
		const walk = opened();
		const rootKey = nodeKey(ROOT);
		const kids = childrenOf(walk.nodes, rootKey);
		expect(kids.map((k) => k.key)).toEqual([`sequence:${SEQ}`, `gene:${GENE}`]);
		expect(kids[0]).toMatchObject({
			type: 'sequence',
			label: 'Chain A',
			subtitle: '412 aa',
			relation: 'sequence_of',
			direction: 'out',
			depth: 1,
			expanded: false
		});
		expect(walk.edges).toHaveLength(2);
		expect(walk.edges[0]).toMatchObject({ from: rootKey, to: `sequence:${SEQ}`, back: false });
	});

	it('drops self edges and refuses to duplicate an edge on re-expansion', () => {
		const walk = startWalk(ROOT);
		const key = walk.nodes[0].key;
		const once = attachRelations(walk, key, [
			edge('other', 'protein', ROOT.id, 'protein', ROOT.id),
			edge('encoded_by', 'protein', ROOT.id, 'gene', GENE)
		]);
		expect(childrenOf(once.nodes, key)).toHaveLength(1);
		expect(once.edges).toHaveLength(1);

		const twice = attachRelations(once, key, [
			edge('encoded_by', 'protein', ROOT.id, 'gene', GENE)
		]);
		expect(childrenOf(twice.nodes, key)).toHaveLength(1);
		expect(twice.edges).toHaveLength(1);
	});

	it('closes a loop with an edge instead of a second node', () => {
		const walk = opened();
		const sequence = `sequence:${SEQ}`;
		const expanded = patchNode(walk, sequence, { expanded: true });
		const next = attachRelations(expanded, sequence, [
			edge('sequence_of', 'sequence', SEQ, 'protein', ROOT.id, { direction: 'in' })
		]);

		// Still one protein node: the record is where the reader left it.
		expect(next.nodes.filter((n) => n.key === nodeKey(ROOT))).toHaveLength(1);
		const back = next.edges.find((e) => e.back);
		expect(back).toBeDefined();
		expect(back).toMatchObject({ from: sequence, to: nodeKey(ROOT), relation: 'sequence_of' });
	});

	it('treats a record already placed elsewhere as a loop too', () => {
		const walk = opened();
		const gene = `gene:${GENE}`;
		const expanded = patchNode(walk, gene, { expanded: true });
		const next = attachRelations(expanded, gene, [
			edge('sequence_of', 'gene', GENE, 'sequence', SEQ)
		]);

		expect(next.nodes).toHaveLength(walk.nodes.length);
		expect(next.edges.at(-1)).toMatchObject({ from: gene, to: `sequence:${SEQ}`, back: true });
	});

	it('returns the same walk when the parent is unknown', () => {
		const walk = opened();
		expect(attachRelations(walk, 'gene:nope', [])).toBe(walk);
	});

	it('stops attaching nodes at the depth cap but still links loops', () => {
		let walk = startWalk(ROOT);
		let key = nodeKey(ROOT);
		for (let depth = 0; depth < 4; depth += 1) {
			walk = patchNode(walk, key, { expanded: true });
			const target = `spd:gene:g${depth}`;
			walk = attachRelations(walk, key, [
				edge('other', 'gene', target, 'gene', target, {
					other: { type: 'gene', id: target }
				})
			]);
			key = `gene:${target}`;
		}
		// Four hops: the fifth record is not placed.
		expect(walk.nodes).toHaveLength(5);
		const atLimit = attachRelations(patchNode(walk, key, { expanded: true }), key, [
			edge('other', 'gene', 'spd:gene:g9', 'gene', 'spd:gene:g9', {
				other: { type: 'gene', id: 'spd:gene:g9' }
			})
		]);
		expect(atLimit.nodes).toHaveLength(5);
		expect(atLimit.edges).toHaveLength(4);
	});
});

describe('visibleNodes', () => {
	it('hides children until the parent is expanded', () => {
		const walk = attachRelations(startWalk(ROOT), nodeKey(ROOT), [
			edge('encoded_by', 'protein', ROOT.id, 'gene', GENE)
		]);
		expect(visibleNodes(walk.nodes).map((n) => n.key)).toEqual([nodeKey(ROOT)]);
	});

	it('shows only the first childLimit and reports the remainder', () => {
		let walk = startWalk(ROOT);
		const key = walk.nodes[0].key;
		const relations = Array.from({ length: CHILD_LIMIT + 3 }, (_, i) =>
			edge('other', 'protein', ROOT.id, 'gene', `spd:gene:g${i}`)
		);
		walk = attachRelations(patchNode(walk, key, { expanded: true }), key, relations);
		expect(visibleNodes(walk.nodes)).toHaveLength(CHILD_LIMIT + 1);
		expect(hiddenChildren(walk.nodes, key)).toBe(3);

		const widened = patchNode(walk, key, { childLimit: CHILD_LIMIT + 3 });
		expect(visibleNodes(widened.nodes)).toHaveLength(CHILD_LIMIT + 4);
		expect(hiddenChildren(widened.nodes, key)).toBe(0);
	});

	it('hides a grandchild whose grandparent is collapsed', () => {
		const walk = opened();
		const gene = `gene:${GENE}`;
		const deep = attachRelations(patchNode(walk, gene, { expanded: true }), gene, [
			edge('other', 'gene', GENE, 'protein', 'spd:protein:p9')
		]);
		// Collapsing the root hides the gene and, through it, the protein.
		const collapsed = patchNode(deep, nodeKey(ROOT), { expanded: false });
		expect(visibleNodes(collapsed.nodes).map((n) => n.key)).toEqual([nodeKey(ROOT)]);
	});
});

describe('visibleEdges', () => {
	it('drops an edge whose far end is collapsed away', () => {
		const walk = opened();
		const rootKey = nodeKey(ROOT);
		const collapsed = patchNode(walk, rootKey, { expanded: false });
		const visible = visibleNodes(collapsed.nodes);
		expect(visible).toHaveLength(1);
		expect(visibleEdges(collapsed, visible)).toHaveLength(0);
	});

	it('keeps a loop edge when both ends are on screen', () => {
		const walk = opened();
		const sequence = `sequence:${SEQ}`;
		const looped = attachRelations(patchNode(walk, sequence, { expanded: true }), sequence, [
			edge('sequence_of', 'sequence', SEQ, 'protein', ROOT.id, { direction: 'in' })
		]);
		const visible = visibleNodes(looped.nodes);
		const edges = visibleEdges(looped, visible);
		expect(edges).toHaveLength(3);
		expect(edges.filter((e) => e.back)).toHaveLength(1);
	});
});

describe('layoutWalk', () => {
	const centre = (p: { x: number; y: number }) => ({
		x: p.x + NODE_W / 2,
		y: p.y + NODE_H / 2
	});
	const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
		Math.hypot(a.x - b.x, a.y - b.y);

	it('puts one root at the centre', () => {
		const layout = layoutWalk([startWalk(ROOT).nodes[0]]);
		expect(layout.positions).toHaveLength(1);
		expect(layout.positions[0]).toMatchObject({ x: -NODE_W / 2, y: -NODE_H / 2 });
		expect(layout.width).toBe(NODE_W);
		expect(layout.height).toBe(NODE_H);
	});

	it('puts every branch on its own ray, one ring out', () => {
		const layout = layoutWalk(visibleNodes(opened().nodes));
		const at = new Map(layout.positions.map((p) => [p.node.key, p]));
		const root = centre(at.get(nodeKey(ROOT))!);
		const gene = centre(at.get(`gene:${GENE}`)!);
		const sequence = centre(at.get(`sequence:${SEQ}`)!);

		expect(distance(root, gene)).toBeCloseTo(RING, 0);
		expect(distance(root, sequence)).toBeCloseTo(RING, 0);
		// Two rays, not two cards stacked on the same side.
		const angle = (p: { x: number; y: number }) =>
			Math.atan2(p.y - root.y, p.x - root.x);
		expect(Math.abs(angle(gene) - angle(sequence))).toBeCloseTo(Math.PI, 1);
	});

	it('sends grandchildren further out than their parent', () => {
		const walk = opened();
		const sequence = `sequence:${SEQ}`;
		const deep = attachRelations(patchNode(walk, sequence, { expanded: true }), sequence, [
			edge('other', 'sequence', SEQ, 'fold', 'spd:fold:f1'),
			edge('other', 'sequence', SEQ, 'fold', 'spd:fold:f2'),
			edge('other', 'sequence', SEQ, 'fold', 'spd:fold:f3')
		]);
		const layout = layoutWalk(visibleNodes(deep.nodes));
		const at = new Map(layout.positions.map((p) => [p.node.key, p]));
		const root = centre(at.get(nodeKey(ROOT))!);
		const sequenceAt = centre(at.get(sequence)!);
		const kids = ['fold:spd:fold:f1', 'fold:spd:fold:f2', 'fold:spd:fold:f3'].map((k) =>
			centre(at.get(k)!)
		);
		for (const kid of kids) {
			expect(distance(root, kid)).toBeGreaterThan(distance(root, sequenceAt));
			// Grandchildren land on the next ring, and no wedge push can send
			// them past the cap.
			expect(distance(root, kid)).toBeGreaterThanOrEqual(RING * 2 - 1);
			expect(distance(root, kid)).toBeLessThanOrEqual(RING * 2 + RING_PUSH + 1);
		}
		// The folds share one wedge, so they are one ray apart rather than
		// scattered around the sequence.
		expect(distance(kids[0], kids[1])).toBeGreaterThan(0);
		// The circle grew in both directions, not just along one axis.
		expect(layout.width).toBeGreaterThan(NODE_W);
		expect(layout.height).toBeGreaterThan(NODE_H);
	});

	it('leaves no two cards overlapping', () => {
		const layout = layoutWalk(visibleNodes(opened().nodes));
		for (let i = 0; i < layout.positions.length; i += 1) {
			for (let j = i + 1; j < layout.positions.length; j += 1) {
				const a = layout.positions[i];
				const b = layout.positions[j];
				const apart =
					Math.abs(a.x - b.x) >= NODE_W || Math.abs(a.y - b.y) >= NODE_H;
				expect(apart).toBe(true);
			}
		}
	});

	it('is deterministic for the same input', () => {
		const nodes = visibleNodes(opened().nodes);
		expect(layoutWalk(nodes)).toEqual(layoutWalk(nodes));
	});
});
