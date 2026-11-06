<script lang="ts">
	import { stats, firstArray } from '$lib/api/client';
	import type { StatsOverview, TrendingItem } from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import { fmtNumber, entityHref, shortPublicId } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import SeasonalNote from '$lib/components/SeasonalNote.svelte';
	import { seasonal } from '$lib/state/seasonal.svelte';
	import { SpdApiError } from '$lib/api/base';

	let overview = $state<StatsOverview | null>(null);
	let trending = $state<TrendingItem[]>([]);
	let loadError = $state('');
	let term = $state('');
	const searchPlaceholder = $derived(seasonal.season === 'pi-day' ? tr('season_pi_search_placeholder') : tr('nav_search_placeholder'));

	$effect(() => {
		void (async () => {
			try {
				overview = await stats.overview();
				const t = await stats.trending(undefined, 30);
				trending = firstArray<TrendingItem>(t, 'items', 'trending');
			} catch (e) {
				loadError = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
			}
		})();
	});

	// stats/overview keys → frontend catalog routes (FEATURE_LIST §35 fixed list of 21)
	const ROUTES: Record<string, string> = {
		proteins: '/proteins',
		genes: '/genes',
		sequences: '/browse#sequences',
		folds: '/browse#folds',
		validations: '/validations',
		measurements: '/measurements',
		mutationEffects: '/mutation-effects',
		vectors: '/vectors',
		restrictionEnzymes: '/restriction-enzymes',
		biobricks: '/biobricks',
		protocols: '/protocols',
		reagents: '/reagents',
		enzymes: '/enzymes',
		reactions: '/reactions',
		pathways: '/pathways',
		strains: '/strains',
		cellLines: '/cell-lines',
		recipes: '/media-recipes',
		conditionTemplates: '/condition-templates',
		families: '/families',
		interactions: '/interactions',
		comparisons: '/comparisons',
		leaderboard: '/leaderboard'
	};

	const countCards = $derived(
		overview
			? Object.entries(overview.counts ?? {})
					.sort((a, b) => b[1] - a[1])
					.slice(0, 12)
			: []
	);
</script>

<div class="space-y-6">
	<div class="rounded-none border bg-gradient-to-b from-muted/60 to-transparent px-6 py-10 text-center">
		<h1 class="text-3xl font-bold tracking-tight">{tr('home_title')}</h1>
		<p class="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">{tr('home_subtitle')}</p>
		<form
			class="mx-auto mt-5 flex max-w-xl gap-2"
			onsubmit={(e) => {
				e.preventDefault();
				if (term.trim()) location.href = `/search?q=${encodeURIComponent(term.trim())}`;
			}}
		>
			<Input name="home_q" type="search" class="h-10 flex-1 px-4" placeholder={searchPlaceholder} bind:value={term} />
			<Button type="submit">{tr('nav_search')}</Button>
		</form>
		<!-- example queries: a first-time visitor's real problem is not knowing what to type -->
		<div class="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
			<span class="text-muted-foreground">{tr('home_try_label')}</span>
			{#each ['GFP', 'kinase', 'HEK293', 'pET-28a', 'antibody'] as q (q)}
				<a class="rounded-none border px-3 py-1 hover:border-primary/50 hover:bg-accent/40" href={`/search?q=${encodeURIComponent(q)}`}>{q}</a>
			{/each}
		</div>
		<div class="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
			<Button href="/submit" variant="outline" size="sm">{tr('home_submit_cta')}</Button>
			<Button href="/help" variant="ghost" size="sm">{tr('nav_help')}</Button>
			<Button href="/browse" variant="ghost" size="sm">{tr('nav_browse')}</Button>
		</div>
		<SeasonalNote />
	</div>

	<div class="grid gap-4 md:grid-cols-3">
		{#each [
			{ n: 1, href: '/search', icon: '🔍' },
			{ n: 2, href: '/proteins', icon: '🧬' },
			{ n: 3, href: '/folds/query', icon: '🧊' }
		] as step (step.n)}
			<a href={step.href} class="group rounded-none border bg-card p-4 transition-colors hover:border-primary/50">
				<p class="text-xs font-medium text-muted-foreground">{tr('home_step_n', { n: step.n })}</p>
				<p class="mt-1 text-base font-semibold">{step.icon} {tr(`home_step${step.n}_title`)}</p>
				<p class="mt-1 text-sm leading-relaxed text-muted-foreground">{tr(`home_step${step.n}_body`)}</p>
			</a>
		{/each}
	</div>

	{#if loadError}
		<p class="rounded-none border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
			{tr('home_api_note')} — {loadError}
		</p>
	{/if}

	<div class="grid gap-4 lg:grid-cols-3">
		<Section title={tr('home_counts_title')} class="lg:col-span-2">
			{#if !overview && !loadError}
				<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
			{:else if countCards.length === 0}
				<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
					{#each countCards as [key, value] (key)}
						<a href={ROUTES[key] ?? '/browse'} class="rounded-none border bg-background p-3 transition-colors hover:border-primary/50">
							<p class="text-xl font-semibold tabular-nums">{fmtNumber(value)}</p>
							<p class="text-xs text-muted-foreground">{tr(`stat_${key}`)}</p>
						</a>
					{/each}
				</div>
			{/if}
		</Section>

		<Section title={tr('home_trending_title')}>
			{#snippet actions()}
				<Button href="/stats" size="xs" variant="ghost">{tr('common_view_all')}</Button>
			{/snippet}
			{#if trending.length === 0}
				<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}
				<ul class="space-y-1.5 text-sm">
					{#each trending.slice(0, 10) as item (`${item.entityType}:${item.entityId}`)}
						<li class="flex items-center justify-between gap-2">
							<a class="truncate font-mono text-xs underline" href={entityHref(item.entityType, item.entityId)} title={item.entityId}>
								{shortPublicId(item.entityId)}
							</a>
							<span class="tabular-nums text-xs text-muted-foreground">{item.queries ?? item.count ?? 0}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</Section>
	</div>

</div>

<svelte:head><title>{tr('app_name')}</title></svelte:head>
