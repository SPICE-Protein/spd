<script lang="ts">
	import { page } from '$app/state';
	import { reagents } from '$lib/api/client';
	import type { PubchemSection, ReagentRow } from '$lib/api/types';
	import { tr, fieldLabel, enumLabel } from '$lib/i18n';
	import { displayRecordName } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import EntityBreadcrumb from '$lib/components/EntityBreadcrumb.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import PubchemSections from '$lib/components/PubchemSections.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import SupplierPanel from '$lib/components/SupplierPanel.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import RelationsPanel from '$lib/components/RelationsPanel.svelte';
	import ExternalIdentifiersPanel from '$lib/components/ExternalIdentifiersPanel.svelte';
	import MoleculeViewer from '$lib/components/MoleculeViewer.svelte';

	/**
	 * Reagent page, sectioned after a PubChem compound summary: identity and
	 * computed descriptors first, then the structure strings, the property
	 * tables, and finally the upstream provenance and supplier shelf. Every
	 * section is skipped when the record does not carry it — the page never
	 * prints an empty table to fill a layout.
	 */
	const id = $derived(page.params.id ?? '');

	interface PropRow {
		name: string;
		value: string;
		unit: string;
	}
	interface StructureRow {
		key: string;
		label: string;
		value: string;
	}
	interface IdentifierRow {
		label: string;
		value: string;
		url: string;
	}
	interface SummaryRow {
		key: string;
		value: string;
	}

	let row = $state<ReagentRow | null>(null);
	const displayName = $derived(displayRecordName(row?.name));
	let suppliers = $state<Record<string, unknown>[]>([]);
	let error = $state('');
	let loading = $state(true);

	async function load() {
		loading = true;
		try {
			const r = await reagents.get(id);
			row = r;
			suppliers = Array.isArray(r.suppliers) ? (r.suppliers as Record<string, unknown>[]) : [];
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			row = null;
			suppliers = [];
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		if (id) void load();
		else loading = false;
	});

	const attributes = $derived.by((): Record<string, unknown> => {
		const a = row?.attributes;
		return a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, unknown>) : {};
	});

	const description = $derived(String(row?.description ?? '').trim());

	const licenseText = $derived.by(() => {
		for (const k of ['license', 'licence', 'License', 'Licence']) {
			const v = attributes[k];
			if (typeof v === 'string' && v.trim()) return v.trim();
			if (v && typeof v === 'object') {
				const inner = (v as Record<string, unknown>).id;
				if (typeof inner === 'string' && inner.trim()) return inner.trim();
			}
		}
		return '';
	});
	const publicDomain = $derived(
		/public[\s_-]*domain/i.test(licenseText) ||
			['publicDomain', 'isPublicDomain', 'public_domain'].some((k) => attributes[k] === true)
	);

	const summaryRows = $derived.by((): SummaryRow[] => {
		const r = row;
		if (!r) return [];
		const entries: Array<[string, string]> = [
			['iupacName', r.iupacName ? String(r.iupacName) : ''],
			['molecularFormula', r.molecularFormula ? String(r.molecularFormula) : ''],
			['molecularWeight', r.molecularWeight == null ? '' : `${r.molecularWeight} g/mol`],
			['exactMass', r.exactMass == null ? '' : `${r.exactMass} Da`],
			['monoisotopicMass', r.monoisotopicMass == null ? '' : `${r.monoisotopicMass} Da`],
			['charge', r.charge == null ? '' : String(r.charge)],
			['casNumber', r.casNumber ? String(r.casNumber) : ''],
			['xlogp', r.xlogp == null ? '' : String(r.xlogp)],
			['tpsa', r.tpsa == null ? '' : `${r.tpsa} Å²`],
			['hBondDonorCount', r.hBondDonorCount == null ? '' : String(r.hBondDonorCount)],
			['hBondAcceptorCount', r.hBondAcceptorCount == null ? '' : String(r.hBondAcceptorCount)],
			['rotatableBondCount', r.rotatableBondCount == null ? '' : String(r.rotatableBondCount)],
			['heavyAtomCount', r.heavyAtomCount == null ? '' : String(r.heavyAtomCount)],
			['complexity', r.complexity == null ? '' : String(r.complexity)]
		];
		return entries.filter(([, v]) => v !== '').map(([key, value]) => ({ key, value }));
	});

	const structureRows = $derived.by((): StructureRow[] => {
		const r = row;
		if (!r) return [];
		const entries: Array<[string, string]> = [
			['smiles', r.smiles ? String(r.smiles) : ''],
			['isomericSmiles', r.isomericSmiles ? String(r.isomericSmiles) : ''],
			['inchi', r.inchi ? String(r.inchi) : ''],
			['inchiKey', r.inchiKey ? String(r.inchiKey) : '']
		];
		return entries
			.filter(([, v]) => v.trim() !== '')
			.map(([key, value]) => ({ key, label: fieldLabel(key), value }));
	});

	// PubChem often ships a property list; when it does not, the descriptor
	// block is the same numbers already asserted on the row.
	const computedRows = $derived.by((): PropRow[] => {
		const r = row;
		if (!r) return [];
		const raw = r.computedProperties;
		const list = Array.isArray(raw) ? raw : [];
		const rows = list
			.filter((p) => p && (p.name != null || p.value != null))
			.map((p) => ({
				name: String(p.name ?? ''),
				value: String(p.value ?? ''),
				unit: String(p.unit ?? '')
			}));
		if (rows.length) return rows;
		const entries: Array<[string, string, string]> = [
			['molecularFormula', r.molecularFormula ? String(r.molecularFormula) : '', ''],
			['molecularWeight', r.molecularWeight == null ? '' : String(r.molecularWeight), 'g/mol'],
			['exactMass', r.exactMass == null ? '' : String(r.exactMass), 'Da'],
			['monoisotopicMass', r.monoisotopicMass == null ? '' : String(r.monoisotopicMass), 'Da'],
			['xlogp', r.xlogp == null ? '' : String(r.xlogp), ''],
			['tpsa', r.tpsa == null ? '' : String(r.tpsa), 'Å²'],
			['hBondDonorCount', r.hBondDonorCount == null ? '' : String(r.hBondDonorCount), ''],
			['hBondAcceptorCount', r.hBondAcceptorCount == null ? '' : String(r.hBondAcceptorCount), ''],
			['rotatableBondCount', r.rotatableBondCount == null ? '' : String(r.rotatableBondCount), ''],
			['heavyAtomCount', r.heavyAtomCount == null ? '' : String(r.heavyAtomCount), ''],
			['complexity', r.complexity == null ? '' : String(r.complexity), '']
		];
		return entries
			.filter(([, v]) => v !== '')
			.map(([key, value, unit]) => ({ name: fieldLabel(key), value, unit }));
	});

	const experimentalRows = $derived.by((): PropRow[] => {
		const raw = row?.experimentalProperties;
		const list = Array.isArray(raw) ? raw : [];
		return list
			.filter((p) => p && (p.name != null || p.value != null))
			.map((p) => ({
				name: String(p.name ?? ''),
				value: String(p.value ?? ''),
				unit: String(p.unit ?? '')
			}));
	});

	const identifierRows = $derived.by((): IdentifierRow[] => {
		const raw = row?.identifiers;
		const list = Array.isArray(raw) ? raw : [];
		return list
			.filter((i) => i && (i.label || i.value))
			.map((i) => ({
				label: String(i.label ?? ''),
				value: String(i.value ?? ''),
				url: i.url ? String(i.url) : ''
			}));
	});

	// Older/manual reagent rows may carry only the typed CAS column, without
	// PubChem's identifier list. Surface it in the same registry table so the
	// CAS is never invisible just because the source used the compact shape.
	const registryRows = $derived.by((): IdentifierRow[] => {
		const rows = [...identifierRows];
		const cas = String(row?.casNumber ?? '').trim();
		const casShown = rows.some(
			(i) => /^cas$/i.test(i.label.trim()) || i.value.split(';').some((v) => v.trim() === cas)
		);
		if (cas && !casShown) {
			rows.unshift({
				label: 'CAS',
				value: cas,
				url: `https://commonchemistry.cas.org/detail?cas_rn=${encodeURIComponent(cas)}`
			});
		}
		return rows;
	});

	const synonyms = $derived.by((): string[] => {
		const raw = row?.synonyms;
		const list = Array.isArray(raw) ? raw : [];
		return list.map((s) => String(s)).filter((s) => s.trim() !== '');
	});
	const synonymCap = 60;
	const visibleSynonyms = $derived(synonyms.slice(0, synonymCap));
	const hiddenSynonyms = $derived(synonyms.slice(synonymCap));

	const chemicalClasses = $derived.by((): string[] => {
		const raw = row?.chemicalClasses;
		const list = Array.isArray(raw) ? raw : [];
		return list.map((c) => String(c)).filter((c) => c.trim() !== '');
	});

	const structureSmiles = $derived(String(row?.isomericSmiles ?? row?.smiles ?? '').trim());

	// PubChem's top-level record sections are grouped into the same major
	// categories a reader uses on the source page. A category with no data
	// never becomes a tab.
	const pubchemSections = $derived(
		(Array.isArray(row?.pubchemSections) ? row.pubchemSections : []).filter(
			(section) => section && section.heading
		)
	);
	function takeSections(headings: string[]): PubchemSection[] {
		return headings.flatMap((heading) =>
			pubchemSections.filter((section) => section.heading === heading)
		);
	}
	const safetySections = $derived(
		takeSections([
			'Primary Hazards',
			'Safety and Hazards',
			'Toxicity',
			'Associated Disorders and Diseases'
		])
	);
	const pharmacologySections = $derived(
		takeSections([
			'Drug and Medication Information',
			'Pharmacology and Biochemistry',
			'Food Additives and Ingredients',
			'Use and Manufacturing'
		])
	);
	const spectraSections = $derived(takeSections(['Spectral Information']));
	const literatureSections = $derived(takeSections(['Literature', 'Patents']));
	const interactionSections = $derived(
		takeSections([
			'Interactions and Pathways',
			'Biological Test Results',
			'Taxonomy',
			'Classification'
		])
	);
	const relatedSections = $derived(
		takeSections(['Structures', 'Related Records', 'Chemical Vendors', 'Identification'])
	);

	let tab = $state('overview');
	const tabItems = $derived.by(() => {
		const items: Array<{ key: string; label: string; badge?: number }> = [
			{ key: 'overview', label: tr('tab_overview') }
		];
		if (registryRows.length) {
			items.push({ key: 'identifiers', label: tr('tab_identifiers'), badge: registryRows.length });
		}
		if (computedRows.length || experimentalRows.length) {
			items.push({ key: 'properties', label: tr('tab_properties') });
		}
		if (safetySections.length) items.push({ key: 'safety', label: tr('tab_safety') });
		if (pharmacologySections.length) {
			items.push({ key: 'pharmacology', label: tr('tab_pharmacology') });
		}
		if (spectraSections.length) items.push({ key: 'spectra', label: tr('tab_spectra') });
		if (literatureSections.length) {
			items.push({ key: 'literature', label: tr('tab_literature') });
		}
		if (interactionSections.length) {
			items.push({ key: 'interactions', label: tr('tab_interactions') });
		}
		if (relatedSections.length) items.push({ key: 'related', label: tr('tab_related') });
		items.push({ key: 'community', label: tr('tab_community') });
		return items;
	});
	$effect(() => {
		if (tabItems.length && !tabItems.some((item) => item.key === tab)) tab = 'overview';
	});
	const hasSource = $derived(
		Boolean(
			row?.pubchemCid ||
			row?.catalogIdentifier ||
			row?.upstreamCreated ||
			row?.upstreamUpdated ||
			licenseText ||
			publicDomain
		)
	);

	let copiedKey = $state('');
	async function copyText(key: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedKey = key;
			toastOk(tr('common_copied'));
			setTimeout(() => {
				if (copiedKey === key) copiedKey = '';
			}, 1600);
		} catch {
			/* clipboard unavailable — the text is still selectable */
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
	<div class="space-y-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				<EntityBreadcrumb
					listHref="/reagents"
					listLabel={tr('browse_reagents')}
					current={displayName}
				/>
				<h1 class="mt-1 text-2xl font-bold break-all">{displayName}</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<code class="font-mono text-xs">{row.id}</code>
					{#if row.reagentType}
						<Badge tone="muted">{enumLabel('reagent_type', String(row.reagentType))}</Badge>
					{/if}
				</div>
			</div>
			<div class="flex flex-wrap items-center justify-end gap-2">
				<PageTools />
				<IssuePanel entityType="reagent" entityId={String(row.id)} />
			</div>
		</div>

		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
			<Button
				variant="outline"
				class="h-auto flex-col items-start gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'overview')}
			>
				<span class="text-sm font-semibold">{row.molecularFormula ?? '—'}</span>
				<span class="text-[10px] text-muted-foreground">{fieldLabel('molecularFormula')}</span>
			</Button>
			<Button
				variant="outline"
				class="h-auto flex-col items-start gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'properties')}
			>
				<span class="text-sm font-semibold tabular-nums"
					>{row.molecularWeight == null ? '—' : `${row.molecularWeight} g/mol`}</span
				>
				<span class="text-[10px] text-muted-foreground">{fieldLabel('molecularWeight')}</span>
			</Button>
			<Button
				variant="outline"
				class="h-auto flex-col items-start gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'safety')}
			>
				<span class="text-sm font-semibold tabular-nums">{safetySections.length || '—'}</span>
				<span class="text-[10px] text-muted-foreground">{tr('tab_safety')}</span>
			</Button>
			<Button
				variant="outline"
				class="h-auto flex-col items-start gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'literature')}
			>
				<span class="text-sm font-semibold tabular-nums">{literatureSections.length || '—'}</span>
				<span class="text-[10px] text-muted-foreground">{tr('tab_literature')}</span>
			</Button>
		</div>

		<Tabs bind:active={tab} items={tabItems} />

		{#if tab === 'overview'}
			{#if description || summaryRows.length}
				<Section title={tr('f_summary')}>
					{#if description}
						<p class="mb-3 text-sm leading-6">{description}</p>
					{/if}
					{#if summaryRows.length}
						<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
							{#each summaryRows as f (f.key)}
								<dt class="text-muted-foreground">{fieldLabel(f.key)}</dt>
								<dd class="break-all">{f.value}</dd>
							{/each}
						</dl>
					{/if}
				</Section>
			{/if}

			{#if structureRows.length}
				<Section title={tr('reagent_structure')}>
					{#if structureSmiles}
						<MoleculeViewer smiles={structureSmiles} height="320px" />
					{/if}
					<div class="mt-3 space-y-3">
						{#each structureRows as s (s.key)}
							<div class="space-y-1">
								<div class="flex items-center justify-between gap-2">
									<span class="text-xs font-semibold text-muted-foreground">{s.label}</span>
									<Button size="xs" variant="ghost" onclick={() => copyText(s.key, s.value)}>
										{copiedKey === s.key ? tr('common_copied') : tr('common_copy')}
									</Button>
								</div>
								<pre
									class="overflow-x-auto rounded-none border bg-muted/30 p-2 font-mono text-xs break-all whitespace-pre-wrap">{s.value}</pre>
							</div>
						{/each}
					</div>
				</Section>
			{/if}

			<RelationsPanel entityType="reagent" entityId={String(row.id)} />

			{#if synonyms.length || chemicalClasses.length}
				<div class="grid gap-4 lg:grid-cols-2">
					{#if synonyms.length}
						<Section title={`${tr('f_synonyms')} · ${synonyms.length}`} collapsible>
							<div class="flex flex-wrap gap-1.5">
								{#each visibleSynonyms as s, i (`${s}-${i}`)}
									<Badge tone="muted" class="max-w-full whitespace-normal break-all">{s}</Badge>
								{/each}
							</div>
							{#if hiddenSynonyms.length}
								<details class="mt-2">
									<summary class="cursor-pointer text-xs text-muted-foreground">
										{tr('reagent_synonyms_show_all')} · {synonyms.length}
									</summary>
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each hiddenSynonyms as s, i (`${s}-${i}`)}
											<Badge tone="muted" class="max-w-full whitespace-normal break-all">{s}</Badge>
										{/each}
									</div>
								</details>
							{/if}
						</Section>
					{/if}
					{#if chemicalClasses.length}
						<Section title={tr('f_chemicalClasses')} collapsible>
							<p class="break-words">{chemicalClasses.join(' · ')}</p>
						</Section>
					{/if}
				</div>
			{/if}

			<Section title={tr('f_source')} collapsible>
				<ExternalIdentifiersPanel embedded entityType="reagent" entityId={String(row.id)} />
				{#if hasSource}
					<div class="mt-4 border-t pt-3">
						<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
							{#if row.pubchemCid}
								<dt class="text-muted-foreground">{fieldLabel('pubchemCid')}</dt>
								<dd class="font-mono text-xs">CID {row.pubchemCid}</dd>
							{/if}
							{#if row.catalogIdentifier}
								<dt class="text-muted-foreground">{fieldLabel('catalogIdentifier')}</dt>
								<dd class="font-mono text-xs">{String(row.catalogIdentifier)}</dd>
							{/if}
							{#if row.upstreamCreated}
								<dt class="text-muted-foreground">{fieldLabel('upstreamCreated')}</dt>
								<dd>{String(row.upstreamCreated)}</dd>
							{/if}
							{#if row.upstreamUpdated}
								<dt class="text-muted-foreground">{fieldLabel('upstreamUpdated')}</dt>
								<dd>{String(row.upstreamUpdated)}</dd>
							{/if}
							{#if licenseText}
								<dt class="text-muted-foreground">{tr('f_license')}</dt>
								<dd>{licenseText}</dd>
							{/if}
							{#if publicDomain}
								<dt class="text-muted-foreground">{tr('f_publicDomain')}</dt>
								<dd>{tr('common_yes')}</dd>
							{/if}
						</dl>
					</div>
				{/if}
			</Section>
		{:else if tab === 'identifiers'}
			<Section title={tr('tab_identifiers')}>
				<p class="mb-3 text-xs text-muted-foreground">{tr('reagent_identifiers_hint')}</p>
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b text-left text-xs text-muted-foreground">
								<th class="py-1.5 pr-3 font-medium">{tr('f_label')}</th>
								<th class="py-1.5 pr-3 font-medium">{tr('f_value')}</th>
							</tr>
						</thead>
						<tbody>
							{#each registryRows as i, index (`${i.label}-${index}`)}
								<tr class="border-b/60 border-b last:border-0">
									<td class="py-1.5 pr-3 text-muted-foreground">{i.label || '—'}</td>
									<td class="py-1.5 pr-3 break-all">
										{#if i.url}
											<a
												class="font-mono text-xs underline"
												href={i.url}
												target="_blank"
												rel="noopener"
											>
												{i.value || i.url}
											</a>
										{:else}
											<span class="font-mono text-xs">{i.value || '—'}</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Section>
		{:else if tab === 'properties'}
			<div class="grid gap-4 lg:grid-cols-2">
				{#if computedRows.length}
					<Section title={tr('f_computedProperties')}>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b text-left text-xs text-muted-foreground">
										<th class="py-1.5 pr-3 font-medium">{tr('f_name')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('f_value')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('f_unit')}</th>
									</tr>
								</thead>
								<tbody>
									{#each computedRows as p, index (`${p.name}-${index}`)}
										<tr class="border-b/60 border-b last:border-0">
											<td class="py-1.5 pr-3">{p.name || '—'}</td>
											<td class="py-1.5 pr-3 font-mono text-xs tabular-nums">{p.value || '—'}</td>
											<td class="py-1.5 pr-3 text-muted-foreground">{p.unit || '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Section>
				{/if}
				{#if experimentalRows.length}
					<Section title={tr('f_experimentalProperties')}>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b text-left text-xs text-muted-foreground">
										<th class="py-1.5 pr-3 font-medium">{tr('f_name')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('f_value')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('f_unit')}</th>
									</tr>
								</thead>
								<tbody>
									{#each experimentalRows as p, index (`${p.name}-${index}`)}
										<tr class="border-b/60 border-b last:border-0">
											<td class="py-1.5 pr-3">{p.name || '—'}</td>
											<td class="py-1.5 pr-3 font-mono text-xs tabular-nums">{p.value || '—'}</td>
											<td class="py-1.5 pr-3 text-muted-foreground">{p.unit || '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Section>
				{/if}
			</div>
		{:else if tab === 'safety'}
			<PubchemSections sections={safetySections} emptyText={tr('catalog_empty_tab')} />
		{:else if tab === 'pharmacology'}
			<PubchemSections sections={pharmacologySections} emptyText={tr('catalog_empty_tab')} />
		{:else if tab === 'spectra'}
			<PubchemSections sections={spectraSections} emptyText={tr('catalog_empty_tab')} />
		{:else if tab === 'literature'}
			<PubchemSections sections={literatureSections} emptyText={tr('catalog_empty_tab')} />
		{:else if tab === 'interactions'}
			<PubchemSections sections={interactionSections} emptyText={tr('catalog_empty_tab')} />
		{:else if tab === 'related'}
			<PubchemSections sections={relatedSections} emptyText={tr('catalog_empty_tab')} />
		{:else if tab === 'community'}
			<SupplierPanel
				{suppliers}
				add={(b) => reagents.suppliers(id).add(b)}
				remove={(sid) => reagents.suppliers(id).remove(sid)}
				onchanged={load}
			/>
			<div class="grid gap-4 lg:grid-cols-2">
				<WikiPanel entityType="reagent" entityId={String(row.id)} collapsible />
				<ReferencesPanel entityType="reagent" entityId={String(row.id)} collapsible />
			</div>
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('page_not_found')}</p>
{/if}

<svelte:head><title>{displayName || tr('browse_reagents')} · SPD</title></svelte:head>
