/**
 * Projection from the walk model onto Svelte Flow's node/edge arrays.
 *
 * Svelte Flow owns the canvas (panning, zooming, hit testing, edge anchors)
 * but not the arrangement: positions come from `layoutWalk`, unless the reader
 * dragged a node somewhere and that place wins. Keeping the projection here —
 * rather than inside the component — means the thing the canvas draws can be
 * asserted without a DOM.
 */
import type { Edge, Node } from '@xyflow/svelte';
import {
	NODE_H,
	NODE_W,
	childrenOf,
	hiddenChildren,
	layoutWalk,
	visibleEdges,
	visibleNodes,
	type WalkEdge,
	type WalkNode,
	type WalkState
} from './walk';

/** One node's payload: the walk node itself plus the two actions a card
 *  offers. Labels are looked up by the card, so this stays language-free. */
export interface MapNodeData extends Record<string, unknown> {
	walk: WalkNode;
	/** Children this node holds but is not showing yet. */
	hidden: number;
	/** How many children it holds at all — zero is the only honest "nothing
	 *  linked", while `hidden === 0` also means "all of them fit". */
	children: number;
	onToggle: (key: string) => void;
	onMore: (key: string) => void;
	onHover: (key: string | null) => void;
}

/** Registered in `nodeTypes`; the canvas asks for it by name. */
export const MAP_NODE_TYPE = 'record';
/** Registered in `edgeTypes`. One edge component draws both kinds: the dashed
 *  backlink is the only one that needs text. */
export const MAP_EDGE_TYPE = 'record-edge';

export interface FlowHandlers {
	onToggle: (key: string) => void;
	onMore: (key: string) => void;
	onHover: (key: string | null) => void;
	/** What a backlink says; the canvas owns the wording, this owns none. */
	backLabel: (edge: WalkEdge) => string;
}

export interface FlowOptions {
	/** Places the reader moved by hand; the layout is the fallback. */
	pinned?: Record<string, { x: number; y: number }>;
	/** The node under the pointer: its own edges stay lit, the rest recede. */
	highlight?: string | null;
}

export interface FlowGraph {
	nodes: Node<MapNodeData>[];
	edges: Edge[];
}

const EDGE_STYLE = 'stroke:var(--border);stroke-width:1.25';
const BACK_EDGE_STYLE =
	'stroke:var(--muted-foreground);stroke-width:1.25;stroke-dasharray:4 3';

export function toFlow(
	walk: WalkState,
	handlers: FlowHandlers,
	options: FlowOptions = {}
): FlowGraph {
	const visible = visibleNodes(walk.nodes);
	const { positions } = layoutWalk(visible);
	const highlight = options.highlight ?? null;
	const nodes: Node<MapNodeData>[] = positions.map(({ node, x, y }) => ({
		id: node.key,
		type: MAP_NODE_TYPE,
		position: options.pinned?.[node.key] ?? { x, y },
		// A fixed box keeps the layout stable before the DOM is measured: the
		// arrangement is known, Svelte Flow is only asked to draw it.
		style: `width:${NODE_W}px;height:${NODE_H}px;`,
		data: {
			walk: node,
			hidden: hiddenChildren(walk.nodes, node.key),
			children: childrenOf(walk.nodes, node.key).length,
			onToggle: handlers.onToggle,
			onMore: handlers.onMore,
			onHover: handlers.onHover
		}
	}));

	const edges: Edge[] = visibleEdges(walk, visible).map((edge) => {
		// Hovering a card is how a dense map is read: only that record's own
		// edges stay legible.
		const dim =
			highlight !== null && edge.from !== highlight && edge.to !== highlight
				? ';opacity:0.18'
				: '';
		return {
			id: edge.key,
			source: edge.from,
			target: edge.to,
			type: MAP_EDGE_TYPE,
			data: { back: edge.back },
			// No arrowheads: the edge shows that two records are neighbours, and
			// the relation verb carries which way the statement runs. A branch edge
			// carries that verb on the child's card; a backlink has no card of its
			// own, so it is labelled and drawn dashed.
			...(edge.back
				? {
						label: handlers.backLabel(edge),
						labelStyle: 'fill:var(--muted-foreground);font-size:10px',
						style: `${BACK_EDGE_STYLE}${dim}`
					}
				: { style: `${EDGE_STYLE}${dim}` })
		};
	});

	return { nodes, edges };
}
