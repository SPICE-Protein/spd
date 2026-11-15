/**
 * Projection from the walk model onto Svelte Flow's node/edge arrays.
 *
 * Svelte Flow owns the canvas (panning, zooming, hit testing, edge anchors)
 * but not the arrangement: positions still come from `layoutWalk`, so the
 * picture is the same deterministic tree it was before, only movable and
 * zoomable. Keeping the projection here — rather than inside the component —
 * means the thing the canvas draws can be asserted without a DOM.
 */
import type { Edge, Node } from '@xyflow/svelte';
import {
	NODE_H,
	NODE_W,
	hiddenChildren,
	layoutWalk,
	visibleNodes,
	type WalkNode
} from './walk';

/** One node's payload: the walk node itself plus the two actions a card
 *  offers. Labels are looked up by the card, so this stays language-free. */
export interface MapNodeData extends Record<string, unknown> {
	walk: WalkNode;
	/** Children this node holds but is not showing yet. */
	hidden: number;
	onToggle: (key: string) => void;
	onMore: (key: string) => void;
}

/** Registered in `nodeTypes`; the canvas asks for it by name. */
export const MAP_NODE_TYPE = 'record';

export interface FlowHandlers {
	onToggle: (key: string) => void;
	onMore: (key: string) => void;
}

export interface FlowGraph {
	nodes: Node<MapNodeData>[];
	edges: Edge[];
}

export function toFlow(walk: WalkNode[], handlers: FlowHandlers): FlowGraph {
	const visible = visibleNodes(walk);
	const { positions } = layoutWalk(visible);
	const nodes: Node<MapNodeData>[] = positions.map(({ node, x, y }) => ({
		id: node.key,
		type: MAP_NODE_TYPE,
		position: { x, y },
		// A fixed box keeps the layout stable before the DOM is measured: the
		// arrangement is known, Svelte Flow is only asked to draw it.
		style: `width:${NODE_W}px;height:${NODE_H}px;`,
		// Dragging would move a node away from the tree the next expansion
		// recomputes, so the map is read-only in space and movable in view.
		draggable: false,
		data: {
			walk: node,
			hidden: hiddenChildren(walk, node.key),
			onToggle: handlers.onToggle,
			onMore: handlers.onMore
		}
	}));

	const onCanvas = new Set(positions.map((p) => p.node.key));
	const edges: Edge[] = positions
		.filter((p) => p.node.parent !== null && onCanvas.has(p.node.parent))
		.map((p) => ({
			id: `edge:${p.node.parent}->${p.node.key}`,
			source: p.node.parent as string,
			target: p.node.key,
			// No arrowheads: the edge shows that two records are neighbours, and
			// the relation verb on the card carries which way the statement runs.
			// A dashed line marks the second arrival of a record already drawn.
			style: p.node.repeat
				? 'stroke:var(--muted-foreground);stroke-width:1.25;stroke-dasharray:4 3'
				: 'stroke:var(--border);stroke-width:1.25'
		}));

	return { nodes, edges };
}
