<script lang="ts">
	import { folds, firstArray } from '$lib/api/client';
	import { tr } from '$lib/i18n';
	import { toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/components/table';
	import Input from '$lib/components/Input.svelte'

	interface FoldQueryRow {
		id: string;
		publicId?: string;
		sequenceId?: string;
		environmentId?: string;
		/** The query answers with the model *record* id, not the identity hash. */
		modelId?: string;
		[key: string]: unknown;
	}

	let seqId = $state('');
	let envId = $state('');
	let modelId = $state('');
	let foldHash = $state('');
	let limit = $state('50');
	let rows = $state<FoldQueryRow[]>([]);
	let searched = $state(false);

	async function run() {
		try {
			const data = await folds.query({
				sequenceId: seqId.trim() || undefined,
				environmentId: envId.trim() || undefined,
				modelIdentityId: modelId.trim() || undefined,
				foldIdentityHash: foldHash.trim() || undefined,
				limit: Number(limit) || 50
			});
			rows = firstArray<FoldQueryRow>(data, 'folds', 'items', 'rows');
			searched = true;
		} catch (e) {
			toastErr(e);
		}
	}

	// Fold rows carry the same value in `id` and `publicId`; two identical
	// columns just push the useful fields off-screen.
	const columns: Column<FoldQueryRow>[] = [
		{ key: 'id', label: tr('col_id'), format: (r) => String(r.publicId ?? r.id ?? '') },
		{ key: 'sequenceId', label: tr('f_sequenceId') },
		{ key: 'environmentId', label: tr('f_environmentId') },
		{ key: 'modelId', label: tr('f_modelId') }
	];
</script>

<div class="mx-auto max-w-4xl space-y-4">
	<h1 class="text-2xl font-bold">{tr('browse_folds_query')}</h1>
	<Section>
		<div class="grid gap-2 sm:grid-cols-2">
			<Input name="fq_seq" class="h-8 w-full font-mono text-sm" placeholder={tr('fold_placeholder_seqid')} bind:value={seqId} />
			<Input name="fq_env" class="h-8 w-full font-mono text-sm" placeholder="environmentId" bind:value={envId} />
			<Input name="fq_model" class="h-8 w-full font-mono text-sm" placeholder="modelIdentityId" bind:value={modelId} />
			<Input name="fq_hash" class="h-8 w-full font-mono text-sm" placeholder={'foldIdentityHash (sha256:…)'} bind:value={foldHash} />
		</div>
		<div class="mt-2 flex items-center gap-2">
			<label class="text-xs text-muted-foreground">limit <Input name="fq_limit" class="h-7 w-16 px-2 text-xs" bind:value={limit} /></label>
			<Button size="sm" onclick={run}>{tr('nav_search')}</Button>
		</div>
	</Section>

	{#if searched}
		{#snippet none()}
			<p class="text-sm text-muted-foreground">{tr('search_no_results')}</p>
		{/snippet}
		<DataTable {rows} {columns} hrefFor={(r) => `/folds/${r.publicId ?? r.id}`} empty={none} />
	{/if}
</div>

<svelte:head><title>{tr('browse_folds_query')} · SPD</title></svelte:head>
