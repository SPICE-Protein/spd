<script lang="ts">
	import { stats, firstArray } from '$lib/api/client';
	import type { StatsOverview, TrendingItem, MatchRateBucket, EnvPreferenceBucket } from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import { fmtNumber, shortPublicId } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import StatBar from '$lib/components/StatBar.svelte';

	let overview = $state<StatsOverview | null>(null);
	let trending = $state<TrendingItem[]>([]);
	let matchRate = $state<MatchRateBucket[]>([]);
	let overall = $state<Record<string, number> | null>(null);
	let phBuckets = $state<EnvPreferenceBucket[]>([]);
	let tempBuckets = $state<EnvPreferenceBucket[]>([]);

	$effect(() => {
		void (async () => {
			const [o, t, m, e] = await Promise.allSettled([
				stats.overview(),
				stats.trending(undefined, 30),
				stats.matchRate(12),
				stats.envPreferences()
			]);
			if (o.status === 'fulfilled') overview = o.value;
			if (t.status === 'fulfilled') trending = firstArray<TrendingItem>(t.value, 'items', 'trending');
			if (m.status === 'fulfilled') {
				matchRate = firstArray<MatchRateBucket>(m.value, 'buckets', 'trend');
				overall = (m.value.overall as Record<string, number>) ?? null;
			}
			if (e.status === 'fulfilled') {
				phBuckets = firstArray<EnvPreferenceBucket>(
					e.value.phBuckets ?? e.value.phRanges ?? e.value.ph ?? []
				);
				tempBuckets = firstArray<EnvPreferenceBucket>(
					e.value.temperatureBuckets ?? e.value.temperatureRanges ?? e.value.temperature ?? []
				);
			}
		})();
	});

	// `entityId` starts with `spd:<type>:`, so slicing the raw id showed every
	// gene as "gene:spd:gene" and made the keyed bars collide. Shorten the
	// public id instead: the type prefix survives, the hash stays distinct.
	const trendBars = $derived(
		trending.map((t) => ({ label: shortPublicId(t.entityId), value: t.queries ?? t.count ?? 0 }))
	);
	const matchBars = $derived(
		matchRate.map((b) => ({
			label: String(b.bucket ?? b.period ?? ''),
			value: Number(b.matchRate ?? b.rate ?? 0) * 100,
			hint: `${b.matches ?? 0}/${b.total ?? 0}`
		}))
	);
	const phBars = $derived(
		phBuckets.map((b) => ({ label: String(b.bucket ?? b.range ?? ''), value: Number(b.count) }))
	);
	const tempBars = $derived(
		tempBuckets.map((b) => ({ label: String(b.bucket ?? b.range ?? ''), value: Number(b.count) }))
	);
</script>

<div class="space-y-4">
	<h1 class="text-2xl font-bold">{tr('nav_stats')}</h1>

	{#if overview}
		<Section title={tr('home_counts_title')}>
			<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
				{#each Object.entries(overview.counts ?? {}) as [k, v] (k)}
					<div class="rounded-none border p-2 text-center">
						<p class="text-lg font-semibold tabular-nums">{fmtNumber(v)}</p>
						<p class="truncate text-[10px] text-muted-foreground">{tr(`stat_${k}`)}</p>
					</div>
				{/each}
			</div>
		</Section>
	{/if}

	<div class="grid gap-4 lg:grid-cols-2">
		<Section title={tr('home_trending_title')}>
			{#if trendBars.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}<StatBar items={trendBars} />{/if}
		</Section>
		<Section title={tr('stats_match_rate')}>
			{#if overall}<p class="mb-2 text-xs text-muted-foreground">{tr('stats_overall')}: {(Number(overall.matchRate ?? overall.rate ?? 0) * 100).toFixed(1)}% ({overall.matches ?? 0}/{overall.total ?? 0})</p>{/if}
			{#if matchBars.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}<StatBar items={matchBars} unit="%" />{/if}
		</Section>
		<Section title={tr('stats_ph_buckets')}>
			{#if phBars.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}<StatBar items={phBars} />{/if}
		</Section>
		<Section title={tr('stats_temp_buckets')}>
			{#if tempBars.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}<StatBar items={tempBars} />{/if}
		</Section>
	</div>
</div>

<svelte:head><title>{tr('nav_stats')} · SPD</title></svelte:head>
