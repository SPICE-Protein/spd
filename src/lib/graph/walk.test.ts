import { describe, expect, it } from 'vitest';
import type { EntityRelation } from '$lib/api/types';
import {
	CHILD_LIMIT,
	GAP_X,
	GAP_Y,
	NODE_H,
	NODE_W,
	attachRelations,
	childrenOf,
	farSide,
	hiddenChildren,
	layoutWalk,
	nodeKey,
	patch,
	rootNode,
	visibleNodes,
	type WalkNode
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

function expandedRoot(): WalkNode[] {
	const root = rootNode(ROOT);
	const relations = [
		edge('sequence_of', 'protein', ROOT.id, 'sequence', 'spd:sequence:s1', {
			other: { type: 'sequence', id: 'spd:sequence:s1', label: 'Chain A', subtitle: '412 aa' }
		}),
		edge('encoded_by', 'protein', ROOT.id, 'gene', 'spd:gene:g1')
	];
	return attachRelations(patch([root], root.key, { expanded: true }), root.key, relations);
}

describe('nodeKey', () => {
	it('joins type and id', () => {
		expect(nodeKey({ type: 'pdb-entry', id: 'spd:pdb:1abc' })).toBe('pdb-entry:spd:pdb:1abc');
	});
});

describe('farSide', () => {
	it('prefers the backend label', () => {
		const far = farSide(
			edge('sequence_of', 'protein', ROOT.id, 'sequence', 'spd:sequence:s1', {
				other: { type: 'sequence', id: 'spd:sequence:s1', label: 'Chain A' }
			}),
			nodeKey(ROOT)
		);
		expect(far.label).toBe('Chain A');
	});

	it('picks the endpoint that is not the node when `other` is absent', () => {
		const fromKey = nodeKey(ROOT);
		const out = farSide(edge('encoded_by', 'protein', ROOT.id, 'gene', 'spd:gene:g1'), fromKey);
		expect(out.id).toBe('spd:gene:g1');
		// The same row read from the far side answers the other endpoint.
		const back = farSide(
			edge('encoded_by', 'protein', ROOT.id, 'gene', 'spd:gene:g1', { direction: 'in' }),
			nodeKey({ type: 'gene', id: 'spd:gene:g1' })
		);
		expect(back.id).toBe(ROOT.id);
	});
});

describe('attachRelations', () => {
	it('adds one child per edge with depth and relation', () => {
		const nodes = expandedRoot();
		const kids = childrenOf(nodes, nodeKey(ROOT));
		expect(kids.map((k) => k.key)).toEqual(['sequence:spd:sequence:s1', 'gene:spd:gene:g1']);
		expect(kids[0]).toMatchObject({
			type: 'sequence',
			label: 'Chain A',
			subtitle: '412 aa',
			relation: 'sequence_of',
			direction: 'out',
			depth: 1,
			expanded: false,
			repeat: false
		});
	});

	it('drops self edges and refuses to duplicate an already attached child', () => {
		const root = rootNode(ROOT);
		const key = root.key;
		const once = attachRelations([root], key, [
			edge('other', 'protein', ROOT.id, 'protein', ROOT.id),
			edge('encoded_by', 'protein', ROOT.id, 'gene', 'spd:gene:g1')
		]);
		expect(childrenOf(once, key)).toHaveLength(1);
		const twice = attachRelations(once, key, [
			edge('encoded_by', 'protein', ROOT.id, 'gene', 'spd:gene:g1')
		]);
		expect(childrenOf(twice, key)).toHaveLength(1);
	});

	it('keeps a second arrival as a repeat rather than merging it', () => {
		const nodes = expandedRoot();
		const record = nodeKey({ type: 'gene', id: 'spd:gene:g1' });
		// The same gene reached again from the sequence subtree.
		const next = attachRelations(
			patch(nodes, 'sequence:spd:sequence:s1', { expanded: true }),
			'sequence:spd:sequence:s1',
			[edge('sequence_of', 'sequence', 'spd:sequence:s1', 'gene', 'spd:gene:g1')]
		);
		const arrivals = next.filter((n) => n.record === record);
		expect(arrivals).toHaveLength(2);
		expect(arrivals[0]).toMatchObject({ key: record, repeat: false });
		expect(arrivals[1]).toMatchObject({
			key: `${record}#2`,
			repeat: true,
			parent: 'sequence:spd:sequence:s1'
		});
	});

	it('expands the two arrivals of one record independently', () => {
		const nodes = expandedRoot();
		const record = nodeKey({ type: 'gene', id: 'spd:gene:g1' });
		const twice = attachRelations(
			patch(nodes, 'sequence:spd:sequence:s1', { expanded: true }),
			'sequence:spd:sequence:s1',
			[edge('sequence_of', 'sequence', 'spd:sequence:s1', 'gene', 'spd:gene:g1')]
		);
		const opened = patch(twice, `${record}#2`, { expanded: true });
		expect(opened.find((n) => n.key === record)!.expanded).toBe(false);
		expect(opened.find((n) => n.key === `${record}#2`)!.expanded).toBe(true);
	});

	it('returns the same array when the parent is unknown', () => {
		const nodes = expandedRoot();
		expect(attachRelations(nodes, 'gene:nope', [])).toBe(nodes);
	});
});

describe('visibleNodes', () => {
	it('hides children until the parent is expanded', () => {
		const root = rootNode(ROOT);
		const nodes = attachRelations([root], root.key, [
			edge('encoded_by', 'protein', ROOT.id, 'gene', 'spd:gene:g1')
		]);
		expect(visibleNodes(nodes).map((n) => n.key)).toEqual([root.key]);
	});

	it('shows only the first childLimit and reports the remainder', () => {
		const root = rootNode(ROOT);
		const relations = Array.from({ length: CHILD_LIMIT + 3 }, (_, i) =>
			edge('other', 'protein', ROOT.id, 'gene', `spd:gene:g${i}`)
		);
		const nodes = attachRelations(patch([root], root.key, { expanded: true }), root.key, relations);
		expect(visibleNodes(nodes)).toHaveLength(CHILD_LIMIT + 1);
		expect(hiddenChildren(nodes, root.key)).toBe(3);

		const widened = patch(nodes, root.key, { childLimit: CHILD_LIMIT + 3 });
		expect(visibleNodes(widened)).toHaveLength(CHILD_LIMIT + 4);
		expect(hiddenChildren(widened, root.key)).toBe(0);
	});

	it('hides a grandchild whose grandparent is collapsed', () => {
		const nodes = expandedRoot();
		const gene = nodeKey({ type: 'gene', id: 'spd:gene:g1' });
		const deep = attachRelations(
			patch(nodes, gene, { expanded: true }),
			gene,
			[edge('other', 'gene', 'spd:gene:g1', 'protein', 'spd:protein:p9')]
		);
		// Collapsing the root hides the gene and, through it, the protein.
		const collapsed = patch(deep, nodeKey(ROOT), { expanded: false });
		expect(visibleNodes(collapsed).map((n) => n.key)).toEqual([nodeKey(ROOT)]);
	});
});

describe('layoutWalk', () => {
	it('puts one root at the origin', () => {
		const layout = layoutWalk([rootNode(ROOT)]);
		expect(layout.positions).toHaveLength(1);
		expect(layout.positions[0]).toMatchObject({ x: 0, y: 0 });
		expect(layout.width).toBe(NODE_W);
		expect(layout.height).toBe(NODE_H + 24);
	});

	it('grows depth along x and stacks siblings along y', () => {
		const layout = layoutWalk(visibleNodes(expandedRoot()));
		const at = new Map(layout.positions.map((p) => [p.node.key, p]));
		const gene = at.get('gene:spd:gene:g1')!;
		const sequence = at.get('sequence:spd:sequence:s1')!;
		expect(at.get(nodeKey(ROOT))!.x).toBe(0);
		expect(gene.x).toBe(NODE_W + GAP_X);
		expect(sequence.x).toBe(NODE_W + GAP_X);
		expect(sequence.y).toBe(0);
		expect(gene.y).toBe(NODE_H + GAP_Y);
		// The root sits at the middle of the two-child band.
		expect(at.get(nodeKey(ROOT))!.y).toBe((NODE_H + GAP_Y) / 2);
	});

	it('centres a parent on the band its children occupy', () => {
		const nodes = expandedRoot();
		const sequence = 'sequence:spd:sequence:s1';
		const deep = attachRelations(patch(nodes, sequence, { expanded: true }), sequence, [
			edge('other', 'sequence', 'spd:sequence:s1', 'fold', 'spd:fold:f1'),
			edge('other', 'sequence', 'spd:sequence:s1', 'fold', 'spd:fold:f2'),
			edge('other', 'sequence', 'spd:sequence:s1', 'fold', 'spd:fold:f3')
		]);
		const layout = layoutWalk(visibleNodes(deep));
		const at = new Map(layout.positions.map((p) => [p.node.key, p]));
		const kids = ['fold:spd:fold:f1', 'fold:spd:fold:f2', 'fold:spd:fold:f3'].map(
			(k) => at.get(k)!
		);
		const first = kids[0];
		const last = kids[kids.length - 1];
		expect(at.get(sequence)!.y).toBe((first.y + (last.y - first.y) / 2) | 0);
		// The band is taller than one node, so the layout grew with it.
		expect(layout.height).toBeGreaterThan(NODE_H + 24);
	});

	it('is deterministic for the same input', () => {
		const nodes = visibleNodes(expandedRoot());
		expect(layoutWalk(nodes)).toEqual(layoutWalk(nodes));
	});
});
