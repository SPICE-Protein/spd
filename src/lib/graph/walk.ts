/**
 * The walk model behind the record map: a graph the reader grows one node at a
 * time.
 *
 * The map answers "what does this record touch, and what does *that* touch",
 * which is the question people actually ask of a broad catalog — not "write me
 * a query". Each expansion reads exactly one entity's relation list, so the
 * cost of the map is the number of nodes the reader chose to open, and nothing
 * has to be prefetched or budgeted.
 *
 * Shape decisions worth knowing before reading the code:
 *
 * - One node per record. A second path to a record the reader already has adds
 *   an EDGE back to that node instead of a second copy: the record is at one
 *   place on the canvas, and the loop the reader just found is visible as a
 *   loop. Those edges are flagged `back` so the canvas can draw them as
 *   backlinks rather than as fresh branches.
 * - Placement still needs a single parent per node, so the first edge that
 *   reaches a record becomes its `parent` — the spanning tree the layout is
 *   built on. Later edges are edges only.
 * - A node carries how many of its children are on screen (`childLimit`): one
 *   protein can hold two hundred edges, and no one wants them all at once. New
 *   records are attached in full so "show more" stays local; backlinks are
 *   drawn regardless, because they cost no space.
 * - Depth and total nodes are capped. The cap is what keeps a walk from
 *   turning into a crawl of the whole catalog; hitting it is visible (the node
 *   says so) rather than silent.
 */

import type { EntityRef, EntityRelation } from '$lib/api/types';

export const NODE_W = 224;
export const NODE_H = 64;
export const GAP_X = 64;
export const GAP_Y = 12;
/** How many children a freshly expanded node puts on the canvas. */
export const CHILD_LIMIT = 8;
/** How far from the root the walk may go. */
export const MAX_DEPTH = 4;
/** A backstop against a reader who expands everything, everywhere. */
export const MAX_NODES = 400;

export interface WalkRef {
	type: string;
	id: string;
	label?: string | null;
	subtitle?: string | null;
}

export interface WalkNode extends WalkRef {
	/** `<type>:<id>` — one node per record, so this is also its identity. */
	key: string;
	/** The edge that placed it; the layout stacks it under this node. */
	parent: string | null;
	relation: string | null;
	direction: 'in' | 'out' | null;
	depth: number;
	expanded: boolean;
	status: 'idle' | 'loading' | 'loaded' | 'error';
	error: string | null;
	childLimit: number;
}

export interface WalkEdge {
	/** Unique per (queried node, far side, relation) so re-expansion is a no-op. */
	key: string;
	/** The node whose relation list produced this edge. */
	from: string;
	to: string;
	relation: string;
	direction: 'in' | 'out' | null;
	/** The far side was already on the canvas: this edge closes a loop. */
	back: boolean;
}

export interface WalkState {
	nodes: WalkNode[];
	edges: WalkEdge[];
}

export function nodeKey(ref: { type: string; id: string }): string {
	return `${ref.type}:${ref.id}`;
}

/** The far end of an edge, with the catalog's own name when the backend sent
 *  one. Older or hand-built rows may lack `other`; the stored endpoints say
 *  which side is which. */
export function farSide(relation: EntityRelation, fromKey: string): EntityRef & {
	label?: string | null;
	subtitle?: string | null;
} {
	if (relation.other) return relation.other;
	const from = nodeKey(relation.from);
	return from === fromKey ? relation.to : relation.from;
}

export function rootNode(ref: WalkRef): WalkNode {
	const key = nodeKey(ref);
	return {
		...ref,
		key,
		parent: null,
		relation: null,
		direction: null,
		depth: 0,
		expanded: false,
		status: 'idle',
		error: null,
		childLimit: CHILD_LIMIT
	};
}

export function startWalk(ref: WalkRef): WalkState {
	return { nodes: [rootNode(ref)], edges: [] };
}

export function statusOf(nodes: WalkNode[], key: string): WalkNode | undefined {
	return nodes.find((n) => n.key === key);
}

export function childrenOf(nodes: WalkNode[], key: string): WalkNode[] {
	return nodes.filter((n) => n.parent === key);
}

/** Mark one node as loading/loaded/error without touching its children. */
export function patchNode(walk: WalkState, key: string, change: Partial<WalkNode>): WalkState {
	return {
		nodes: walk.nodes.map((n) => (n.key === key ? { ...n, ...change } : n)),
		edges: walk.edges
	};
}

/**
 * Record one entity's relation list.
 *
 * Self-edges are dropped (a record is not its own neighbour), edges to a record
 * already on the canvas become backlinks, and everything else becomes a child.
 * Edges to types the walk cannot read are kept: they are still true statements.
 */
