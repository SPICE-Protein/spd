<script lang="ts">
	import { page } from '$app/state';
	import { environments } from '$lib/api/client';
	import { SpdApiError } from '$lib/api/base';
	import { tr } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import RelationsPanel from '$lib/components/RelationsPanel.svelte';

	/**
	 * A canonical computation environment: the conditions a fold was computed
	 * under, addressed by its own hash so two runs can be compared
	 * byte-for-byte. The record has no name column — the conditions are the
	 * identity — so the page leads with them.
	 */
	const id = $derived(page.params.id ?? '');

	let row = $state<Record<string, unknown> | null>(null);
	let error = $state('');

	async function load() {
		try {
			row = (await environments.get(id)) as unknown as Record<string, unknown>;
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
						['ph', row.ph != null ? String(row.ph) : ''],
						['temperatureK', row.temperatureK != null ? String(row.temperatureK) : ''],
						['pressureBar', row.pressureBar != null ? String(row.pressureBar) : ''],
						['ionicStrengthM', row.ionicStrengthM != null ? String(row.ionicStrengthM) : ''],
						['protonationModel', String(row.protonationModel ?? '')],
						['solvent', JSON.stringify(row.solvent ?? {})],
						['environmentSha256', String(row.environmentSha256 ?? '')],
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
			<h1 class="font-heading text-xl font-semibold">{tr('environment_title')}</h1>
			<code class="mt-1 block font-mono text-xs break-all text-muted-foreground">{id}</code>
		</div>

		<div class="flex justify-end"><PageTools /></div>

		<Section title={tr('environment_title')}>
			<dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
				{#each kv as [k, v]}
					<dt class="text-muted-foreground">{tr(`f_${k}`)}</dt>
					<dd class="break-all font-mono text-xs">{v}</dd>
				{/each}
			</dl>
		</Section>

		<RelationsPanel entityType="environment" entityId={id} />
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{/if}

<svelte:head><title>{tr('environment_title')} · SPD</title></svelte:head>
