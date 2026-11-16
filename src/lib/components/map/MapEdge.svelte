<script lang="ts">
	import { BaseEdge, EdgeLabel, getStraightPath, type EdgeProps } from '@xyflow/svelte';

	// A ray, not a curve: the map is radial, so the honest line between two
	// records is the straight one. A backlink has no child card to print its
	// relation verb on, so the edge carries the verb itself.
	let { sourceX, sourceY, targetX, targetY, data, label, style }: EdgeProps = $props();

	const geometry = $derived(getStraightPath({ sourceX, sourceY, targetX, targetY }));
	const back = $derived(Boolean((data as { back?: boolean } | undefined)?.back));
</script>

<BaseEdge path={geometry[0]} {style} />

{#if back && label}
	<EdgeLabel x={geometry[1]} y={geometry[2]}>
		<span
			class="border border-foreground/15 bg-background px-1 font-mono text-[10px] text-muted-foreground"
		>
			{label}
		</span>
	</EdgeLabel>
{/if}
