<script lang="ts">
	import { externalIdentifiers } from '$lib/api/client';
	import type { ExternalIdentifierRow, ImportProvenance } from '$lib/api/types';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import Section from './Section.svelte';
	import Badge from './Badge.svelte';
	import EntityRefresh from './EntityRefresh.svelte';

	/** Upstream accession plate for this entity: source, id, and the one
	 *  identifier the record leads with. Self-fetching like RelationsPanel. */
	let {
		entityType,
		entityId,
		embedded = false
	}: { entityType: string; entityId: string; embedded?: boolean } = $props();

	// Genes keep their own refresh component on the gene page (§59); the
	// generic door only covers the other imported catalogs.
	const REFRESHABLE = new Set(['protein', 'pdb-entry', 'cell-line', 'reagent', 'reaction', 'pathway']);
	const refreshable = $derived(REFRESHABLE.has(entityType));

	let rows = $state<ExternalIdentifierRow[]>([]);
	let provenance = $state<ImportProvenance | null>(null);
	let loading = $state(true);
	let error = $state('');
	let generation = 0;

	async function load() {
		const run = ++generation;
		loading = true;
		error = '';
		try {
			const res = await externalIdentifiers.forEntity(entityType, entityId);
			if (run !== generation) return;
			rows = Array.isArray(res.identifiers) ? res.identifiers : [];
			provenance = res.importProvenance ?? null;
		} catch (e) {
			if (run !== generation) return;
			rows = [];
			provenance = null;
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (run === generation) loading = false;
		}
	}

	$effect(() => {
		if (!entityId) {
			rows = [];
			provenance = null;
			loading = false;
			return;
		}
		void load();
	});
</script>

{#snippet body()}
	{#if refreshable}
		<div class="mb-3">
			<EntityRefresh {entityType} {entityId} />
		</div>
	{/if}
	{#if provenance?.system}
		<div class="mb-3 border border-dashed bg-muted/20 p-2.5 text-xs">
			<div class="flex flex-wrap items-center gap-2">
				<Badge tone="info">{tr('extid_import_system')}</Badge>
				<span class="text-muted-foreground">{tr('extid_import_source')}:</span>
				<Badge tone="muted">{enumLabel('extid_source', provenance.source.replace(/-/g, '_'))}</Badge>
				{#if provenance.sourceUrl}
					<a
						class="font-mono underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
						href={provenance.sourceUrl}
						target="_blank"
						rel="noopener noreferrer">{provenance.externalId}</a
					>
				{:else}
					<span class="font-mono">{provenance.externalId}</span>
				{/if}
				{#if provenance.fetchedAt}
					<span class="text-muted-foreground"
						>{tr('extid_import_fetched')}: {fmtTime(provenance.fetchedAt)}</span
					>
				{/if}
				{#if provenance.license}
					<span class="text-muted-foreground"
						>{tr('extid_import_license')}: {provenance.license}</span
					>
				{/if}
			</div>
			<p class="mt-1 text-muted-foreground">{tr('extid_import_note')}</p>
		</div>
	{/if}
	{#if loading}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else if error}
		<p class="text-sm text-destructive">{tr('extid_error')}</p>
	{:else if rows.length === 0}
		<p class="text-sm text-muted-foreground">{tr('extid_empty')}</p>
	{:else}
		<ul class="divide-y">
			{#each rows as row (row.id)}
				<li class="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
					<span class="text-xs text-muted-foreground">{tr('extid_source')}:</span>
					<Badge tone="muted">{enumLabel('extid_source', row.source.replace(/-/g, '_'))}</Badge>
					{#if row.url}
						<a
							class="font-mono text-xs text-primary underline-offset-2 hover:underline"
							href={row.url}
							target="_blank"
							rel="noopener noreferrer">{row.externalId}</a
						>
					{:else}
						<span class="font-mono text-xs">{row.externalId}</span>
					{/if}
					{#if row.primary}
						<Badge tone="info">{tr('extid_primary')}</Badge>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#if embedded}
	<div class="space-y-2">
		<h3 class="text-xs font-semibold">{tr('extid_title')}</h3>
		{@render body()}
	</div>
{:else}
	<Section title={tr('extid_title')}>
		{@render body()}
	</Section>
{/if}
