<script lang="ts">
	import type { SupplierInput } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, fieldLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from './Section.svelte';
	import EntityBreadcrumb from './EntityBreadcrumb.svelte';
	import Tabs from './Tabs.svelte';
	import Badge from './Badge.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import Button from './Button.svelte';
	import PageTools from './PageTools.svelte';
	import IdLink from './IdLink.svelte';
	import Dialog from './Dialog.svelte';
	import WikiPanel from './WikiPanel.svelte';
	import ReferencesPanel from './ReferencesPanel.svelte';
	import IssuePanel from './IssuePanel.svelte';
	import ProvenancePanel from './ProvenancePanel.svelte';
	import SupplierPanel from './SupplierPanel.svelte';
	import TargetPicker from './TargetPicker.svelte';
	import Input from './Input.svelte';

	// §43: only the closed graph-node set can carry provenance snapshots.
	const SNAPSHOTABLE = new Set([
		'artifact',
		'environment',
		'fold',
		'model',
		'protein',
		'sequence',
		'validation'
	]);

	export interface EntityDetailConfig {
		title: string;
		id: string;
		get: (id: string) => Promise<unknown>;
		/** keys rendered in the scalar header dl (rest goes to JSON blocks) */
		scalarKeys?: string[];
		route?: string;
		entityType?: string;
		deletable?: boolean;
		remove?: (id: string) => Promise<unknown>;
		suppliers?: {
			list?: unknown;
			add: (body: SupplierInput) => Promise<unknown>;
			remove: (supplierId: string) => Promise<unknown>;
		};
		/**
		 * The §54 enzyme→protein binding, managed in its own section instead
		 * of as a bare spd: scalar: a signed-in user may bind, rebind, or
		 * withdraw the assertion through a search picker (nobody pastes ids),
		 * and the server proves the protein exists before accepting the claim.
		 */
		protein?: {
			bind: (id: string, proteinId: string) => Promise<unknown>;
			unbind: (id: string) => Promise<unknown>;
		};
	}

	let { config }: { config: EntityDetailConfig } = $props();

	let row = $state<Record<string, unknown> | null>(null);
	let error = $state('');
	let loading = $state(true);
	let suppliers = $state<Record<string, unknown>[]>([]);
	let tab = $state('overview');

	async function load() {
		loading = true;
		try {
			const r = await config.get(config.id);
			row = (r ?? {}) as Record<string, unknown>;
			error = '';
			suppliers = Array.isArray(row.suppliers) ? (row.suppliers as Record<string, unknown>[]) : [];
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			row = null;
		} finally {
			loading = false;
		}
	}
	$effect(() => void load());

	const scalarKeys = $derived(config.scalarKeys ?? []);
	// a detail page should lead with the few keys that say WHAT the record is;
	// bookkeeping fields (hashes, timestamps) wait behind "more fields"
	const headerKeys = [
		'id',
		'name',
		'title',
		'preferredName',
		'status',
		'license',
		'topology',
		'suppliers',
		'createdBy',
		'entityType'
	];
	const primaryKeys = $derived(scalarKeys.slice(0, 5));
	const secondaryKeys = $derived.by(() => {
		const rest = scalarKeys.slice(5);
		if (!row) return rest;
		// strings the config forgot would otherwise vanish from the page —
		// surface every leftover scalar in "more fields" instead
		const r = row;
		const leftovers = Object.keys(r).filter(
			(k) =>
				!scalarKeys.includes(k) &&
				!headerKeys.includes(k) &&
				(r[k] === null || typeof r[k] !== 'object')
		);
		// proteinId gets a managed section of its own when the catalog opts
		// in - showing it twice (or as a bare id string) would dilute it
		const managed = config.protein ? ['proteinId'] : [];
		return [...rest, ...leftovers].filter((k) => !managed.includes(k));
	});
	const tabItems = $derived([
		{ key: 'overview', label: tr('tab_overview') },
		...(config.suppliers
			? [{ key: 'suppliers', label: tr('supplier_title'), badge: suppliers.length }]
			: []),
		...(config.entityType ? [{ key: 'community', label: tr('protein_tab_community') }] : [])
	]);

	async function removeEntity() {
		if (!config.remove || !row) return;
		if (!confirm(tr('entity_remove_confirm'))) return;
		try {
			await config.remove(config.id);
			toastOk(tr('entity_removed'));
			location.href = `/${config.route ?? ''}`;
		} catch (e) {
			toastErr(e);
		}
	}

	// protein binding (§54): bind/rebind through the search picker, unlink
	// behind a confirm - the assertion is reversible either way
	const currentProtein = $derived(
		config.protein && row && typeof row.proteinId === 'string' && row.proteinId ? row.proteinId : ''
	);
	let showProtein = $state(false);
	let proteinPick = $state('');
	function openProteinDialog() {
		proteinPick = currentProtein;
		showProtein = true;
	}
	async function confirmProteinBind() {
		if (!config.protein || !proteinPick) return;
		try {
			await config.protein.bind(config.id, proteinPick);
			toastOk(tr('protein_link_bound'));
			showProtein = false;
			await load();
		} catch (e) {
			toastErr(e);
		}
	}
	async function removeProteinLink() {
		if (!config.protein || !currentProtein) return;
		if (!confirm(tr('protein_link_unbind_confirm'))) return;
		try {
			await config.protein.unbind(config.id);
			toastOk(tr('protein_link_unbound'));
			await load();
		} catch (e) {
			toastErr(e);
		}
	}
</script>

