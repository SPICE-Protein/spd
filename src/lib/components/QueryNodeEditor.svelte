<script lang="ts">
	import { EDGES, NODE_TYPES, edgeInfo, newSpec, specHeight, nodeTypeLabelKey, type NodeSpec } from '$lib/graph/registry';
	import { tr } from '$lib/i18n';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';
	import Input from './Input.svelte';
	import Select from './Select.svelte';
	// recursive tree editor — self-import (svelte:self is deprecated)
	import QueryNodeEditor from './QueryNodeEditor.svelte';

	let {
		spec,
		isRoot = false,
		edgeName = '',
		depth = 0,
		maxDepth = 3,
		onRemove = undefined,
		onlookup = undefined
	}: {
		spec: NodeSpec;
		isRoot?: boolean;
		/** Which edge reached this node — shown as the badge on children. */
		edgeName?: string;
		depth?: number;
		maxDepth?: number;
		onRemove?: () => void;
		/** Only passed for root types that have an upstream ladder. The editor
		 *  stays dumb: the caller owns the picker and the import. */
		onlookup?: (spec: NodeSpec) => void;
	} = $props();

	const legalEdges = $derived(EDGES[spec.type] ?? []);
	const available = $derived(legalEdges.filter((e) => !spec.edges.some((x) => x.edge === e.edge)));
	const tooDeep = $derived(specHeight(spec) > maxDepth);
	// Backend semantics: a node's `limit` caps its own list-edge children.
	const hasListEdge = $derived(legalEdges.some((e) => e.many));

	// the add-edge picker is pick-then-reset; bits holds the value itself
	let addPick = $state('');
	function onAddPick() {
		if (!addPick) return;
		const info = edgeInfo(spec.type, addPick);
		spec.edges.push({ edge: addPick, child: newSpec(info?.child ?? '') });
		addPick = '';
	}
	function onRetype() {
		spec.edges = []; // old expansions would point at edges of the wrong registry
	}
</script>

<div class="rounded-none border bg-card p-3 space-y-2 {tooDeep ? 'border-destructive/40' : ''}">
	<div class="flex flex-wrap items-center gap-2 text-sm">
		{#if isRoot}
			<Select name="qne_type" class="h-8 w-36" bind:value={spec.type} options={NODE_TYPES.map((t) => ({ value: t, label: tr(nodeTypeLabelKey(t)) }))} onchange={onRetype} />
			<Input
				name="qne_id"
				class="h-8 min-w-40 flex-1 font-mono text-xs"
				placeholder={spec.type === 'protein' ? 'spd:protein:… or UniProt accession' : `spd:{spec.type}:…`}
				title={onlookup ? tr('query_lookup_hint') : undefined}
				bind:value={spec.id}
			/>
			{#if spec.type === 'protein'}
				<Input
					name="qne_source"
					class="h-8 w-28 font-mono text-xs"
					placeholder="auto / uniprot"
					title={tr('query_source_hint')}
					bind:value={spec.source}
				/>
			{/if}
			{#if onlookup}
				<Button
					size="xs"
					variant="outline"
					class="h-8"
					disabled={!spec.id.trim()}
					title={tr('query_lookup_hint')}
					onclick={() => onlookup(spec)}>{tr('query_root_upstream')}</Button
				>
			{/if}
		{:else}
			<Badge tone="info">{tr(`ge_${edgeName || spec.type}`)}</Badge>
		{/if}

		{#if !isRoot && spec.type === ''}
			<span class="text-xs text-muted-foreground">{tr('query_value_node')}</span>
		{/if}

		<div class="ml-auto flex items-center gap-2">
			<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
				{tr('query_field_limit')}
				<Input name="qne_limit" class="h-7 w-14 px-1 font-mono text-xs" placeholder="20" bind:value={spec.limit} disabled={!hasListEdge} title={tr('query_field_limit_hint')} />
			</label>
			<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
				{tr('query_field_select')}
				<Input name="qne_select" class="h-7 w-32 px-1 font-mono text-xs" placeholder="ph, temperatureK" bind:value={spec.select} />
			</label>
			{#if onRemove}
				<Button size="xs" variant="ghost" class="px-1.5 text-destructive hover:bg-destructive/10" onclick={onRemove} aria_label={tr('common_delete')}>✕</Button>
			{/if}
		</div>
	</div>

	{#if tooDeep}
		<p class="text-xs text-destructive">{tr('query_depth_warning', { max: maxDepth })}</p>
	{/if}

	{#if spec.edges.length}
		<div class="space-y-2 border-l-2 border-primary/20 pl-3">
			{#each spec.edges as e, i (e.edge + i)}
				{#if e.child.type === ''}
					<div class="flex items-center gap-2 text-sm">
						<Badge tone="muted">{tr(`ge_${e.edge}`)}</Badge>
						<span class="text-xs text-muted-foreground">{tr('query_value_node')}</span>
						<Button size="xs" variant="ghost" class="ml-auto px-1.5 text-destructive hover:bg-destructive/10" onclick={() => spec.edges.splice(i, 1)} aria_label={tr('common_delete')}>✕</Button>
					</div>
				{:else}
					<QueryNodeEditor spec={e.child} edgeName={e.edge} depth={depth + 1} {maxDepth} onRemove={() => spec.edges.splice(i, 1)} />
				{/if}
			{/each}
		</div>
	{/if}

	{#if isRoot || spec.type !== ''}
		{#if available.length}
			<Select
				name="qne_add"
				class="h-7 w-56 text-xs"
				placeholder={tr('query_add_edge')}
				bind:value={addPick}
				options={[{ value: '', label: tr('query_add_edge') }, ...available.map((a) => ({ value: a.edge, label: `${tr(`ge_${a.edge}`)} → ${a.child ? tr(nodeTypeLabelKey(a.child)) : tr('query_value_node')}` }))]}
				onchange={onAddPick}
			/>
		{:else if legalEdges.length}
			<p class="text-xs text-muted-foreground">{tr('query_all_edges_used')}</p>
		{:else}
			<p class="text-xs text-muted-foreground">{tr('query_leaf_note')}</p>
		{/if}
	{/if}
</div>
