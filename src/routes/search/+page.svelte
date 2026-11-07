<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { search, external } from '$lib/api/client';
	import { SpdApiError } from '$lib/api/base';
	import type { ExternalHit, ExternalSearchData, ExternalSource, SearchHit } from '$lib/api/types';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime, jsonPreview, hitFields, hitTitle, shortPublicId } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import { seasonal } from '$lib/state/seasonal.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Select from '$lib/components/Select.svelte';
	import SaveViewButton from '$lib/components/SaveViewButton.svelte';
	import { searchTermTooLong } from '$lib/search-limit';

	let term = $state(String(page.url.searchParams.get('q') ?? ''));
	let entityType = $state(String(page.url.searchParams.get('entityType') ?? ''));
	let hits = $state<SearchHit[]>([]);
	let count = $state<number | null>(null);
	let loading = $state(false);
	let error = $state('');
	const searchPlaceholder = $derived(seasonal.season === 'pi-day' ? tr('season_pi_search_placeholder') : tr('search_placeholder'));

	// Federated section state, separate from the local hit list on purpose:
	// external rows never inflate `count` or satisfy the local empty state.
	let extGroups = $state<
		Array<{ source: ExternalSource; data: ExternalSearchData | null; failed: boolean }>
	>([]);
	let extLoading = $state(false);
	let extUnavailable = $state(false);
	let extFailed = $state(false);
	let importing = $state('');
	let extGeneration = 0;

	async function run() {
		const q = term.trim();
		if (!q) {
			hits = [];
			count = null;
			extGeneration++;
			extGroups = [];
			extUnavailable = false;
			extFailed = false;
			extLoading = false;
			return;
		}
		if (searchTermTooLong(q)) {
			// D1 rejects the constructed LIKE pattern before any table is read;
			// catch it here so the page explains the limit instead of echoing
			// INTERNAL_ERROR.
			error = tr('search_term_too_long');
			hits = [];
			count = null;
			extGeneration++;
			extGroups = [];
			return;
		}
		loading = true;
		error = '';
		hits = [];
		count = null;
		// External catalogs cost upstream quota on a cache miss, so they are
		// opt-in: a new local search clears the previous external section
		// and waits for the explicit button below.
		extGeneration++;
		extGroups = [];
		extUnavailable = false;
		extFailed = false;
		extLoading = false;
		try {
			const env = await search.run({ q, entityType: entityType || undefined, limit: 50 });
			hits = Array.isArray(env.data) ? env.data : [];
			count = env.meta?.count ?? hits.length;
			void goto(
				`?q=${encodeURIComponent(q)}${entityType ? `&entityType=${encodeURIComponent(entityType)}` : ''}`,
				{
					keepFocus: true,
					replaceState: true,
					noScroll: true
				}
			);
		} catch (e) {
			error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
		} finally {
			loading = false;
		}
	}

	/** Which catalogs match the current type filter. An empty filter searches
	 *  every catalog; a filter selects only its matching catalog, and a filter
	 *  with no external counterpart searches none. */
	function externalSources(type: string): ExternalSource[] {
		const t = type.replace(/_/g, '-').toLowerCase();
		if (!t)
			return ['uniprot', 'pdb', 'ncbi', 'cellosaurus', 'pubchem', 'rhea', 'reactome', 'brenda'];
		if (t === 'protein') return ['uniprot'];
		if (t === 'pdb-entry') return ['pdb'];
		if (t === 'gene') return ['ncbi'];
		if (t === 'cell-line') return ['cellosaurus'];
		if (t === 'reagent') return ['pubchem'];
		if (t === 'reaction') return ['rhea'];
		if (t === 'pathway') return ['reactome'];
		if (t === 'enzyme') return ['brenda'];
		return [];
	}

	const SOURCE_TONE: Record<ExternalSource, string> = {
		uniprot: 'info',
		pdb: 'neutral',
		ncbi: 'ok',
		cellosaurus: 'warn',
		pubchem: 'info',
		rhea: 'ok',
		reactome: 'info',
		brenda: 'warn'
	};

	async function runExternals(q: string) {
		const sources = externalSources(entityType);
		if (q.length < 2 || sources.length === 0) {
			extGeneration++;
			extGroups = [];
			extUnavailable = false;
			extLoading = false;
			return;
		}
		const generation = ++extGeneration;
		extLoading = true;
		extUnavailable = false;
		extFailed = false;
		extGroups = [];
		// One source failing must not hide the others: allSettled, then keep
		// each source's own answer (or its failure) side by side.
		const settled = await Promise.allSettled(sources.map((source) => external.search(source, q)));
		// A slower earlier query must never overwrite a newer one.
		if (generation !== extGeneration) return;
		const groups = sources.map((source, i) => {
			const result = settled[i];
			return {
				source,
				data: result.status === 'fulfilled' ? result.value : null,
				failed: result.status === 'rejected'
			};
		});
		const itemCount = groups.reduce((n, g) => n + (g.data?.items?.length ?? 0), 0);
		extGroups = groups;
		extUnavailable = itemCount === 0 && groups.every((g) => g.failed || g.data?.degraded === true);
		extLoading = false;
	}

	function hitKey(source: ExternalSource, hit: ExternalHit): string {
		return `${source}:${hit.externalId}`;
	}

	async function importHit(source: ExternalSource, hit: ExternalHit) {
		if (importing) return;
		importing = hitKey(source, hit);
		extFailed = false;
		try {
			const result = await external.import(source, hit.externalId);
			toastOk(tr('ext_imported'));
			// Anonymous imports are allowed; the backend answers with the
			// materialised record's route (or the existing one, created:false).
			await goto(result.route);
		} catch (e) {
			extFailed = true;
			importing = '';
			toastErr(e);
		}
	}

	// Search only on submit or on a deep link. Binding an effect to `term`
	// would fire one search per keystroke; the input stays a draft until the
	// form is submitted.
	onMount(() => {
		if (term.trim()) void run();
	});

	function searchExternals() {
		const q = term.trim();
		if (!q || extLoading) return;
		void runExternals(q);
	}

	/** POST /search keys are dual-cased on the wire; grouped for humans, values stay API-style. */
	const GROUPS: Array<{ key: string; types: string[] }> = [
		{
			key: 'search_group_core',
			types: ['protein', 'gene', 'sequence', 'predicted-fold', 'wet-lab-validation']
		},
		{
			key: 'search_group_design',
			types: [
				'vector_template',
				'expression_cassette',
				'construct',
				'biobrick',
				'restriction-enzyme',
				'codon_usage',
				'mutation_set'
			]
		},
		{
			key: 'search_group_lab',
			types: [
				'reagent',
				'enzyme',
				'reaction',
				'pathway',
				'strain',
				'cell_line',
				'media_recipe',
				'condition_template',
				'protocol',
				'measurement',
				'mutation_effect'
			]
		},
		{
			key: 'search_group_community',
			types: [
				'contribution',
				'correction',
				'retraction',
				'benchmark',
				'model_feedback',
				'interaction',
				'family',
				'comparison',
				'entry_wiki'
			]
		}
	];

	// hit.id IS the record's public id (`spd:protein:…`) — every typed read
	// accepts it, so business routes are built straight from it. The payload
	// carries no public id of its own (LIKE search never matches ids anyway).
	const ROUTE_BY_TYPE: Record<string, string> = {
		protein: '/proteins',
		gene: '/genes',
		sequence: '/sequences',
		predicted_fold: '/folds',
		fold: '/folds',
		wet_lab_validation: '/validations',
		validation: '/validations',
		artifact: '/artifacts',
		pdb_entry: '/pdb-entries',
		vector_template: '/vectors',
		expression_cassette: '/cassettes',
		construct: '/constructs',
		biobrick: '/biobricks',
		restriction_enzyme: '/restriction-enzymes',
		protocol: '/protocols',
		reagent: '/reagents',
		enzyme: '/enzymes',
		reaction: '/reactions',
		pathway: '/pathways',
		strain: '/strains',
		cell_line: '/cell-lines',
		media_recipe: '/media-recipes',
		condition_template: '/condition-templates',
		mutation_effect: '/mutation-effects',
		measurement: '/measurements',
		interaction: '/interactions',
		family: '/families',
		comparison: '/comparisons',
		codon_usage: '/codon-usage',
		mutation_set: '/mutation-sets',
		contribution: '/contributions',
		correction: '/corrections',
		retraction: '/retractions',
		benchmark: '/benchmarks',
		model_feedback: '/model-feedback'
	};

	function fields(hit: SearchHit): Record<string, unknown> {
		return hitFields(hit);
	}

	// first glance = a few plain scalars; structured payloads live on the raw
	// record page, which renders them field by field
	function scalarSummary(payload: unknown): string {
		if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
		const parts: string[] = [];
		for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
			if (v === null || typeof v === 'object') continue;
			const text = typeof v === 'boolean' ? (v ? tr('common_yes') : tr('common_no')) : String(v);
			parts.push(`${k}: ${text.slice(0, 60)}`);
			if (parts.length >= 3) break;
		}
		return parts.join(' · ');
	}

	function href(hit: SearchHit): string {
		const route = ROUTE_BY_TYPE[hit.entityType.replace(/-/g, '_')];
		return route ? `${route}/${hit.id}` : `/records/${hit.id}`;
	}

	function title(hit: SearchHit): string {
		return hitTitle(hit, shortPublicId(hit.id));
	}

	/** Two or three human bits under the title — what a curator would say aloud. */
	function bits(hit: SearchHit): string[] {
		const p = fields(hit);
		const out: string[] = [];
		const str = (k: string) => (typeof p[k] === 'string' && p[k] ? (p[k] as string) : '');
		if (str('geneName')) out.push(`gene ${p.geneName}`);
		const org = p.organism as Record<string, unknown> | undefined;
		if (org && typeof org.scientificName === 'string') out.push(org.scientificName);
		if (typeof p.length === 'number') out.push(`${p.length} aa`);
		if (Array.isArray(p.mutations) && p.mutations.length)
			out.push(`${(p.mutations as unknown[]).length} mutation(s)`);
		if (typeof p.confidence === 'number') out.push(`confidence ${p.confidence.toFixed(2)}`);
		if (typeof p.revision === 'number') out.push(`rev ${p.revision}`);
		if (typeof p.pdbId === 'string') out.push(String(p.pdbId));
		return out.slice(0, 3);
	}
