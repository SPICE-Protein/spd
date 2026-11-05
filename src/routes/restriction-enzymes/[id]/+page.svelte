<script lang="ts">
	import { page } from '$app/state';
	import { restrictionEnzymes } from '$lib/api/client';
	import type { RestrictionEnzymeDetail, SupplierInput } from '$lib/api/types';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import EntityBreadcrumb from '$lib/components/EntityBreadcrumb.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import RelationsPanel from '$lib/components/RelationsPanel.svelte';
	import ProteinLinkPanel from '$lib/components/ProteinLinkPanel.svelte';
	import SupplierPanel from '$lib/components/SupplierPanel.svelte';

	/**
	 * Restriction enzyme page. The cutter's contract is the site and the cut,
	 * so those lead. Everything else — modification behaviour, the supply
	 * shelf, provenance and the surrounding records — is a separate module
	 * behind a disclosure so the first screen answers the one question a
	 * reader arrives with.
	 *
	 * Only SPD public ids are shown. Upstream catalog/accession identifiers
	 * (REBASE, UniProt, PDB, …) live in the record's metadata but are never
	 * surfaced here; the metadata bag is read through a whitelist instead of
	 * being dumped.
	 */
	const id = $derived(page.params.id ?? '');

	let row = $state<RestrictionEnzymeDetail | null>(null);
	// Major categories are tabs; the modification details and provenance stay
	// in their own panes instead of lengthening one scroll.
	let tab = $state('overview');
	let suppliers = $state<Record<string, unknown>[]>([]);
	let error = $state('');
	let loading = $state(true);
	// The annotate button in the header opens this module before firing the
	// wiki event, so the panel that listens for it is mounted.
	let relationsOpen = $state(false);

	async function load() {
		loading = true;
		try {
			const r = await restrictionEnzymes.get(id);
			row = r;
			suppliers = Array.isArray(r.suppliers)
				? (r.suppliers as unknown as Record<string, unknown>[])
				: [];
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			row = null;
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		if (id) void load();
	});

	const metadata = $derived(
		row?.metadata && typeof row?.metadata === 'object' && !Array.isArray(row?.metadata)
			? (row?.metadata as Record<string, unknown>)
			: {}
	);

	/** The API's typed row wins; any extra assertion may also live in metadata. */
	function extra(...keys: string[]): unknown {
		if (!row) return null;
		for (const key of keys) {
			const direct = row[key];
			if (direct !== undefined && direct !== null && direct !== '') return direct;
		}
		for (const key of keys) {
			const nested = metadata[key];
			if (nested !== undefined && nested !== null && nested !== '') return nested;
		}
		return null;
	}

	/**
	 * A metadata value may be an object, so only display its human-facing
	 * label. Keys such as id/accession are deliberately not consulted: the
	 * page never prints an upstream identifier.
	 */
	function elementLabel(v: unknown): string {
		if (!v || typeof v !== 'object' || Array.isArray(v)) return '';
		const o = v as Record<string, unknown>;
		for (const key of [
			'name',
			'enzymeName',
			'label',
			'title',
			'text',
			'value',
			'status',
			'sensitivity',
			'type'
		]) {
			const x = o[key];
			if (typeof x === 'string' && x.trim()) return x.trim();
			if (typeof x === 'number') return String(x);
		}
		return '';
	}

	function scalarText(v: unknown): string {
		if (v == null) return '';
		if (typeof v === 'string') return v.trim();
		if (typeof v === 'number' || typeof v === 'bigint') return String(v);
		if (typeof v === 'boolean') return v ? '✓' : '✗';
		if (typeof v === 'object') return elementLabel(v);
		return String(v);
	}

	/** Arrays are names; a comma/semicolon string is the legacy spelling. */
	function nameList(v: unknown): string[] {
		if (v == null) return [];
		const parts: unknown[] = Array.isArray(v)
			? v
			: typeof v === 'string'
				? v.split(/[,;]\s*/)
				: [v];
		return parts.map(scalarText).filter((s) => s !== '');
	}

	function valueText(v: unknown): string {
		return Array.isArray(v) ? nameList(v).join(', ') : scalarText(v);
	}

	function timeText(v: unknown): string {
		if (v == null || v === '') return '';
		const n = Number(v);
		return Number.isFinite(n) ? fmtTime(n) : '';
	}

	const isoschizomers = $derived(
		nameList(extra('isoschizomers', 'isoschizomerNames', 'isoschizomer'))
	);
	const overhang = $derived(valueText(extra('overhang', 'overhangType', 'endType')));
	const methylation = $derived(
		valueText(extra('methylationSensitivity', 'methylation_sensitivity', 'methylation'))
	);
	const rebaseType = $derived(valueText(extra('rebaseType', 'rebase_type')));
	const hasModification = $derived(
		isoschizomers.length > 0 || overhang !== '' || methylation !== '' || rebaseType !== ''
	);

	const sourceValue = $derived(row?.source ? String(row.source).trim() : '');
	const isRebase = $derived(sourceValue.toLowerCase() === 'rebase');
	const sourceLabel = $derived(
		!sourceValue || sourceValue.toLowerCase() === 'community'
			? tr('restriction_page_community')
			: isRebase
				? tr('restriction_page_rebase')
				: enumLabel('enzyme_source', sourceValue)
	);
	const releaseText = $derived(row?.sourceRelease ? String(row.sourceRelease).trim() : '');
	const fetchedText = $derived(timeText(row?.sourceFetchedAt));
	const licenseText = $derived(row?.license ? String(row.license).trim() : '');
	const citationText = $derived(row?.citation ? String(row.citation).trim() : '');
	const createdText = $derived(timeText(row?.createdAt));
