<script lang="ts">
	import { page } from '$app/state';
	import { models } from '$lib/api/client';
	import { SpdApiError } from '$lib/api/base';
	import { tr } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import RelationsPanel from '$lib/components/RelationsPanel.svelte';

	/**
	 * A model identity: which weights, which runtime, which input protocol.
	 * The identity hash covers all of it, so this page exists to let a reader
	 * check the parts rather than trust the hash.
	 */
	const id = $derived(page.params.id ?? '');

	let row = $state<Record<string, unknown> | null>(null);
	let error = $state('');

	async function load() {
		try {
			row = (await models.get(id)) as unknown as Record<string, unknown>;
			error = '';
		} catch (e) {
			error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
		}
	}
	$effect(() => void load());

	const heading = $derived(
		row ? [row.modelName, row.modelVersion].filter(Boolean).join(' ') || tr('model_title') : tr('model_title')
	);

	const kv = $derived(
		row
			? (
					[
						['checkpointName', String(row.checkpointName ?? '')],
						['checkpointSha256', String(row.checkpointSha256 ?? '')],
						['inferenceRuntime', String(row.inferenceRuntime ?? '')],
						['inferenceCodeVersion', String(row.inferenceCodeVersion ?? '')],
						['inputProtocolVersion', String(row.inputProtocolVersion ?? '')],
						['trainedHeads', JSON.stringify(row.trainedHeads ?? [])],
						['identitySha256', String(row.identitySha256 ?? '')],
						['createdAt', row.createdAt ? fmtTime(Number(row.createdAt), true) : '']
					] as const
				).filter(([, v]) => v)
			: []
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
			<h1 class="font-heading text-xl font-semibold">{heading}</h1>
			<code class="mt-1 block font-mono text-xs break-all text-muted-foreground">{id}</code>
		</div>

		<div class="flex justify-end"><PageTools /></div>

		<Section title={tr('model_title')}>
			<dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
				{#each kv as [k, v]}
					<dt class="text-muted-foreground">{tr(`f_${k}`)}</dt>
					<dd class="break-all font-mono text-xs">{v}</dd>
				{/each}
			</dl>
		</Section>

		<RelationsPanel entityType="model" entityId={id} />
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{/if}

<svelte:head><title>{tr('model_title')} · SPD</title></svelte:head>
