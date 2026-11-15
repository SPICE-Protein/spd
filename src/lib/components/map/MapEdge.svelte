<script lang="ts">
	import { BaseEdge, EdgeLabel, getBezierPath, type EdgeProps } from '@xyflow/svelte';

	// The default Svelte Flow edge cannot carry text, and a backlink has no
	// child card to print its relation verb on. This edge draws the same
	// bezier and puts the verb on the curve.
	let {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		data,
		label,
		style
	}: EdgeProps = $props();

	const geometry = $derived(
		getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
	);
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
