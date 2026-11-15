<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import { enumLabel, tr } from '$lib/i18n';
	import { entityHref, shortPublicId } from '$lib/format';
	import { MAX_DEPTH } from '$lib/graph/walk';
	import type { MapNodeData } from '$lib/graph/flow';

	// One record on the canvas. The card is a button (expand / collapse) with
	// two real controls layered on top, so the whole box is a target while the
	// corner actions stay individually reachable.
	let { data, selected }: NodeProps = $props();

	const walk = $derived((data as unknown as MapNodeData).walk);
	const hidden = $derived((data as unknown as MapNodeData).hidden);
	const onToggle = $derived((data as unknown as MapNodeData).onToggle);
	const onMore = $derived((data as unknown as MapNodeData).onMore);

	const title = $derived(walk.label || shortPublicId(walk.id));
	const verb = $derived(
		walk.relation
			? `${walk.direction === 'in' ? '←' : '→'} ${enumLabel('relation', walk.relation)}`
			: enumLabel('et', walk.type.replace(/-/g, '_'))
	);
</script>

<Handle type="target" position={Position.Left} class="map-handle" />
<Handle type="source" position={Position.Right} class="map-handle" />

<div
	class="relative h-full w-full border bg-card transition-colors {selected
		? 'border-foreground/60'
		: 'border-foreground/15'} {walk.status === 'error' ? 'border-destructive' : ''}"
>
	<button
		type="button"
		class="absolute inset-0 z-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground/40"
		aria-label={`${walk.expanded ? tr('map_collapse_node') : tr('map_expand_node')} — ${title}`}
		title={walk.label ? `${walk.label} — ${walk.id}` : walk.id}
		onclick={() => onToggle(walk.key)}
	></button>

	<span class="pointer-events-none absolute top-1/2 left-1 z-10 -translate-y-1/2 text-muted-foreground">
		{#if walk.expanded}
			<ChevronUpIcon class="size-3" />
		{:else}
			<ChevronDownIcon class="size-3" />
		{/if}
	</span>

	<div class="pointer-events-none relative z-10 flex h-full flex-col justify-center gap-0.5 pr-6 pl-5">
		<span class="truncate text-sm leading-tight font-medium">{title}</span>
		<span class="truncate font-mono text-[10px] text-muted-foreground">{verb}</span>
		{#if walk.subtitle}
			<span class="truncate text-[10px] text-muted-foreground">{walk.subtitle}</span>
		{/if}
	</div>

	<a
		class="absolute top-0.5 right-0.5 z-20 p-1 text-muted-foreground hover:text-foreground"
		href={entityHref(walk.type, walk.id)}
		title={tr('map_open_record')}
		aria-label={tr('map_open_record')}
	>
		<ArrowUpRightIcon class="size-3" />
	</a>

	{#if walk.status === 'loading'}
		<span class="absolute right-1 bottom-0.5 z-20 text-muted-foreground">
			<LoaderCircleIcon class="size-3 animate-spin" />
		</span>
	{:else if walk.status === 'error'}
		<span
			class="absolute right-1 bottom-0.5 z-20 max-w-[70%] truncate text-[10px] text-destructive"
			title={walk.error ?? ''}
		>
			{tr('map_node_error')}
		</span>
	{:else if walk.expanded && hidden > 0}
		<button
			type="button"
			class="absolute right-1 bottom-0.5 z-20 font-mono text-[10px] text-primary hover:underline"
			onclick={(e) => {
				e.stopPropagation();
				onMore(walk.key);
			}}
		>
			+{hidden}
		</button>
	{:else if walk.depth >= MAX_DEPTH}
		<span class="absolute right-1 bottom-0.5 z-20 font-mono text-[10px] text-muted-foreground">
			{tr('map_depth_limit')}
		</span>
	{:else if walk.expanded && hidden === 0}
		<span class="absolute right-1 bottom-0.5 z-20 font-mono text-[10px] text-muted-foreground">
			{tr('map_no_connections')}
		</span>
	{/if}
</div>
