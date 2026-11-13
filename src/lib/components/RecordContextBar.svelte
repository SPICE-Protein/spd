<script lang="ts">
	// The compact "what is this and where can I go next" strip for a record.
	// It reads only two public endpoints (relations, external ids) and never
	// blocks the page: a failed read just leaves the chip out.
	import { page } from '$app/state';
	import { externalIdentifiers, relations } from '$lib/api/client';
	import type { ImportProvenance } from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { market } from '$lib/state/market.svelte';
	import { toastOk } from '$lib/state/toast.svelte';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';

	let {
		entityType,
		entityId,
		name,
		// Enzyme pages deliberately never surface upstream accessions; the
		// provenance chip still tells the reader where the row came from.
		showIdentifiers = true
	}: {
		entityType: string;
		entityId: string;
		name: string;
		showIdentifiers?: boolean;
	} = $props();

	const GRAPH_SEED: Record<string, { type: string; template: string }> = {
		protein: { type: 'protein', template: 'protein_structure' },
		sequence: { type: 'sequence', template: 'sequence_lineage' },
		fold: { type: 'fold', template: 'fold_evidence' },
		validation: { type: 'validation', template: 'validation_context' },
		artifact: { type: 'artifact', template: '' },
		environment: { type: 'environment', template: '' },
		model: { type: 'model', template: '' }
	};

	let relationCount = $state<number | null>(null);
	let identifierCount = $state<number | null>(null);
	let provenance = $state<ImportProvenance | null>(null);
	let loaded = $state(false);
	let generation = 0;

	$effect(() => {
		if (!entityId) return;
		const run = ++generation;
		loaded = false;
		relationCount = null;
		identifierCount = null;
		provenance = null;
		// One side failing must not hide the other; the strip is cosmetic.
		void Promise.allSettled([
			relations.forEntity(entityType, entityId),
			externalIdentifiers.forEntity(entityType, entityId)
		]).then(([relationResult, identifierResult]) => {
			if (run !== generation) return;
			if (relationResult.status === 'fulfilled') {
				relationCount = Array.isArray(relationResult.value.relations)
					? relationResult.value.relations.length
					: 0;
			}
			if (identifierResult.status === 'fulfilled') {
				const identifiers = identifierResult.value.identifiers;
				identifierCount = Array.isArray(identifiers) ? identifiers.length : 0;
				provenance = identifierResult.value.importProvenance ?? null;
			}
			loaded = true;
		});
	});

	const marketType = $derived(entityType.replace(/-/g, '_'));
	const inMarket = $derived(market.has(marketType, entityId));

	const source = $derived.by(() => {
		if (provenance?.system) {
			return provenance.source
				? `${tr('ctx_source_imported')} · ${provenance.source}`
				: tr('ctx_source_imported');
		}
		if ((identifierCount ?? 0) > 0) return tr('ctx_source_linked');
		return tr('ctx_source_native');
	});

	const queryHref = $derived.by(() => {
		const seed = GRAPH_SEED[entityType];
		if (!seed || !entityId) return '';
		const params = new URLSearchParams({ rootType: seed.type, rootId: entityId });
		if (seed.template) params.set('template', seed.template);
		return `/query?${params.toString()}`;
	});

	const searchHref = $derived(`/search?q=${encodeURIComponent(name)}`);

	function toggleMarket() {
		const wasSaved = inMarket;
		market.toggle({
			id: entityId,
			entityType: marketType,
			name: name || entityId,
			href: page.url.pathname
		});
		toastOk(wasSaved ? tr('action_remove_market') : tr('market_added'));
	}
</script>

<div
	class="flex flex-wrap items-center gap-x-3 gap-y-1 border-y py-1.5 text-xs text-muted-foreground"
	data-print-hide
>
	{#if loaded}
		{#if provenance || identifierCount != null}
			<Badge tone={provenance?.system ? 'info' : (identifierCount ?? 0) > 0 ? 'muted' : 'ok'}>
				{source}
			</Badge>
		{/if}
		{#if showIdentifiers && identifierCount != null}
			<span>{identifierCount} {tr('ctx_external_ids')}</span>
		{/if}
		{#if relationCount != null}
			<span>{relationCount} {tr('ctx_relations')}</span>
		{/if}
		{#if provenance?.fetchedAt != null}
			<span>{tr('ctx_fetched')} {fmtTime(provenance.fetchedAt)}</span>
		{/if}
		{#if provenance?.license}
			<span class="font-mono">{provenance.license}</span>
		{/if}
	{/if}

	<div class="ml-auto flex flex-wrap items-center gap-1">
		{#if queryHref}
			<Button size="xs" variant="ghost" href={queryHref}>{tr('ctx_query')}</Button>
		{/if}
		{#if name}
			<Button size="xs" variant="ghost" href={searchHref}>{tr('ctx_search')}</Button>
		{/if}
		<Button size="xs" variant={inMarket ? 'outline' : 'ghost'} onclick={toggleMarket}>
			{inMarket ? tr('ctx_saved') : tr('ctx_save')}
		</Button>
	</div>
</div>
