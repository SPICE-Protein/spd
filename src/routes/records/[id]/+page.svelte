<script lang="ts">
	import { page } from '$app/state';
	import { records } from '$lib/api/client';
	import { SpdApiError } from '$lib/api/base';
	import { tr } from '$lib/i18n';
	import { fmtTime, entityHref } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import DataView from '$lib/components/DataView.svelte';
	import IdLink from '$lib/components/IdLink.svelte';

	const id = $derived(page.params.id ?? '');

	let row = $state<Record<string, unknown> | null>(null);
	let error = $state('');

	async function load() {
		try {
			row = await records.get(id);
			error = '';
		} catch (e) {
			error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
		}
	}
	$effect(() => void load());

	const entityType = $derived(String(row?.entityType ?? ''));
	const targetHref = $derived(
		row?.targetId ? entityHref(entityType || 'entity', String(row.targetId)) : ''
	);
</script>

{#if error}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		{error}
	</div>
{:else if row}
	<div class="mx-auto max-w-3xl space-y-4">
		<div>
			<h1 class="text-xl font-bold">{tr('records_title')}</h1>
			<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<code class="font-mono break-all">{String(row.id ?? id)}</code>
				{#if entityType}<Badge tone="info">{entityType}</Badge>{/if}
				{#if row.status}<Badge tone={String(row.status) === 'active' ? 'ok' : 'muted'}
						>{String(row.status)}</Badge
					>{/if}
			</div>
		</div>

		<div class="flex justify-end"><PageTools /></div>

		<Section title={tr('record_context')}>
			<dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
				<dt class="text-muted-foreground">{tr('f_entityType')}</dt>
				<dd class="font-mono text-xs">{entityType || '—'}</dd>
				{#if row.targetId}
					<dt class="text-muted-foreground">{tr('f_targetId')}</dt>
					<dd class="break-all font-mono text-xs">
						{#if targetHref}
							<a class="underline" href={targetHref}>{String(row.targetId)}</a>
						{:else}
							<IdLink id={String(row.targetId)} showFull />
						{/if}
					</dd>
				{/if}
				{#if row.createdBy}
					<dt class="text-muted-foreground">{tr('f_createdBy')}</dt>
					<dd class="font-mono text-xs"><IdLink id={String(row.createdBy)} showFull /></dd>
				{/if}
				{#if row.createdAt}
					<dt class="text-muted-foreground">{tr('f_createdAt')}</dt>
					<dd class="text-xs">{fmtTime(Number(row.createdAt), true)}</dd>
				{/if}
			</dl>
			{#if row.title}<p class="mt-2 text-sm font-medium">{String(row.title)}</p>{/if}
			{#if row.summary}<p class="mt-1 text-sm text-muted-foreground">{String(row.summary)}</p>{/if}
		</Section>

		{#if row.payload != null}
			<DataView label={tr('common_details')} value={row.payload} />
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{/if}

<svelte:head><title>{tr('records_title')} · SPD</title></svelte:head>