{#if loading}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{:else if error}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		{error}
	</div>
{:else if row}
	{#snippet human(v: unknown, k: string)}
		{#if v === null || v === undefined || v === ''}<span class="text-muted-foreground">—</span>
		{:else if typeof v === 'boolean'}{v ? '✓' : '✗'}
		{:else if k.endsWith('At') && typeof v === 'number'}{fmtTime(v)}
		{:else if typeof v === 'string' && v.startsWith('spd:')}<IdLink id={v} />
		{:else if typeof v === 'string'}<span class="whitespace-pre-line break-words">{v}</span>
		{:else}<span class="tabular-nums break-words">{String(v)}</span>{/if}
	{/snippet}
	{#snippet fields(ks: string[])}
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
			{#each ks as k (k)}
				<dt class="text-muted-foreground">{fieldLabel(k)}</dt>
				<dd class="min-w-0 break-all">{@render human(row?.[k], k)}</dd>
			{/each}
		</dl>
	{/snippet}
	<div class="space-y-4">
		<div class="flex flex-wrap items-start justify-between gap-2">
			<div>
				{#if config.route}
					<EntityBreadcrumb
						listHref={`/${config.route}`}
						listLabel={config.title}
						current={String(row.name ?? row.title ?? row.preferredName ?? config.title)}
					/>
				{/if}
				<h1
					class={config.route ? 'mt-1 text-xl font-bold break-all' : 'text-xl font-bold break-all'}
				>
					{String(row.name ?? row.title ?? row.preferredName ?? config.title)}
				</h1>
				<p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<code class="font-mono break-all">{String(row.id ?? config.id)}</code>
					{#if row.status}<StatusBadge status={String(row.status)} ns="st" />{/if}
					{#if row.license}<span>{String(row.license)}</span>{/if}
					{#if row.topology}<span>{String(row.topology)}</span>{/if}
				</p>
			</div>
			<div class="flex flex-wrap items-center justify-end gap-2">
				<PageTools />
				{#if config.entityType}
					<IssuePanel entityType={config.entityType} entityId={String(row.id ?? config.id)} />
				{/if}
				{#if config.deletable && session.signedIn}
					<Button size="sm" variant="danger" onclick={removeEntity}>{tr('common_delete')}</Button>
				{/if}
			</div>
		</div>

		{#if tabItems.length > 1}
			<Tabs bind:active={tab} items={tabItems} />
		{/if}

		{#if tab === 'overview'}
			<Section title={tr('common_details')}>
				{@render fields(primaryKeys)}
				{#if secondaryKeys.length}
					<details class="mt-3">
						<summary class="cursor-pointer text-xs text-muted-foreground"
							>{tr('entity_more_fields')} · {secondaryKeys.length}</summary
						>
						<div class="mt-2">{@render fields(secondaryKeys)}</div>
					</details>
				{/if}
				{#if Array.isArray(row.tags)}
					<p class="mt-2 break-words">{row.tags.map(String).join(' · ')}</p>
				{/if}
			</Section>

			{#if config.protein}
				<Section title={tr('protein_link_title')}>
					<div class="flex flex-wrap items-center gap-2 text-sm">
						{#if currentProtein}
							<IdLink id={currentProtein} />
						{:else}
							<span class="text-muted-foreground">{tr('protein_link_none')}</span>
						{/if}
						{#if session.signedIn}
							{#if currentProtein}
								<Button size="xs" variant="outline" onclick={openProteinDialog}
									>{tr('protein_link_rebind')}</Button
								>
								<Button size="xs" variant="ghost" onclick={removeProteinLink}
									>{tr('protein_link_unbind')}</Button
								>
							{:else}
								<Button size="xs" onclick={openProteinDialog}>{tr('protein_link_bind')}</Button>
							{/if}
						{/if}
					</div>
					<p class="mt-1 text-xs text-muted-foreground">{tr('protein_link_hint')}</p>
				</Section>

				<Dialog
					bind:open={showProtein}
					title={currentProtein ? tr('protein_link_rebind') : tr('protein_link_bind')}
				>
					<div class="space-y-3">
						<p class="text-xs text-muted-foreground">{tr('protein_link_hint')}</p>
						<TargetPicker
							entityType="protein"
							initial={currentProtein ? { id: currentProtein } : undefined}
							onpick={(h) => (proteinPick = h?.id ?? '')}
						/>
						<div class="flex justify-end gap-2">
							<Button variant="ghost" onclick={() => (showProtein = false)}
								>{tr('common_cancel')}</Button
							>
							<Button onclick={confirmProteinBind} disabled={!proteinPick}
								>{tr('common_save')}</Button
							>
						</div>
					</div>
				</Dialog>
			{/if}
		{:else if tab === 'suppliers'}
			{#if config.suppliers}
				<SupplierPanel
					{suppliers}
					add={config.suppliers.add}
					remove={config.suppliers.remove}
					onchanged={load}
					collapsible={false}
				/>
			{/if}
		{:else}
			{#if config.entityType}
				{#if SNAPSHOTABLE.has(config.entityType)}
					<ProvenancePanel
						entityType={config.entityType}
						entityId={String(row.id ?? config.id)}
						collapsible
					/>
				{/if}
				<WikiPanel
					entityType={config.entityType}
					entityId={String(row.id ?? config.id)}
					collapsible
				/>
				<ReferencesPanel
					entityType={config.entityType}
					entityId={String(row.id ?? config.id)}
					collapsible
				/>
			{/if}
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('page_not_found')}</p>
{/if}

<svelte:head><title>{config.title} · SPD</title></svelte:head>
