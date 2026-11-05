<script lang="ts">
	import { page } from '$app/state';
	import { artifacts } from '$lib/api/client';
	import { SpdApiError } from '$lib/api/base';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import IdLink from '$lib/components/IdLink.svelte';

	const id = $derived(page.params.id ?? '');

	let row = $state<Record<string, unknown> | null>(null);
	let error = $state('');

	async function load() {
		try {
			row = await artifacts.get(id);
			error = '';
		} catch (e) {
			error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
		}
	}
	$effect(() => void load());

	const kv = $derived(
		row
			? (
					[
						['artifactId', String(row.artifactId ?? row.id ?? id)],
						['kind', String(row.kind ?? '')],
						['mediaType', String(row.mediaType ?? '')],
						['status', String(row.status ?? '')],
						['size', row.byteLength != null ? `${Number(row.byteLength)} bytes` : ''],
						['sha256', String(row.sha256 ?? '')],
						['objectKey', String(row.objectKey ?? '')],
						['provenance', String(row.provenance ?? '')],
						['createdBy', String(row.createdBy ?? '')],
						['createdAt', row.createdAt ? fmtTime(Number(row.createdAt), true) : '']
					] as const
				).filter(([, v]) => v)
			: []
	);

	async function copyObjectKey() {
		try {
			await navigator.clipboard.writeText(String(row?.objectKey ?? ''));
		} catch {
			toastErr(tr('upload_clipboard_fail'));
		}
	}
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
			<h1 class="text-xl font-bold">{tr('artifact_title')}</h1>
			<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<code class="font-mono break-all">{String(row.artifactId ?? row.id ?? id)}</code>
				{#if row.kind}<Badge tone="info">{enumLabel('ak', String(row.kind))}</Badge>{/if}
				{#if row.status}
					<Badge tone={row.status === 'completed' ? 'ok' : row.status === 'failed' ? 'bad' : 'warn'}
						>{String(row.status)}</Badge
					>
				{/if}
			</div>
		</div>

		<div class="flex justify-end"><PageTools /></div>

		<IssuePanel
			entityType="artifact"
			entityId={String(row.artifactId ?? row.id ?? id)}
			hasWiki={false}
		/>

		<Section title={tr('artifact_meta')}>
			<dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
				{#each kv as [k, v]}
					<dt class="text-muted-foreground">{tr(`f_${k}`)}</dt>
					<dd class="break-all font-mono text-xs">
						{#if (k === 'createdBy' || k === 'objectKey') && String(row?.[k])?.startsWith('spd:')}
							<IdLink id={String(row[k])} showFull />
						{:else}
							{v}
						{/if}
					</dd>
				{/each}
			</dl>
			{#if row.objectKey}
				<div class="mt-3 flex flex-wrap items-center gap-2">
					{#if row.status === 'completed'}
						<Button size="sm" variant="outline" href={artifacts.downloadUrl(String(row.id ?? id))}
							>{tr('artifact_download')}</Button
						>
					{/if}
					<Button size="sm" variant="outline" onclick={copyObjectKey}
						>{tr('artifact_copy_key')}</Button
					>
					<span class="self-center text-xs text-muted-foreground">{tr('artifact_bytes_note')}</span>
				</div>
			{/if}
		</Section>

	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{/if}

<svelte:head><title>{tr('artifact_title')} · SPD</title></svelte:head>
