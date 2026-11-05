<script lang="ts">
	import { fmtNumber } from '$lib/format';

	let {
		items,
		unit = undefined
	}: {
		items: Array<{ label: string; value: number; hint?: string }>;
		unit?: string;
	} = $props();

	const max = $derived(Math.max(1, ...items.map((i) => i.value)));
</script>

<div class="space-y-1.5">
	{#each items as item, i (`${item.label}:${i}`)}
		<div class="grid grid-cols-[minmax(4rem,8rem)_1fr_4rem] items-center gap-2 text-xs">
			<span class="truncate text-muted-foreground" title={item.label}>{item.label}</span>
			<div class="h-2.5 rounded-none bg-muted">
				<div class="h-2.5 rounded-none bg-primary/70" style={`width:${(item.value / max) * 100}%`}></div>
			</div>
			<span class="text-right tabular-nums">{fmtNumber(item.value)}{unit ?? ''}</span>
		</div>
	{/each}
</div>
