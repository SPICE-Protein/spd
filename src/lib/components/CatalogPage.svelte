<script lang="ts">
	import { firstArray } from '$lib/api/client';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import { displayRecordName, fmtTime } from '$lib/format';
	import DataTable from './DataTable.svelte';
	import type { Column } from './table';
	import Button from './Button.svelte';
	import PageTools from './PageTools.svelte';
	import Dialog from './Dialog.svelte';
	import FormFields from './FormFields.svelte';
	import SaveViewButton from './SaveViewButton.svelte';
	import type { FormField } from './form';
	import { buildSafe } from './form-values';
	import { market } from '$lib/state/market.svelte';
	import { downloadText } from '$lib/export/download';
	import { SvelteSet } from 'svelte/reactivity';

	export interface CatalogPageConfig {
		title: string;
		list: () => Promise<unknown>;
		/** visible scalar columns of the list table (first one links to the detail page) */
		columns: Array<{
			key: string;
			label?: string;
			/** overrides the default cell text; CSV export still uses the raw value */
			format?: (row: Record<string, unknown>) => string;
		}>;
		/** public/internal id extractor */
		idOf?: (row: Record<string, unknown>) => string;
		route: string;
		/** entity type used when a row is added to the Market; derived from `route` when omitted */
		entityType?: string;
		create?: (body: Record<string, unknown>) => Promise<unknown>;
		createFields?: FormField[];
		/** extra toolbar button (e.g. export bundle) */
		toolbar?: Array<{ label: string; run: () => Promise<void> }>;
		/** Shown under an empty table; usually a pointer to the federated source. */
		emptyHint?: { text: string; href: string; label: string };
	}

	let { config }: { config: CatalogPageConfig } = $props();

	let rows = $state<Record<string, unknown>[]>([]);
	let loading = $state(true);
	let error = $state('');
	const selected = new SvelteSet<string>();

	async function load() {
		loading = true;
		error = '';
		try {
			const data = await config.list();
			rows = firstArray<Record<string, unknown>>(data, 'items');
			selected.clear();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
	$effect(() => void load());

	const idOf = $derived(config.idOf ?? ((r) => String(r.id ?? '')));

	/** `media-recipes` → `media_recipe`; the Market keys entries by singular type. */
	function entityTypeOf(route: string): string {
		const underscored = route.replace(/-/g, '_').toLowerCase();
		if (underscored.endsWith('ies')) return `${underscored.slice(0, -3)}y`;
		if (/(?:ches|shes|sses|xes|zes|ses)$/.test(underscored)) return underscored.slice(0, -2);
		if (underscored.endsWith('s')) return underscored.slice(0, -1);
		return underscored;
	}
	const entityType = $derived(config.entityType ?? entityTypeOf(config.route));

	/**
	 * The cell's raw value, including the `payload` fallbacks community rows
	 * rely on. Shared by the table formatter and the exports so a downloaded
	 * file says what the screen says.
	 */
	function valueOf(r: Record<string, unknown>, key: string): unknown {
		// Community records live in api_records: the row's meaning is inside
		// `payload`, so a list of bare public ids and a repeated entityType
		// tells a contributor nothing. `target` and `headline` read through.
		const payload =
			r.payload && typeof r.payload === 'object' ? (r.payload as Record<string, unknown>) : null;
		// Two filing paths, two payload shapes: the list dialog posts the body
		// flat, the record-page door posts to /entities/{id}/corrections, which
		// wraps it as { entityId, event: {…} }. Read both, or half the rows show
		// an em dash for something the contributor typed.
		const event =
			payload?.event && typeof payload.event === 'object'
				? (payload.event as Record<string, unknown>)
				: null;
		let v: unknown = r[key];
		if (v == null && payload) {
			if (key === 'target') v = payload.targetId ?? payload.entityId ?? null;
			else if (key === 'headline')
				v =
					payload.reason ??
					payload.summary ??
					payload.case ??
					payload.title ??
					payload.name ??
					event?.reason ??
					event?.summary ??
					event?.proposedFix ??
					null;
			else if (key === 'validationStatus' && payload.validation) {
				// A construct stores its assembly verdict under `validation`;
				// the column asks for a flat status, so summarise it here.
				const validation = payload.validation as Record<string, unknown>;
				v =
					validation.implemented === false
						? 'not_implemented'
						: validation.valid === true
							? 'valid'
							: validation.valid === false
								? 'invalid'
								: null;
			} else v = payload[key] ?? null;
		}
		return v;
	}

	const columns = $derived<Column<Record<string, unknown>>[]>(
		config.columns.map((c) => ({
			key: c.key,
			label: c.label,
			format: (r) => {
				if (c.format) return c.format(r);
				const v = valueOf(r, c.key);
				if (v == null) return '—';
				if (c.key === 'status' && typeof v === 'string') return enumLabel('st', v);
				if (c.key.endsWith('At') && typeof v === 'number') return fmtTime(v);
				if (typeof v === 'boolean') return v ? tr('common_yes') : tr('common_no');
				if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) {
					// Measurements store `{value, unit}`; a bare "—" hides the
					// number that makes the row worth listing.
					const o = v as Record<string, unknown>;
					const unit = typeof o.unit === 'string' && o.unit ? ` ${o.unit}` : '';
					if (o.value != null) return `${o.value}${unit}`;
				}
				if (typeof v === 'object') return Array.isArray(v) ? String(v.length) : '—';
				const text =
					c.key === 'name'
						? displayRecordName(String(v), typeof r.symbol === 'string' ? r.symbol : null)
						: String(v);
				return text.length > 72 ? `${text.slice(0, 72)}…` : text;
			}
		}))
	);

	const selectedRows = $derived(rows.filter((r) => selected.has(idOf(r))));

	function toggleRow(key: string) {
		if (selected.has(key)) selected.delete(key);
		else selected.add(key);
	}

	function toggleAll(keys: string[]) {
		selected.clear();
		for (const key of keys) selected.add(key);
	}

	function clearSelection() {
		selected.clear();
	}

	/** Project a row onto the visible columns; objects stay machine-readable. */
	function project(r: Record<string, unknown>): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		for (const c of config.columns) {
			const v = valueOf(r, c.key);
			out[c.key] = v == null ? '' : v;
		}
		return out;
	}

	function csvCell(value: unknown): string {
		const text =
			value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
		// RFC 4180: quote delimiters, quotes and newlines; double embedded quotes.
		return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	}

	function toCSV(list: Record<string, unknown>[]): string {
		const header = config.columns.map((c) => c.key);
		const body = list.map((r) => {
			const projected = project(r);
			return header.map((key) => csvCell(projected[key]));
		});
		return [header.map(csvCell), ...body].map((cells) => cells.join(',')).join('\r\n');
	}

	function toJSON(list: Record<string, unknown>[]): string {
		return JSON.stringify(list.map(project), null, 2);
	}

	function exportRows(list: Record<string, unknown>[], suffix: string, format: 'csv' | 'json') {
		if (list.length === 0) return;
		const name = `${config.route}${suffix}.${format}`;
		if (format === 'csv') downloadText(name, toCSV(list), 'text/csv;charset=utf-8');
		else downloadText(name, toJSON(list), 'application/json;charset=utf-8');
	}

	function exportSelected(format: 'csv' | 'json') {
		exportRows(selectedRows, '-selected', format);
	}

	function exportAll(format: 'csv' | 'json') {
		exportRows(rows, '', format);
	}

	function addSelectedToMarket() {
		for (const r of selectedRows) {
			const id = idOf(r);
			const name = r.name ?? r.title ?? r.label ?? id;
			market.add({
				id,
				entityType: entityType,
				name: String(name),
				href: `/${config.route}/${id}`
			});
		}
	}

	let showCreate = $state(false);
	let values = $state<Record<string, string>>({ license: 'CC-BY-4.0' });
	let formError = $state('');
	let saving = $state(false);

	async function create() {
		formError = '';
		if (!config.create) return;
		if (!config.createFields) return;
		const b = buildSafe(values, config.createFields);
		if (b.error || !b.body) return (formError = b.error ?? tr('form_required_missing'));
		const body = b.body;
		saving = true;
		try {
			await config.create(body);
			toastOk(tr('submit_created'));
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
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-2xl font-bold">{config.title}</h1>
		<div class="flex flex-wrap gap-2">
			<PageTools withPrint={false} />
			{#each config.toolbar ?? [] as t (t.label)}
				<Button size="sm" variant="outline" onclick={() => void t.run().catch(toastErr)}
					>{t.label}</Button
				>
			{/each}
			<Button
				size="sm"
				variant="outline"
				disabled={loading || rows.length === 0}
				onclick={() => exportAll('csv')}
			>
				{tr('catalog_export_all')}
			</Button>
			<Button
				size="sm"
				variant="outline"
				disabled={loading || rows.length === 0}
				onclick={() => exportAll('json')}
			>
				{tr('catalog_export_json')}
			</Button>
			<SaveViewButton />
			{#if config.create && session.signedIn}
				<Button size="sm" onclick={() => (showCreate = true)}>{tr('common_create')}</Button>
			{:else if config.create}
				<Button size="sm" variant="outline" onclick={() => session.signIn()}
					>{tr('nav_login')}</Button
				>
			{/if}
		</div>
	</div>

	{#if error}
		<p
			class="rounded-none border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive"
		>
			{error}
		</p>
	{/if}

	{#if loading}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else if !error}
		<!-- The table stays unmounted after a failed load: an empty grid with
		     "no records" next to the error reads as "the catalog is empty". -->

		{#if selected.size > 0}
			<div
				class="flex flex-wrap items-center gap-2 border border-foreground/10 bg-muted/30 px-2.5 py-1.5 text-xs"
			>
				<span class="font-medium">{tr('catalog_selected', { n: selected.size })}</span>
				<Button size="xs" variant="outline" onclick={() => exportSelected('csv')}
					>{tr('catalog_export_selected')}</Button
				>
				<Button size="xs" variant="outline" onclick={() => exportSelected('json')}
					>{tr('catalog_export_json')}</Button
				>
				<Button size="xs" variant="outline" onclick={addSelectedToMarket}
					>{tr('catalog_add_market')}</Button
				>
				<Button size="xs" variant="ghost" onclick={clearSelection}
					>{tr('catalog_clear_selection')}</Button
				>
			</div>
		{/if}
		<DataTable
			{rows}
			{columns}
			hrefFor={(r) => `/${config.route}/${idOf(r)}`}
			selectable
			{selected}
			rowKey={idOf}
			onToggle={toggleRow}
			onToggleAll={toggleAll}
		/>
		{#if rows.length === 0 && config.emptyHint}
			<div class="border border-foreground/10 bg-muted/30 px-3 py-4 text-sm">
				<p class="text-muted-foreground">{config.emptyHint.text}</p>
				<a
					class="mt-2 inline-block font-medium underline underline-offset-2"
					href={config.emptyHint.href}
				>
					{config.emptyHint.label} ↗
				</a>
			</div>
		{/if}
	{/if}
</div>

<Dialog bind:open={showCreate} title={tr('common_create')} width="max-w-2xl">
	<div class="space-y-3">
		{#if formError}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">
				{formError}
			</p>{/if}
		{#if config.createFields}
			<FormFields fields={config.createFields} bind:values columns={2} />
		{/if}
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showCreate = false)}>{tr('common_cancel')}</Button>
			<Button onclick={create} disabled={saving}>{tr('common_create')}</Button>
		</div>
	</div>
</Dialog>

<svelte:head><title>{config.title} · SPD</title></svelte:head>
