<script lang="ts">
	import '@xyflow/svelte/dist/base.css';
	import {
		Background,
		BackgroundVariant,
		Controls,
		Panel,
		SvelteFlow
	} from '@xyflow/svelte';
	import MapNode from './MapNode.svelte';
	import MapAutofit from './MapAutofit.svelte';
	import { MAP_NODE_TYPE, toFlow } from '$lib/graph/flow';
	import type { WalkNode } from '$lib/graph/walk';
	import { tr } from '$lib/i18n';

	// The canvas is Svelte Flow's; the arrangement is the walk's. Positions
	// come from the deterministic layout, so panning and zooming never change
	// where a record sits relative to its neighbours.
	let {
		nodes,
		onToggle,
		onMore
	}: {
		nodes: WalkNode[];
		onToggle: (key: string) => void;
		onMore: (key: string) => void;
	} = $props();

	const nodeTypes = { [MAP_NODE_TYPE]: MapNode };
	const graph = $derived(toFlow(nodes, { onToggle, onMore }));
	// What the camera should be showing: a change here means the tree grew or
	// shrank, not that a node merely changed state.
	const signature = $derived(`${graph.nodes.length}/${graph.edges.length}`);
</script>

<div class="h-[70vh] min-h-[420px] w-full border bg-muted/20">
	<SvelteFlow
		nodes={graph.nodes}
		edges={graph.edges}
		{nodeTypes}
		fitView
		fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
		minZoom={0.15}
		maxZoom={1.75}
		nodesDraggable={false}
		nodesConnectable={false}
		edgesFocusable={false}
		zoomOnScroll={false}
		zoomOnDoubleClick={false}
		panOnScroll={false}
		preventScrolling={false}
	>
		<Background variant={BackgroundVariant.Dots} gap={16} size={1} />
		<Controls />
		<Panel position="top-left">
			<div
				class="border bg-background/90 px-2 py-1 font-mono text-[10px] text-muted-foreground"
			>
				{tr('map_pan_hint')}
			</div>
		</Panel>
		<MapAutofit {signature} />
	</SvelteFlow>
</div>

<style>
	/* Svelte Flow ships a rounded, shadowed, light-only chrome. SPD is square,
	   monochrome and themed from the app's own tokens, so the controls are
	   re-skinned here rather than inheriting the library's look. */
	:global(.svelte-flow__controls) {
		box-shadow: none;
		border: 1px solid var(--border);
		background: var(--card);
	}

	:global(.svelte-flow__controls-button) {
		width: 26px;
		height: 26px;
		border-bottom: 1px solid var(--border);
		background: transparent;
		color: var(--muted-foreground);
	}

	:global(.svelte-flow__controls-button:last-child) {
		border-bottom: none;
	}

	:global(.svelte-flow__controls-button:hover) {
		background: var(--muted);
		color: var(--foreground);
	}

	/* The dot grid and the attribution follow the app's tokens instead of the
	   library's built-in light/dark palette, which keys off a class we do not
	   use. */
	:global(.svelte-flow) {
		--xy-background-pattern-color: var(--border);
		--xy-background-color: transparent;
		--xy-attribution-background-color: transparent;
	}

	:global(.svelte-flow__attribution) {
		background: transparent;
	}

	:global(.svelte-flow__attribution a) {
		color: var(--muted-foreground);
	}

	/* Anchors only: the handles tell Svelte Flow which side an edge leaves and
	   enters, they are not something to click or drag. */
	:global(.map-handle) {
		width: 1px;
		height: 1px;
		min-width: 0;
		min-height: 0;
		border: 0;
		opacity: 0;
	}

	:global(.svelte-flow__node) {
		padding: 0;
	}
</style>
