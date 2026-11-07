<script lang="ts">
	import { search } from '$lib/api/client';
	import type { SearchHit } from '$lib/api/types';
	import { SpdApiError } from '$lib/api/base';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime, hitFields, hitTitle, shortPublicId } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Button from '$lib/components/Button.svelte';
	import PageTools from '$lib/components/PageTools.svelte';

	let rows = $state<SearchHit[]>([]);
	let loading = $state(true);
	let error = $state('');

	$effect(() => {
		void (async () => {
			loading = true;
			try {
				// no list-by-type endpoint: the search API filters by entityType.
				const env = await search.run({ entityType: 'wet-lab-validation', limit: 50 });
				rows = (Array.isArray(env.data) ? env.data : []).sort(
					(a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
				);
			} catch (e) {
				error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
			} finally {
				loading = false;
			}
		})();
	});

	function field(hit: SearchHit, key: string): string {
		const v = hitFields(hit)[key];
		return typeof v === 'string' ? v : '';
	}

	// validation rows are addressed by their own record id, not the api_record id
	function bizId(hit: SearchHit): string {
		return String(hitFields(hit).id ?? hit.id);
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="flex items-center gap-1.5 text-2xl font-bold">
				{tr('validations_title')}
				<InfoTip text={tr('validations_intro')} label={`${tr('validations_title')} — ${tr('common_more_info')}`} class="mt-1" />
			</h1>
		</div>
		<div class="flex gap-2">
			<PageTools withPrint={false} />
			<Button href="/submit/validation" size="sm" variant="outline">{tr('submit_validation')}</Button>
			<Button href="/leaderboard" size="sm" variant="ghost">{tr('lb_title')}</Button>
		</div>
	</div>

	{#if loading}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else if error}
		<p class="rounded-none border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
	{:else if rows.length === 0}
		<p class="rounded-none border bg-card p-4 text-sm text-muted-foreground">
			{tr('validations_empty')}
		</p>
	{:else}
		<Section title={tr('validations_recent')}>
			<ul class="divide-y">
				{#each rows as hit (`${hit.id}`)}
					<li class="flex flex-wrap items-center gap-2 py-2 text-sm">
						<a class="underline decoration-primary/40 hover:decoration-primary" href={`/validations/${bizId(hit)}`}>
							{hitTitle(hit, shortPublicId(hit.id))}
						</a>
						<Badge tone="muted">{enumLabel('vt', field(hit, 'validationType'))}</Badge>
						<StatusBadge status={hit.status} ns="vs" />
						<span class="ml-auto text-xs text-muted-foreground">{fmtTime(hit.createdAt)}</span>
					</li>
				{/each}
			</ul>
		</Section>
	{/if}
</div>

<svelte:head><title>{tr('validations_title')} · SPD</title></svelte:head>