export function attachRelations(
	walk: WalkState,
	parentKey: string,
	relations: EntityRelation[]
): WalkState {
	const parent = statusOf(walk.nodes, parentKey);
	if (!parent) return walk;

	const nodes = [...walk.nodes];
	const edges = [...walk.edges];
	const onCanvas = new Set(nodes.map((n) => n.key));
	const linked = new Set(edges.map((e) => e.key));
	let total = nodes.length;

	for (const relation of relations) {
		const far = farSide(relation, parent.key);
		const farKey = nodeKey(far);
		if (!far.type || !far.id || farKey === parent.key) continue;

		const edgeKey = `${parent.key}>${farKey}:${relation.relationType}`;
		if (linked.has(edgeKey)) continue;
		linked.add(edgeKey);

		const exists = onCanvas.has(farKey);
		if (!exists && (total >= MAX_NODES || parent.depth + 1 > MAX_DEPTH)) continue;

		edges.push({
			key: edgeKey,
			from: parent.key,
			to: farKey,
			relation: relation.relationType,
			direction: relation.direction ?? null,
			back: exists
		});

		if (exists) continue;
		nodes.push({
			type: far.type,
			id: far.id,
			label: far.label ?? null,
			subtitle: far.subtitle ?? null,
			key: farKey,
			parent: parent.key,
			relation: relation.relationType,
			direction: relation.direction ?? null,
			depth: parent.depth + 1,
			expanded: false,
			status: 'idle',
			error: null,
			childLimit: CHILD_LIMIT
		});
		onCanvas.add(farKey);
		total += 1;
	}

	return { nodes, edges };
}

/** Nodes whose ancestors are all expanded and that fall inside their parent's
 *  visible slice. This is what the canvas draws. */
export function visibleNodes(nodes: WalkNode[]): WalkNode[] {
	const byKey = new Map(nodes.map((n) => [n.key, n]));
	const drawn = new Set<string>();
	const shown = new Map<string, number>();
	const visible: WalkNode[] = [];
	// Parents are always appended before their children, so one pass sees every
	// ancestor's decision before it is needed.
	for (const node of nodes) {
		if (node.parent === null) {
			visible.push(node);
			drawn.add(node.key);
			continue;
		}
		const parent = byKey.get(node.parent);
		if (!parent || !drawn.has(parent.key) || !parent.expanded) continue;
		const index = shown.get(node.parent) ?? 0;
		if (index >= parent.childLimit) continue;
		shown.set(node.parent, index + 1);
		visible.push(node);
		drawn.add(node.key);
	}
	return visible;
}

/** How many children a node has beyond the slice it is showing. */
export function hiddenChildren(nodes: WalkNode[], key: string): number {
	const parent = statusOf(nodes, key);
	if (!parent) return 0;
	return Math.max(0, childrenOf(nodes, key).length - parent.childLimit);
}

/** Edges with both ends on screen. A collapsed branch takes its edges with it,
 *  including the backlinks into it. */
export function visibleEdges(walk: WalkState, visible: WalkNode[]): WalkEdge[] {
	const onCanvas = new Set(visible.map((n) => n.key));
	return walk.edges.filter((e) => onCanvas.has(e.from) && onCanvas.has(e.to));
}

export interface Positioned {
	node: WalkNode;
	x: number;
	y: number;
}

export interface WalkLayout {
	positions: Positioned[];
	width: number;
	height: number;
}

/**
 * Lay the visible spanning tree out left to right: depth grows along x,
 * siblings stack along y, a parent sits at the middle of its children.
 *
 * Deterministic on purpose — no physics, no settling animation. A map someone
 * is reading must not move under their cursor when an unrelated branch opens.
 */
export function layoutWalk(nodes: WalkNode[]): WalkLayout {
	const byParent = new Map<string, WalkNode[]>();
	for (const node of nodes) {
		if (node.parent === null) continue;
		const bucket = byParent.get(node.parent);
		if (bucket) bucket.push(node);
		else byParent.set(node.parent, [node]);
	}
	const heights = new Map<string, number>();
	const measure = (node: WalkNode): number => {
		const kids = byParent.get(node.key) ?? [];
		if (kids.length === 0) {
			heights.set(node.key, NODE_H);
			return NODE_H;
		}
		const sum = kids.reduce((acc, kid) => acc + measure(kid), 0) + GAP_Y * (kids.length - 1);
		const height = Math.max(NODE_H, sum);
		heights.set(node.key, height);
		return height;
	};

	const positions: Positioned[] = [];
	let maxDepth = 0;
	const place = (node: WalkNode, top: number) => {
		const height = heights.get(node.key) ?? NODE_H;
		const kids = byParent.get(node.key) ?? [];
		const x = node.depth * (NODE_W + GAP_X);
		maxDepth = Math.max(maxDepth, node.depth);
		if (kids.length === 0) {
			positions.push({ node, x, y: top + (height - NODE_H) / 2 });
			return;
		}
		let cursor = top;
		for (const kid of kids) {
			const kidHeight = heights.get(kid.key) ?? NODE_H;
			place(kid, cursor);
			cursor += kidHeight + GAP_Y;
		}
		// Centre on the band the children occupy, not on the first one.
		const first = positions.find((p) => p.node.key === kids[0].key);
		const last = positions.find((p) => p.node.key === kids[kids.length - 1].key);
		const centre =
			first && last ? (first.y + (last.y - first.y) / 2) | 0 : top + (height - NODE_H) / 2;
		positions.push({ node, x, y: centre });
	};

	const roots = nodes.filter((n) => n.parent === null);
	let top = 0;
	for (const root of roots) {
		place(root, top);
		top += (heights.get(root.key) ?? NODE_H) + GAP_Y;
	}
	const height = positions.reduce((acc, p) => Math.max(acc, p.y + NODE_H), NODE_H);
	return {
		positions,
		width: (maxDepth + 1) * NODE_W + maxDepth * GAP_X,
		height: height + 24
	};
}
