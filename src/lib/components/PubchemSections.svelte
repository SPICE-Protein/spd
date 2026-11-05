<script lang="ts">
	// PubChem's remainder sections, rendered as the source's own tree. Each
	// top-level block is a collapsible card and each nested block a <details>,
	// so a long toxicity or spectral page never dumps every paragraph at once.
	import Section from '$lib/components/Section.svelte';
	import type { PubchemSection } from '$lib/api/types';

	let {
		sections = [],
		emptyText = ''
	}: { sections?: PubchemSection[]; emptyText?: string } = $props();

	function countInformation(section: PubchemSection): number {
		return (
			(section.information?.length ?? 0) +
			(section.sections ?? []).reduce((sum, child) => sum + countInformation(child), 0)
		);
	}
</script>

{#snippet information(rows: PubchemSection['information'])}
	{#if rows?.length}
		<dl class="space-y-2 text-sm">
			{#each rows as item, index (`${index}`)}
				<div>
					<dd class="leading-6 break-words whitespace-pre-line">{item.value}</dd>
					{#if item.unit || item.reference}
						<dt class="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
							{#if item.unit}<span class="font-mono">{item.unit}</span>{/if}
							{#if item.reference}<span class="break-all">{item.reference}</span>{/if}
						</dt>
					{/if}
				</div>
			{/each}
		</dl>
	{/if}
{/snippet}

{#snippet branch(rows: PubchemSection[])}
	{#if rows.length}
		<div class="mt-3 space-y-2">
			{#each rows as child, index (`${child.heading}-${index}`)}
				<details class="border-t pt-2">
					<summary class="flex cursor-pointer items-center justify-between gap-2 text-xs font-medium">
						<span class="break-words">{child.heading}</span>
						{#if countInformation(child)}
							<span class="shrink-0 text-[10px] text-muted-foreground tabular-nums">{countInformation(child)}</span>
						{/if}
					</summary>
					<div class="mt-2 pl-1">
						{#if child.description}
							<p class="mb-2 text-xs leading-5 text-muted-foreground break-words">{child.description}</p>
						{/if}
						{@render information(child.information)}
						{@render branch(child.sections ?? [])}
					</div>
				</details>
			{/each}
		</div>
	{/if}
{/snippet}

{#if sections.length}
	<div class="space-y-3">
		{#each sections as section, index (`${section.heading}-${index}`)}
			<Section title={section.heading} collapsible>
				{#if section.description}
					<p class="mb-3 text-xs leading-5 text-muted-foreground break-words">{section.description}</p>
				{/if}
				{@render information(section.information)}
				{@render branch(section.sections ?? [])}
			</Section>
		{/each}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{emptyText}</p>
{/if}
