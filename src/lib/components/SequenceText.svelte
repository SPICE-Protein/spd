<script lang="ts">
	import { cn } from '$lib/utils';

	/**
	 * Amino-acid sequence rendered with charge classes, every 10 residues tick.
	 * Clicking a residue reports its 1-based position (for mutation workflows).
	 */
	let {
		sequence,
		onpick = undefined,
		highlight = {}
	}: {
		sequence: string;
		onpick?: (position: number, residue: string) => void;
		/** position(1-based) → css class */
		highlight?: Record<number, string>;
	} = $props();

	const CHARGE: Record<string, string> = {
		D: 'text-destructive',
		E: 'text-destructive',
		K: 'text-blue-600 dark:text-blue-400',
		R: 'text-blue-600 dark:text-blue-400',
		H: 'text-blue-400'
	};
</script>

<div class="w-full overflow-x-auto rounded-none border bg-muted/20 p-2">
	<div class="min-w-fit font-mono text-[13px] leading-6">
		{#each sequence.split('') as residue, i (i)}
			{#if i > 0 && i % 50 === 0}<wbr />{/if}
			{#if onpick}
				<button
					type="button"
					tabindex="-1"
					class={cn(
						'inline cursor-pointer border-0 bg-transparent p-0 [font:inherit] hover:rounded-none hover:bg-accent',
						CHARGE[residue] ?? 'text-foreground',
						highlight[i + 1]
					)}
					onclick={() => onpick(i + 1, residue)}
					title={`${i + 1} · ${residue}`}>{residue}</button
				>
			{:else}
				<span
					class={cn('inline', CHARGE[residue] ?? 'text-foreground', highlight[i + 1])}
					title={`${i + 1} · ${residue}`}>{residue}</span
				>
			{/if}
			{#if (i + 1) % 10 === 0}
				<span class="mr-1 select-none text-[9px] text-muted-foreground">{i + 1}</span>
			{/if}
		{/each}
	</div>
</div>