</script>

{#if error}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		{error}
	</div>
{:else if loading && !row}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{:else if row}
	<div class="space-y-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				<EntityBreadcrumb
					listHref="/restriction-enzymes"
					listLabel={tr('browse_restriction_enzymes')}
					current={String(row.name ?? '')}
				/>
				<h1 class="mt-1 text-2xl font-bold break-all">{row.name}</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					{#if row.recognitionSite}<code class="font-mono">{row.recognitionSite}</code>{/if}
					{#if row.cutPosition}<code class="font-mono">{row.cutPosition}</code>{/if}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					<code class="font-mono break-all">{row.id}</code>
				</p>
			</div>
			<div class="flex items-center gap-2">
				<PageTools />
				<IssuePanel
					entityType="restriction-enzyme"
					entityId={String(row.id)}
					onannotate={() => (relationsOpen = true)}
				/>
			</div>
		</div>

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'overview', label: tr('tab_overview') },
				{ key: 'suppliers', label: tr('restriction_page_suppliers'), badge: suppliers.length },
				{ key: 'source', label: tr('restriction_page_source') },
				{ key: 'community', label: tr('protein_tab_community') }
			]}
		/>

		{#if tab === 'overview'}
			<Section title={tr('restriction_page_site')}>
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
					<dt class="text-muted-foreground">{tr('f_recognitionSite')}</dt>
					<dd><code class="font-mono text-xs">{row.recognitionSite || '—'}</code></dd>
					<dt class="text-muted-foreground">{tr('f_cutPosition')}</dt>
					<dd><code class="font-mono text-xs">{row.cutPosition || '—'}</code></dd>
					<dt class="text-muted-foreground">{tr('f_enzymeType')}</dt>
					<dd>{row.enzymeType ? enumLabel('ret', row.enzymeType) : '—'}</dd>
					<dt class="text-muted-foreground">{tr('f_targetMolecule')}</dt>
					<dd>{row.targetMolecule ? enumLabel('tm', row.targetMolecule) : '—'}</dd>
				</dl>
			</Section>

			{#if hasModification}
				<Section title={tr('restriction_page_modification')} collapsible>
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
						{#if overhang}
							<dt class="text-muted-foreground">{tr('f_overhang')}</dt>
							<dd class="whitespace-pre-line break-words">{overhang}</dd>
						{/if}
						{#if methylation}
							<dt class="text-muted-foreground">{tr('f_methylationSensitivity')}</dt>
							<dd class="whitespace-pre-line break-words">{methylation}</dd>
						{/if}
						{#if isoschizomers.length}
							<dt class="text-muted-foreground">{tr('f_isoschizomers')}</dt>
							<dd class="break-words">{isoschizomers.join(' · ')}</dd>
						{/if}
						{#if rebaseType}
							<dt class="text-muted-foreground">{tr('restriction_page_rebase_type')}</dt>
							<dd class="whitespace-pre-line break-words">{rebaseType}</dd>
						{/if}
					</dl>
				</Section>
			{/if}
		{:else if tab === 'suppliers'}
			<Section title={tr('restriction_page_suppliers')}>
				<SupplierPanel
					{suppliers}
					add={(b: SupplierInput) => restrictionEnzymes.suppliers(id).add(b)}
					remove={(sid: string) => restrictionEnzymes.suppliers(id).remove(sid)}
					onchanged={load}
				/>
			</Section>
		{:else if tab === 'source'}
			<Section title={tr('restriction_page_source')}>
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
					<dt class="text-muted-foreground">{tr('f_source')}</dt>
					<dd>{sourceLabel}</dd>
					{#if releaseText}
						<dt class="text-muted-foreground">{tr('enzyme_source_release')}</dt>
						<dd>{releaseText}</dd>
					{/if}
					{#if fetchedText}
						<dt class="text-muted-foreground">{tr('enzyme_source_fetched')}</dt>
						<dd>{fetchedText}</dd>
					{/if}
					{#if licenseText}
						<dt class="text-muted-foreground">{tr('enzyme_source_license')}</dt>
						<dd>{licenseText}</dd>
					{/if}
					{#if citationText}
						<dt class="text-muted-foreground">{tr('enzyme_source_citation')}</dt>
						<dd class="whitespace-pre-line break-words">{citationText}</dd>
					{/if}
					{#if createdText}
						<dt class="text-muted-foreground">{tr('f_createdAt')}</dt>
						<dd>{createdText}</dd>
					{/if}
				</dl>
			</Section>
		{:else}
			<Section title={tr('restriction_page_relations')} bind:open={relationsOpen}>
				<div class="grid gap-4 lg:grid-cols-2">
					<ProteinLinkPanel
						current={typeof row.proteinId === 'string' ? row.proteinId : ''}
						bind={(pid: string) => restrictionEnzymes.linkProtein(id, pid)}
						unbind={() => restrictionEnzymes.unlinkProtein(id)}
						onchanged={load}
					/>
					<RelationsPanel entityType="restriction_enzyme" entityId={String(row.id)} />
					<WikiPanel entityType="restriction_enzyme" entityId={String(row.id)} />
					<ReferencesPanel entityType="restriction_enzyme" entityId={String(row.id)} />
				</div>
			</Section>
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('page_not_found')}</p>
{/if}

<svelte:head><title>{row?.name ?? tr('browse_restriction_enzymes')} · SPD</title></svelte:head>
