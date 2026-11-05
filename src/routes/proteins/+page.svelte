<script lang="ts">
	import { proteins, firstArray } from '$lib/api/client';
	import type { ProteinRecord } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { toastErr, toastOk } from '$lib/state/toast.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/components/table';
	import Button from '$lib/components/Button.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';
	import Badge from '$lib/components/Badge.svelte';

	let rows = $state<ProteinRecord[]>([]);
	let loading = $state(true);
	let error = $state('');

	async function load() {
		loading = true;
		error = '';
		try {
			const data = await proteins.list(100);
			rows = data?.items ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
	void load();

	const FIELDS: FormField[] = [
		{ name: 'preferredName', required: true },
		{ name: 'geneName' },
		{ name: 'organism_taxId', kind: 'organism', companion: 'organism_scientificName', label: tr('f_organism'), hint: tr('organism_hint_pair') },
		{ name: 'tags', kind: 'list', hint: tr('form_hint_comma_list') },
		{ name: 'license', kind: 'select', options: ['CC-BY-4.0'] },
		{ name: 'externalReferences', kind: 'objectList', hint: tr('form_hint_json_object'), itemFields: [{ key: 'source' }, { key: 'id' }, { key: 'url' }] }
	];

	let showCreate = $state(false);
	let values = $state<Record<string, string>>({ license: 'CC-BY-4.0' });
	let formError = $state('');
	let saving = $state(false);

	async function create() {
		formError = '';
		const { body, error: parseErr } = buildSafe(values, FIELDS);
		if (parseErr || !body) return (formError = parseErr ?? '');
		const b: Record<string, unknown> = { ...body };
		if (b.organism_scientificName || b.organism_taxId) {
			b.organism = { scientificName: b.organism_scientificName ?? null, taxId: b.organism_taxId ?? null };
		}
		delete b.organism_scientificName;
		delete b.organism_taxId;
		if (!b.preferredName) return (formError = tr('form_required_missing'));
		saving = true;
		try {
			const receipt = await proteins.create(b as never);
			toastOk(receipt.created ? tr('proteins_created') : tr('proteins_existed'));
			showCreate = false;
			values = { license: 'CC-BY-4.0' };
			await load();
		} catch (e) {
			formError = e instanceof Error ? e.message : String(e);
			toastErr(e);
		} finally {
			saving = false;
		}
	}

	const columns: Column<ProteinRecord>[] = [
		{ key: 'id', label: tr('col_id') },
		{ key: 'preferredName', label: tr('f_preferredName') },
		{ key: 'geneName', label: tr('f_geneName') },
		{ key: 'organism', label: tr('f_organism'), format: (r) => r.organism?.scientificName ?? '—' },
		{ key: 'license', label: tr('f_license') },
		{ key: 'status', label: tr('f_status') },
		{ key: 'createdAt', label: tr('f_createdAt'), format: (r) => fmtTime(r.createdAt) }
	];
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-2xl font-bold">{tr('nav_proteins')}</h1>
		<PageTools withPrint={false} />
		{#if session.signedIn}
			<Button onclick={() => (showCreate = true)}>{tr('proteins_create')}</Button>
		{:else}
			<Button variant="outline" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		{/if}
	</div>

	{#if error}
		<p class="rounded-none border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
	{/if}

	{#if loading}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else}
		<DataTable {rows} {columns} hrefFor={(r) => `/proteins/${r.id}`} />
	{/if}
</div>

<Dialog bind:open={showCreate} title={tr('proteins_create')} width="max-w-2xl">
	<div class="space-y-3">
		{#if formError}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">{formError}</p>{/if}
		<FormFields fields={FIELDS} bind:values columns={2} />
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showCreate = false)}>{tr('common_cancel')}</Button>
			<Button onclick={create} disabled={saving}>{tr('common_create')}</Button>
		</div>
	</div>
</Dialog>

<svelte:head><title>{tr('nav_proteins')} · SPD</title></svelte:head>
