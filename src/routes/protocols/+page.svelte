<script lang="ts">
	import { protocols, firstArray } from '$lib/api/client';
	import type { ProtocolRow } from '$lib/api/types';
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
	import { buildSafe } from '$lib/components/form-values';
	import { catalogBy } from '$lib/submit/registry';

	let rows = $state<ProtocolRow[]>([]);
	let loading = $state(true);

	async function load() {
		loading = true;
		try {
			const data = await protocols.list();
			rows = firstArray<ProtocolRow>(data, 'protocols', 'items');
		} catch (e) {
			toastErr(e);
		} finally {
			loading = false;
		}
	}
	void load();

	// fields live in the catalog registry — the /submit/protocols wizard and
	// this dialog must never drift apart
	const FIELDS = catalogBy('protocols')?.fields ?? [];

	let showCreate = $state(false);
	let values = $state<Record<string, string>>({});
	let formError = $state('');
	let saving = $state(false);

	async function create() {
		formError = '';
		const b = buildSafe(values, FIELDS);
		if (b.error || !b.body) return (formError = b.error ?? tr('form_required_missing'));
		saving = true;
		try {
			await protocols.create(b.body);
			toastOk(tr('submit_created'));
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

	const columns: Column<ProtocolRow>[] = [
		{ key: 'id', label: tr('col_id'), format: (r) => r.title ?? String(r.id) },
		{ key: 'status', label: tr('f_status') },
		{
			key: 'published',
			label: tr('protocol_published'),
			format: (r) => (r.published ? tr('common_yes') : tr('common_no'))
		},
		{ key: 'revisionNumber', label: tr('wiki_revision') },
		{
			key: 'updatedAt',
			label: tr('f_updatedAt'),
			format: (r) => fmtTime(r.updatedAt ?? r.createdAt)
		}
	];
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-2xl font-bold">{tr('nav_protocols')}</h1>
		<PageTools withPrint={false} />
		{#if session.signedIn}
			<Button size="sm" onclick={() => (showCreate = true)}>{tr('common_create')}</Button>
		{/if}
	</div>
	{#if loading}<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else}<DataTable {rows} {columns} hrefFor={(r) => `/protocols/${r.id}`} />{/if}
	<p class="text-xs text-muted-foreground">{tr('protocol_publish_note')}</p>
</div>

<Dialog bind:open={showCreate} title={tr('protocol_create')} width="max-w-3xl">
	<div class="space-y-3">
		{#if formError}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">
				{formError}
			</p>{/if}
		<FormFields fields={FIELDS} bind:values />
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showCreate = false)}>{tr('common_cancel')}</Button>
			<Button onclick={create} disabled={saving}>{tr('common_submit')}</Button>
		</div>
	</div>
</Dialog>

<svelte:head><title>{tr('nav_protocols')} · SPD</title></svelte:head>
