<script lang="ts">
	/**
	 * Search the iGEM Registry by what the part is called — "PETase",
	 * "terminator", "sfGFP" — and import a hit into SPD in one click.
	 *
	 * A part number typed into the same box still works: the registry is
	 * asked for it by title as well, and the exact match comes first.
	 */
	import { goto } from '$app/navigation';
	import { biobricks, type RegistryCandidate } from '$lib/api/client';
	import { tr, enumLabel } from '$lib/i18n';
	import { session } from '$lib/state/session.svelte';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';
	import { Input } from '$lib/components/ui/input';

	let term = $state('');
	let busy = $state(false);
	let importing = $state('');
	let error = $state('');
	let result = $state<{ total: number; items: RegistryCandidate[] } | null>(null);

	async function search() {
		const query = term.trim();
		if (query.length < 2 || busy) return;
		busy = true;
		error = '';
		result = null;
		try {
			result = await biobricks.registrySearch(query);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function importPart(name: string) {
		importing = name;
		error = '';
		try {
			const part = await biobricks.resolve(name);
			await goto(`/biobricks/${part.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			importing = '';
		}
	}
</script>

<div class="mb-4 border border-border bg-muted/30 p-3">
	<form
		class="flex flex-wrap items-center gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			void search();
		}}
	>
		<span class="text-sm">{tr('biobrick_registry_lookup')}</span>
		<Input
			name="biobrick_registry_query"
			class="h-9 min-w-64 flex-1"
			placeholder={tr('biobrick_registry_placeholder')}
			aria-label={tr('biobrick_registry_lookup')}
			bind:value={term}
		/>
		<Button type="submit" size="sm" disabled={busy || term.trim().length < 2}>
			{busy ? tr('common_loading') : tr('common_search')}
		</Button>
	</form>
	{#if error}<p class="mt-2 text-sm text-destructive">{error}</p>{/if}
	{#if result}
		<p class="mt-2 text-xs text-muted-foreground">
			{result.total} {tr('biobrick_registry_hits')}
		</p>
		{#if result.items.length === 0}
			<p class="mt-1 text-sm text-muted-foreground">{tr('biobrick_registry_none')}</p>
		{/if}
		<ul class="mt-1 divide-y divide-border">
			{#each result.items as hit (hit.name)}
				<li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
					<span class="font-medium">{hit.title ?? hit.name}</span>
					{#if hit.partType}<Badge tone="info">{enumLabel('part', hit.partType)}</Badge>{/if}
					<span class="font-mono text-xs text-muted-foreground">{hit.name}</span>
					{#if hit.length}<span class="text-xs text-muted-foreground">{hit.length} bp</span>{/if}
					{#if hit.usageCount != null}
						<span class="text-xs text-muted-foreground">
							{tr('biobrick_registry_used')} {hit.usageCount}
						</span>
					{/if}
					{#if hit.description}
						<span class="min-w-0 grow truncate text-xs text-muted-foreground"
							>{hit.description}</span
						>
					{/if}
					{#if hit.inSpd && hit.spdId}
						<Button size="xs" variant="outline" href={`/biobricks/${hit.spdId}`}>
							{tr('common_open')}
						</Button>
					{:else if session.canWrite}
						<Button
							size="xs"
							disabled={importing === hit.name}
							onclick={() => importPart(hit.name)}
						>
							{importing === hit.name ? tr('common_loading') : tr('biobrick_import_registry')}
						</Button>
					{:else}
						<a class="text-xs underline" href={hit.url} target="_blank" rel="noreferrer">
							{tr('biobrick_registry_open_source')}
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
