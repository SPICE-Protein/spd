<script lang="ts">
	import { page } from '$app/state';
	import { users } from '$lib/api/client';
	import type { SpdFactorData } from '$lib/api/types';
	import { SpdApiError } from '$lib/api/base';
	import { tr } from '$lib/i18n';
	import Section from '$lib/components/Section.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import StatBar from '$lib/components/StatBar.svelte';

	const id = $derived(page.params.id ?? '');

	let data = $state<SpdFactorData | null>(null);
	let error = $state('');

	$effect(() => {
		void (async () => {
			try {
				data = await users.spdFactor(id);
				error = '';
			} catch (e) {
				data = null;
				error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
			}
		})();
	});

	const bars = $derived(
		data?.factor?.byType
			? Object.entries(data.factor.byType)
					.filter(([, v]) => v > 0)
					.map(([k, v]) => ({ label: tr(`ct_${k}`), value: v }))
			: []
	);
	const accepted = $derived(Array.isArray(data?.accepted) ? data.accepted : []);
	const pending = $derived(Array.isArray(data?.pending) ? data.pending : []);
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<h1 class="text-2xl font-bold">{tr('user_factor_title')}</h1>
	<p class="text-xs text-muted-foreground font-mono">{id}</p>
	<div class="flex justify-end"><PageTools /></div>

	{#if error}
		<p class="rounded-none border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
	{:else if data}
		<div class="flex flex-wrap items-center gap-3">
			<Section title={tr('user_factor_total')} class="min-w-40">
				<p class="text-4xl font-bold tabular-nums">{(data.factor?.total ?? 0).toFixed(1)}</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{tr('user_factor_accepted')} {data.acceptedCount ?? accepted.length} · {tr('user_factor_pending')} {data.pendingCount ?? pending.length}
				</p>
				{#if data.displayName}<p class="mt-1 text-sm">{data.displayName}</p>{/if}
				{#if data.orcidId}<a class="text-xs underline font-mono" href={`https://orcid.org/${data.orcidId}`} target="_blank" rel="noopener">{data.orcidId}</a>{/if}
			</Section>
			<Section title={tr('user_factor_byType')} class="flex-1">
				{#if bars.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
				{:else}<StatBar items={bars} />{/if}
			</Section>
		</div>
		<p class="rounded-none border bg-muted/30 p-3 text-xs text-muted-foreground">{tr('user_factor_note')}</p>
		{#if accepted.length}
			<Section title={tr('user_factor_accepted')}>
				<ul class="space-y-1 text-xs">
					{#each accepted as raw, i (i)}
						{@const e = raw as Record<string, unknown>}
						<li class="flex items-center gap-2">
							<Badge tone="ok">{tr(`ct_${String(e.entityType ?? '')}`)}</Badge>
							<code>{String(e.entityId ?? '').slice(0, 28)}</code>
							{#if e.weight}<span class="tabular-nums">{Number(e.weight).toFixed(1)}</span>{/if}
						</li>
					{/each}
				</ul>
			</Section>
		{/if}
		{#if pending.length}
			<Section title={tr('user_factor_pending')}>
				<ul class="space-y-1 text-xs">
					{#each pending as raw, i (i)}
						{@const e = raw as Record<string, unknown>}
						<li class="flex items-center gap-2">
							<Badge tone="warn">{tr(`ct_${String(e.entityType ?? '')}`)}</Badge>
							<code>{String(e.entityId ?? '').slice(0, 28)}</code>
						</li>
					{/each}
				</ul>
			</Section>
		{/if}
	{/if}
</div>

<svelte:head><title>{tr('user_factor_title')} · SPD</title></svelte:head>