</script>

<div class="space-y-4">
	<h1 class="flex items-center gap-1.5 text-2xl font-bold">
		{tr('nav_search')}
		<InfoTip text={tr('search_where_hint')} label={`${tr('nav_search')} — ${tr('common_more_info')}`} class="mt-1" />
	</h1>
	<form
		class="flex flex-wrap gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			void run();
		}}
	>
		<Input
			name="search_q"
			type="search"
			class="h-9 min-w-64 flex-1"
			placeholder={searchPlaceholder}
			bind:value={term}
		/>
		<Select
			name="search_type"
			class="h-9 w-52"
			placeholder={tr('search_all_types')}
			bind:value={entityType}
			options={[
				{ value: '', label: tr('search_all_types') },
				...GROUPS.flatMap((g) =>
					g.types.map((t) => ({
						value: t,
						label: `${tr(g.key)} · ${tr(`et_${t.replace(/-/g, '_')}`)}`
					}))
				)
			]}
		/>
		<Button type="submit" disabled={loading}>{tr('nav_search')}</Button>
		<SaveViewButton />
	</form>
	{#if error}
		<p
			class="rounded-none border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive"
		>
			{error}
		</p>
	{/if}

	{#if loading}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else if hits.length === 0 && !error}
		<p class="text-sm text-muted-foreground">
			{term.trim() ? tr('search_no_results') : tr('search_hint')}
		</p>
	{:else if !error}
		<p class="text-xs text-muted-foreground">{count ?? hits.length} {tr('search_results')}</p>
		<ul class="space-y-3">
			{#each hits as hit (`${hit.id}`)}
				<li class="rounded-none border bg-card p-3">
					<div class="flex flex-wrap items-center gap-2 text-sm">
						<Badge tone="info">{tr(`et_${hit.entityType.replace(/-/g, '_')}`)}</Badge>
						<a
							class="font-medium underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
							href={href(hit)}>{title(hit)}</a
						>
						{#if hit.status}<Badge tone="muted">{enumLabel('st', hit.status)}</Badge>{/if}
						<span class="ml-auto text-xs text-muted-foreground">{fmtTime(hit.createdAt)}</span>
					</div>
					<div
						class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
					>
						{#each bits(hit) as b (b)}<span>{b}</span>{/each}
						<a class="font-mono underline" href={`/records/${hit.id}`} title={hit.id}
							>{shortPublicId(hit.id)}</a
						>
					</div>
					{#if scalarSummary(hit.payload)}
						<p class="mt-1 truncate text-xs text-muted-foreground">{scalarSummary(hit.payload)}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if !loading && term.trim() && externalSources(entityType).length > 0}
		<div class="flex flex-wrap items-center gap-3 border border-dashed p-3">
			<InfoTip text={tr('ext_search_hint')} label={`${tr('ext_search_button')} — ${tr('common_more_info')}`} />
			<Button
				class="ml-auto"
				size="sm"
				variant="outline"
				disabled={extLoading}
				onclick={searchExternals}
				>{extLoading ? tr('common_loading') : tr('ext_search_button')}</Button
			>
		</div>
	{/if}

	{#if extGroups.length > 0 && !extLoading && !extUnavailable && extGroups.every((g) => (g.data?.items?.length ?? 0) === 0)}
		<p class="text-sm text-muted-foreground">{tr('ext_no_results')}</p>
	{/if}

	{#if extLoading || extUnavailable || extGroups.some((g) => (g.data?.items?.length ?? 0) > 0)}
		<Section title={tr('ext_section_title')} hint={tr('ext_section_hint')}>
			{#if extLoading}
				<p class="mt-2 text-sm text-muted-foreground">{tr('common_loading')}</p>
			{:else if extUnavailable}
				<p class="mt-2 text-sm text-muted-foreground">{tr('ext_unavailable')}</p>
			{:else}
				{#each extGroups as group (group.source)}
					{@const data = group.data}
					{#if data && data.items.length > 0}
						<div class="mt-3">
							<div class="flex items-center gap-2">
								<Badge tone={SOURCE_TONE[group.source]}>{tr(`ext_source_${group.source}`)}</Badge>
								<span class="text-xs text-muted-foreground">{data.items.length}</span>
							</div>
							<ul class="mt-2 space-y-2">
								{#each data.items as hit (hit.externalId)}
									{@const key = hitKey(group.source, hit)}
									{@const busy = importing === key}
									{@const url = hit.url}
									{@const subtitle = hit.subtitle}
									<li class="rounded-none border bg-card p-2">
										<div class="flex flex-wrap items-center gap-2">
											<button
												type="button"
												class="min-w-0 truncate text-left text-sm font-medium underline decoration-primary/40 underline-offset-2 hover:decoration-primary disabled:opacity-60"
												disabled={busy}
												title={hit.externalId}
												onclick={() => void importHit(group.source, hit)}>{hit.title}</button
											>
											{#if url}
												<a
													class="ml-auto text-xs underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
													href={url}
													target="_blank"
													rel="noopener"
													title={tr('ext_open_source')}>{tr(`ext_source_${group.source}`)} ↗</a
												>
											{/if}
											<Button
												class={url ? '' : 'ml-auto'}
												size="xs"
												variant="outline"
												disabled={busy}
												title={extFailed ? tr('ext_import_failed_hint') : undefined}
												onclick={() => void importHit(group.source, hit)}
												>{busy ? tr('ext_importing') : tr('ext_import')}</Button
											>
										</div>
										{#if subtitle}
											<p class="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				{/each}
			{/if}
		</Section>
	{/if}
</div>

<svelte:head><title>{tr('nav_search')} · SPD</title></svelte:head>
