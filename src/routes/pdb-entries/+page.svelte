<script lang="ts">
	import { pdbEntries, firstArray } from '$lib/api/client';
	import type { PdbEntryRow } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/components/table';
	import Button from '$lib/components/Button.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';
	import Input from '$lib/components/Input.svelte'

	let rows = $state<PdbEntryRow[]>([]);
	let loading = $state(true);
	let q = $state('');

	async function load() {
		loading = true;
		try {
			const data = await pdbEntries.list(200);
			rows = firstArray<PdbEntryRow>(data, 'pdbEntries', 'entries', 'items');
		} catch (e) {
			toastErr(e);
		} finally {
			loading = false;
		}
	}
	void load();

	// GET /pdb-entries accepts only `limit`; the search box filters locally.
	const shown = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		if (!needle) return rows;
		return rows.filter(
			(r) =>
				r.pdbId?.toLowerCase().includes(needle) ||
				r.title?.toLowerCase().includes(needle) ||
				(r.uniprotAccessions ?? []).some((a) => a.toLowerCase().includes(needle))
		);
	});

	const FIELDS: FormField[] = [
		{ name: 'pdbId', required: true, hint: tr('pdb_hint_id') },
		{ name: 'title', required: true },
		{ name: 'experimentalMethod', required: true, hint: tr('pdb_hint_method') },
		{ name: 'uniprotAccessions', kind: 'list', required: true, hint: tr('pdb_hint_accessions') },
		{ name: 'resolutionAngstrom', kind: 'number', hint: tr('pdb_hint_resolution') },
		{ name: 'releasedAt', kind: 'number', hint: tr('pdb_hint_unix') },
		{ name: 'sourceUpdatedAt', kind: 'number', hint: tr('pdb_hint_unix') },
		{ name: 'metadata', kind: 'json', hint: tr('pdb_hint_metadata') }
	];

	let showCreate = $state(false);
	let values = $state<Record<string, string>>({});
	let formError = $state('');
	let saving = $state(false);

	async function create() {
		formError = '';
		const b = buildSafe(values, FIELDS);
		if (b.error || !b.body) return (formError = b.error ?? tr('form_required_missing'));
		const body = b.body as Record<string, unknown>;
		body.uniprotAccessions = Array.isArray(body.uniprotAccessions) ? body.uniprotAccessions : [];
		saving = true;
		try {
			const r = await pdbEntries.create(body as never);
			toastOk(r.created ? tr('pdb_created') : tr('pdb_updated'));
			showCreate = false;
			values = {};
			await load();
		} catch (e) {
			formError = e instanceof Error ? e.message : String(e);
			toastErr(e);
		} finally {
			saving = false;
		}
	}

	const columns: Column<PdbEntryRow>[] = [
		{ key: 'pdbId', label: 'PDB ID', format: (r) => r.pdbId.toUpperCase() },
		{ key: 'title', label: tr('f_title'), format: (r) => r.title },
		{ key: 'experimentalMethod', label: tr('f_experimentalMethod') },
		{
			key: 'resolutionAngstrom',
			label: tr('f_resolutionAngstrom'),
			format: (r) => (r.resolutionAngstrom != null ? `${Number(r.resolutionAngstrom).toFixed(2)} Å` : '—')
		},
		{ key: 'updatedAt', label: tr('f_updatedAt'), format: (r) => fmtTime(r.updatedAt ?? r.createdAt) }
	];
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-bold">{tr('pdb_title')}</h1>
			<p class="mt-1 text-sm text-muted-foreground">{tr('pdb_intro')}</p>
		</div>
		<PageTools withPrint={false} />
		{#if session.signedIn}
			<Button size="sm" onclick={() => (showCreate = true)}>{tr('pdb_import')}</Button>
		{/if}
	</div>

	<form
		class="flex gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			void load();
		}}
	>
		<Input name="pdb_q" type="search" class="h-8 w-64" placeholder={tr('pdb_search_placeholder')} bind:value={q} />
		<Button size="sm" type="submit" variant="outline">{tr('common_search')}</Button>
	</form>

	{#if loading}<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else}<DataTable rows={shown} {columns} hrefFor={(r) => `/pdb-entries/${r.pdbId}`} />{/if}
</div>

<Dialog bind:open={showCreate} title={tr('pdb_import')} width="max-w-2xl">
	<div class="space-y-3">
		<p class="text-xs text-muted-foreground">{tr('pdb_upsert_hint')}</p>
		{#if formError}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">{formError}</p>{/if}
		<FormFields fields={FIELDS} bind:values columns={2} />
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showCreate = false)}>{tr('common_cancel')}</Button>
			<Button onclick={create} disabled={saving}>{tr('common_submit')}</Button>
		</div>
	</div>
</Dialog>

<svelte:head><title>{tr('pdb_title')} · SPD</title></svelte:head>
