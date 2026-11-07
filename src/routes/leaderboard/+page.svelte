<script lang="ts">
	import { stats } from '$lib/api/client';
	import type { LeaderboardItem } from '$lib/api/types';
	import { SpdApiError } from '$lib/api/base';
	import { tr } from '$lib/i18n';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Button from '$lib/components/Button.svelte';

	let rows = $state<LeaderboardItem[]>([]);
	let loading = $state(true);
	let error = $state('');

	$effect(() => {
		void (async () => {
			loading = true;
			try {
				const d = await stats.leaderboard();
				rows = d.leaderboard ?? [];
				error = '';
			} catch (e) {
				error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
			} finally {
				loading = false;
			}
		})();
	});

	const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? String(i + 1);
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<div>
		<h1 class="flex items-center gap-1.5 text-2xl font-bold">
			{tr('lb_title')}
			<InfoTip text={tr('lb_intro')} label={`${tr('lb_title')} — ${tr('common_more_info')}`} class="mt-1" />
		</h1>
	</div>

	{#if loading}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else if error}
		<p class="rounded-none border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
	{:else if rows.length === 0}
		<p class="rounded-none border bg-card p-4 text-sm text-muted-foreground">
			{tr('lb_empty')}
			<a class="underline" href="/submit/validation">{tr('submit_validation')}</a>
		</p>
	{:else}
		<Section title={tr('lb_title')} hint={tr('lb_method')}>
			<ul class="divide-y">
				{#each rows as r, i (r.userId)}
					<li class="flex items-center gap-3 py-2.5 text-sm">
						<span class="w-8 text-center text-lg">{medal(i)}</span>
						<div class="min-w-0 flex-1">
							<a class="font-medium underline decoration-primary/40 hover:decoration-primary" href={`/users/${r.userId}`}>
								{r.displayName ?? r.orcidId}
							</a>
							<p class="truncate font-mono text-xs text-muted-foreground">
								<a class="underline" href={`https://orcid.org/${r.orcidId}`} target="_blank" rel="noopener">{r.orcidId}</a>
							</p>
						</div>
						<div class="text-right">
							<p class="font-semibold tabular-nums">{r.factor.toFixed(2)}</p>
							<p class="text-xs text-muted-foreground">{tr('lb_factor')}</p>
						</div>
						<div class="w-16 text-right">
							<p class="font-semibold tabular-nums">{r.validationCount}</p>
							<p class="text-xs text-muted-foreground">{tr('lb_validations')}</p>
						</div>
					</li>
				{/each}
			</ul>
		</Section>
	{/if}

	<div class="flex gap-2">
		<Button href="/submit/validation" variant="outline" size="sm">{tr('submit_validation')}</Button>
		<Button href="/stats" variant="ghost" size="sm">{tr('nav_stats')}</Button>
	</div>
</div>

<svelte:head><title>{tr('lb_title')} · SPD</title></svelte:head>
