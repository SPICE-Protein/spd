<script lang="ts">
	import { tr } from '$lib/i18n';
	import { fmtTime, jsonPreview } from '$lib/format';
	import type { SequenceTreeData, SequenceLineageData } from '$lib/api/types';
	import Badge from './Badge.svelte';

	/**
	 * Mutation genealogy: `tree` renders the BFS-depth layered view,
	 * `lineage` the root chain. Both navigate by public sequence id.
	 */
	let {
		tree = undefined,
		lineage = undefined,
		selected = undefined
	}: {
		tree?: SequenceTreeData | null;
		lineage?: SequenceLineageData | null;
		selected?: string;
	} = $props();

	const childrenOf = $derived.by(() => {
		const map = new Map<string, Array<{ id: string; depth: number; mutations: unknown }>>();
		if (!tree) return map;
		for (const n of tree.nodes) {
			const parent = n.parentSequenceId ?? '';
			const list = map.get(parent) ?? [];
			list.push({ id: n.id, depth: n.depth, mutations: n.mutations });
			map.set(parent, list);
		}
		return map;
	});
</script>

{#if tree}
	<div class="space-y-1 text-sm">
		<p class="text-xs text-muted-foreground">
			{tr('tree_stats')}: {tree.nodeCount} · {tr('tree_max_depth')} {tree.maxDepth}
		</p>
		<ul class="space-y-0.5">
			{#each tree.nodes as n (n.id)}
				<li style={`padding-left:${Math.min(n.depth, 8) * 1.1}rem`} class="flex items-center gap-2">
					<span class="text-xs text-muted-foreground">{n.depth > 0 ? '└' : '●'}</span>
					{#if selected && n.id === selected}
						<Badge tone="info">{tr('tree_current')}</Badge>
					{/if}
					<a class="font-mono text-xs underline" href={`/sequences/${n.id}`}>
						{n.id.split(':').pop()?.slice(0, 10)}…
					</a>
					<span class="truncate text-xs text-muted-foreground" title={jsonPreview(n.mutations, 200)}>{jsonPreview(n.mutations, 60)}</span>
				</li>
			{/each}
		</ul>
	</div>
{:else if lineage}
	<ol class="space-y-1 text-sm">
		{#each lineage.nodes as n, i (n.id)}
			<li class="flex items-center gap-2">
				<span class="text-xs text-muted-foreground">{i + 1}.</span>
				<a class="font-mono text-xs underline" href={`/sequences/${n.id}`}>{n.id.split(':').pop()?.slice(0, 12)}…</a>
				{#if n.id === lineage.rootSequenceId}<Badge tone="ok">{tr('lineage_root')}</Badge>{/if}
				{#if n.sha256}<span class="font-mono text-[10px] text-muted-foreground">{n.sha256.slice(0, 15)}…</span>{/if}
			</li>
		{/each}
	</ol>
{:else}
	<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
{/if}
