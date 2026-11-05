<script lang="ts">
	// One assertion chain rendered as connected cards. Each node names the
	// record that actually carries the claim; a missing link stays visible
	// with a hint instead of collapsing the chain. Connectors and status
	// colours are plain CSS utilities — no extra dependency.

	export interface ChainNode {
		key: string;
		label: string;
		value?: string | null;
		href?: string | null;
		status: 'present' | 'partial' | 'missing';
		hint?: string | null;
	}

	let { nodes }: { nodes: ChainNode[] } = $props();

	const styles = {
		present: {
			box: 'border-emerald-500/40 bg-emerald-500/5',
			dot: 'bg-emerald-500',
			label: 'text-emerald-700 dark:text-emerald-300'
		},
		partial: {
			box: 'border-amber-500/40 bg-amber-500/5',
			dot: 'bg-amber-500',
			label: 'text-amber-700 dark:text-amber-300'
		},
		missing: {
			box: 'border-dashed border-muted-foreground/30 bg-muted/20',
			dot: 'bg-muted-foreground/40',
			label: 'text-muted-foreground'
		}
	} as const;

	function tone(status: ChainNode['status']) {
		return styles[status];
	}
</script>

<div class="flex flex-wrap items-stretch gap-y-2">
	{#each nodes as node, i (node.key)}
		{#if i > 0}
			<div class="flex items-center px-1 text-muted-foreground" aria-hidden="true">
				<span class="block h-px w-5 bg-border"></span>
			</div>
		{/if}
		<div
			class="min-w-[9rem] max-w-[16rem] flex-1 rounded-none border p-2 {tone(node.status).box}"
			title={node.hint ?? undefined}
		>
			<div class="flex items-center gap-1.5">
				<span class="size-2 rounded-full {tone(node.status).dot}"></span>
				<span class="text-[10px] font-semibold uppercase tracking-wide {tone(node.status).label}">
					{node.label}
				</span>
			</div>
			{#if node.value}
				{#if node.href}
					<a class="mt-0.5 block truncate text-sm underline" href={node.href}>{node.value}</a>
				{:else}
					<span class="mt-0.5 block truncate text-sm">{node.value}</span>
				{/if}
			{:else}
				<span class="mt-0.5 block text-sm text-muted-foreground">—</span>
			{/if}
			{#if node.hint}
				<span class="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{node.hint}</span>
			{/if}
		</div>
	{/each}
</div>
