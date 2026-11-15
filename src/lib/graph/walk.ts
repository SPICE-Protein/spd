/**
 * The walk model behind the record map: a tree the reader grows one node at a
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
 * - The graph is rendered as a TREE even though the underlying edges form a
 *   graph: the same record can be reached by two paths. The second arrival is
 *   marked `repeat` instead of being merged, because merging would move a node
 *   the reader already has a place for, and a map that rearranges itself while
 *   you walk is unreadable. A repeat node still expands — it is the same
 *   record, it just is not the same spot on the canvas.
 * - A node carries how many of its children are on screen (`childLimit`): one
 *   protein can hold two hundred edges, and no one wants them all at once. The
 *   relation list is attached in full so "show more" is local.
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
	/** Unique on the canvas: `<type>:<id>` for the first arrival, that plus
	 *  `#n` for later ones. Two arrivals of one record must be two nodes,
	 *  because expanding or collapsing one must not move the other. */
	key: string;
	/** `<type>:<id>` — the record, shared by every arrival. This is what the
	 *  relation cache is keyed on and what makes an arrival a `repeat`. */
	record: string;
	parent: string | null;
	relation: string | null;
	direction: 'in' | 'out' | null;
	depth: number;
	expanded: boolean;
	status: 'idle' | 'loading' | 'loaded' | 'error';
	error: string | null;
	/** Reached before by another path: same record, different place. */
	repeat: boolean;
	childLimit: number;
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
	const record = nodeKey(ref);
	return {
		...ref,
		key: record,
		record,
		parent: null,
		relation: null,
		direction: null,
		depth: 0,
		expanded: false,
		status: 'idle',
		error: null,
		repeat: false,
		childLimit: CHILD_LIMIT
	};
}

export function statusOf(nodes: WalkNode[], key: string): WalkNode | undefined {
	return nodes.find((n) => n.key === key);
}

export function childrenOf(nodes: WalkNode[], key: string): WalkNode[] {
	return nodes.filter((n) => n.parent === key);
}

/** Mark one node as loading/loaded/error without touching its children. */
export function patch(
	nodes: WalkNode[],
	key: string,
	change: Partial<WalkNode>
): WalkNode[] {
	return nodes.map((n) => (n.key === key ? { ...n, ...change } : n));
}

/**
 * Attach one entity's relation list under a node.
 *
 * Self-edges are dropped (a record is not its own neighbour), edges to types
 * the walk cannot read are kept as leaves (they are still true statements),
 * and a every far side already somewhere on the canvas is marked `repeat`.
 */
export function attachRelations(
	nodes: WalkNode[],
	parentKey: string,
	relations: EntityRelation[]
): WalkNode[] {
	const parent = statusOf(nodes, parentKey);
	if (!parent) return nodes;
	// Re-expanding a node must not duplicate its children.
	const existing = new Set(childrenOf(nodes, parentKey).map((n) => n.record));
	// How many times each record is already on the canvas, so a new arrival
	// gets the next ordinal in its key.
	const arrivals = new Map<string, number>();
	for (const node of nodes) arrivals.set(node.record, (arrivals.get(node.record) ?? 0) + 1);
	const added: WalkNode[] = [];
	let total = nodes.length;
	for (const relation of relations) {
		if (total >= MAX_NODES) break;
		// The far side is decided against the record, not the node key: a repeat
		// node's key carries an ordinal the edge never uses.
		const far = farSide(relation, parent.record);
		const record = nodeKey(far);
		if (!far.type || !far.id || record === parent.record || existing.has(record)) continue;
		const count = (arrivals.get(record) ?? 0) + 1;
		added.push({
			type: far.type,
			id: far.id,
			label: far.label ?? null,
			subtitle: far.subtitle ?? null,
			key: count === 1 ? record : `${record}#${count}`,
			record,
			parent: parentKey,
			relation: relation.relationType,
			direction: relation.direction ?? null,
			depth: parent.depth + 1,
			expanded: false,
			status: 'idle',
			error: null,
			repeat: count > 1,
			childLimit: CHILD_LIMIT
		});
		existing.add(record);
		arrivals.set(record, count);
		total += 1;
	}
	return [...nodes, ...added];
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
 * Lay the visible tree out left to right: depth grows along x, siblings stack
 * along y, a parent sits at the middle of its children.
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
