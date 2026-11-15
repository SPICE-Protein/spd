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
	import MapEdge from './MapEdge.svelte';
	import MapAutofit from './MapAutofit.svelte';
	import { MAP_EDGE_TYPE, MAP_NODE_TYPE, toFlow } from '$lib/graph/flow';
	import type { WalkEdge, WalkState } from '$lib/graph/walk';
	import { enumLabel, tr } from '$lib/i18n';

	// The canvas is Svelte Flow's; the arrangement is the walk's. Positions
	// come from the deterministic layout unless the reader dragged a node,
	// in which case that place wins until the map is tidied again.
	let {
		walk,
		onToggle,
		onMore,
		pinned = {},
		onPlace,
		onTidy,
		fitToken = 0
	}: {
		walk: WalkState;
		onToggle: (key: string) => void;
		onMore: (key: string) => void;
		pinned?: Record<string, { x: number; y: number }>;
		onPlace?: (key: string, position: { x: number; y: number }) => void;
		onTidy?: () => void;
		fitToken?: number;
	} = $props();

	let hovered = $state<string | null>(null);

	const nodeTypes = { [MAP_NODE_TYPE]: MapNode };
	const edgeTypes = { [MAP_EDGE_TYPE]: MapEdge };
	// A backlink has no child card to carry its verb, so the edge says it.
	const backLabel = (edge: WalkEdge) =>
		`${edge.direction === 'in' ? '←' : '→'} ${enumLabel('relation', edge.relation)}`;
	const graph = $derived(
		toFlow(walk, { onToggle, onMore, onHover: (key) => (hovered = key), backLabel }, {
			pinned,
			highlight: hovered
		})
	);
	// What the camera should be showing: a change here means the tree grew or
	// shrank (or was tidied), not that a node merely changed state.
	const signature = $derived(`${graph.nodes.length}/${graph.edges.length}/${fitToken}`);
</script>

<div class="h-[70vh] min-h-[420px] w-full border bg-muted/20">
	<SvelteFlow
		nodes={graph.nodes}
		edges={graph.edges}
		{nodeTypes}
		{edgeTypes}
		fitView
		fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
		minZoom={0.15}
		maxZoom={1.75}
		nodeDragThreshold={4}
		nodesConnectable={false}
		edgesFocusable={false}
		zoomOnScroll={false}
		zoomOnDoubleClick={false}
		panOnScroll={false}
		preventScrolling={false}
		onnodedragstop={({ targetNode }) => {
			if (targetNode) onPlace?.(targetNode.id, targetNode.position);
		}}
	>
		<Background variant={BackgroundVariant.Dots} gap={16} size={1} />
		<Controls />
		<Panel position="top-left">
			<div
				class="pointer-events-none border bg-background/90 px-2 py-1 font-mono text-[10px] text-muted-foreground"
			>
				{tr('map_pan_hint')}
			</div>
		</Panel>
		<Panel position="top-right">
			<div class="flex items-center gap-1">
				{#if Object.keys(pinned).length > 0}
					<span class="font-mono text-[10px] text-muted-foreground">{tr('map_moved')}</span>
				{/if}
				<button
					type="button"
					class="border bg-background/90 px-2 py-1 text-[11px] hover:bg-muted"
					onclick={() => onTidy?.()}
				>
					{tr('map_tidy')}
				</button>
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
