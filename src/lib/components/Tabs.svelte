<script lang="ts">
	// shadcn Tabs wrapper: same items/bind:active API as before, now backed by
	// the bits roving-focus tablist (arrow-key navigation for free). Panels
	// stay page-side {#if} blocks — only the trigger strip is rendered here.
	import { Tabs as TabsRoot, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { cn } from '$lib/utils';

	let {
		items,
		active = $bindable(''),
		class: klass = ''
	}: {
		items: Array<{ key: string; label: string; badge?: string | number }>;
		active?: string;
		class?: string;
	} = $props();
</script>

<TabsRoot bind:value={active} class={cn('min-w-0', klass)}>
	<TabsList
		class="h-auto w-full flex-wrap justify-center gap-2 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto"
	>
		{#each items as item (item.key)}
			<TabsTrigger value={item.key} class="flex-none rounded-none px-3 py-1.5 text-sm">
				{item.label}
				{#if item.badge !== undefined && item.badge !== 0}
					<span class="ml-1 rounded-none bg-muted px-1.5 text-[10px] tabular-nums"
						>{item.badge}</span
					>
				{/if}
			</TabsTrigger>
		{/each}
	</TabsList>
</TabsRoot>
