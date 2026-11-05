<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { cellLines, external } from '$lib/api/client';
	import type { CellLineRow } from '$lib/api/types';
	import { tr, fieldLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import EntityBreadcrumb from '$lib/components/EntityBreadcrumb.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import SupplierPanel from '$lib/components/SupplierPanel.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import RelationsPanel from '$lib/components/RelationsPanel.svelte';
	import ExternalIdentifiersPanel from '$lib/components/ExternalIdentifiersPanel.svelte';

	/**
	 * Cellosaurus-style cell line page: every assertion on the row is quoted
	 * in its own section, and a section with nothing to say stays absent.
	 */
	const id = $derived(page.params.id ?? '');

	let row = $state<CellLineRow | null>(null);
	let suppliers = $state<Record<string, unknown>[]>([]);
	let loading = $state(true);
	let error = $state('');

	let tab = $state('overview');
	let childFilter = $state('');
	let childLimit = $state(40);
	let importingChild = $state('');

	async function load() {
		loading = true;
		try {
			const r = await cellLines.get(id);
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
	});

	/**
	 * A child line is another Cellosaurus record, not a link out. Opening it
	 * goes through SPD's own import door, which returns the local public id
	 * and route for the new or existing SPD record — the accession is only
	 * the upstream address used to ask for it.
	 */
	async function openLine(accession: string | undefined, key: string) {
		if (!accession || importingChild) return;
		importingChild = key;
		try {
			const result = await external.import('cellosaurus', accession);
			await goto(result.route);
		} catch (e) {
			toastErr(e);
		} finally {
			importingChild = '';
		}
	}

	/** One textual value from a string, number, or a labelled object. */
	function text(value: unknown): string {
		if (value == null) return '';
		if (typeof value === 'string') return value.trim();
		if (typeof value === 'number' || typeof value === 'boolean') return String(value);
		if (typeof value === 'object') {
			const o = value as Record<string, unknown>;
			for (const key of ['value', 'label', 'name', 'synonym', 'identifier']) {
				const found = o[key];
				if (typeof found === 'string' && found.trim()) return found.trim();
			}
		}
		return '';
	}

	function strList(value: unknown): string[] {
		return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
	}

	function datetimeText(value: unknown): string {
		if (value == null || value === '') return '';
		if (typeof value === 'number') return fmtTime(value);
		const raw = String(value).trim();
		if (/^\d+$/.test(raw)) return fmtTime(Number(raw));
		return raw;
	}

	const synonyms = $derived(strList(row?.synonyms));
	const diseases = $derived(strList(row?.diseases));
	const derivedSites = $derived.by(() =>
		(row?.derivedFromSite ?? [])
			.map((item) => ({
				siteType: text(item?.siteType),
				value: text(item?.value) || text(item),
				xrefs: Array.isArray(item?.xrefs)
					? item.xrefs
							.map((xref) => ({
								database: text(xref?.database),
								accession: text(xref?.accession)
							}))
							.filter((xref) => xref.database || xref.accession)
					: []
			}))
			.filter((item) => item.siteType || item.value || item.xrefs.length)
	);
	const transformants = $derived.by(() =>
		(row?.transformant ?? [])
			.map((item) => ({
				label: text(item?.label) || text(item),
				database: text(item?.database),
				accession: text(item?.accession)
			}))
			.filter((item) => item.label || item.database || item.accession)
	);
	const children = $derived(
		(row?.children ?? []).filter((child) => child && (child.accession || child.name))
	);
	const filteredChildren = $derived.by(() => {
		const query = childFilter.trim().toLowerCase();
		if (!query) return children;
		return children.filter((child) =>
			[child.name, child.accession].some((value) =>
				String(value ?? '')
					.toLowerCase()
					.includes(query)
			)
		);
	});
	const visibleChildren = $derived(filteredChildren.slice(0, childLimit));
	const references = $derived.by(() =>
		(row?.references ?? [])
			.map((item) => {
				const citation = text(item?.citation) || text(item);
				const referenceId = text(item?.id);
				return {
					id: referenceId,
					citation: citation && citation !== referenceId ? citation : ''
				};
			})
			.filter((item) => item.id || item.citation)
	);

	const omicsGroups = $derived.by(() => {
		const groups = new Map<string, string[]>();
		for (const item of row?.omics ?? []) {
			const value = text(item?.value);
			if (!value) continue;
			const branch = text(item?.branch) || tr('cell_line_uncategorized');
			const bucket = groups.get(branch);
			if (bucket) bucket.push(value);
			else groups.set(branch, [value]);
		}
		return [...groups.entries()].map(([branch, values]) => ({ branch, values }));
	});

	const ancestryRows = $derived.by(() =>
		(row?.genomeAncestry ?? [])
			.map((item) => {
				const population = text(item?.population);
				const percentage = text(item?.percentage);
				const clean = percentage.replace(/[%,\s]/g, '');
				const numeric = clean === '' ? Number.NaN : Number(clean);
				return {
					population,
					percentage,
					pct: Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : null
				};
			})
			.filter((item) => item.population || item.percentage)
	);

	const hlaRows = $derived.by(() =>
		(row?.hlaTyping ?? [])
			.map((item) => ({
				gene: text(item?.gene),
				alleles: text(item?.alleles),
				source: text(item?.source)
			}))
			.filter((item) => item.gene || item.alleles)
	);
	const hlaHasSource = $derived(hlaRows.some((item) => item.source));

	const strRows = $derived.by(() =>
		(row?.strProfile ?? [])
			.map((item) => ({
				marker: text(item?.marker),
				alleles: text(item?.alleles),
				conflict:
					item?.conflict === true ||
					String(item?.conflict ?? '').toLowerCase() === 'true' ||
					String(item?.conflict ?? '').toLowerCase() === 'yes'
			}))
			.filter((item) => item.marker || item.alleles)
	);

	const commentGroups = $derived.by(() => {
		const groups = new Map<string, string[]>();
		for (const item of row?.comments ?? []) {
			const value = text(item?.value);
			if (!value) continue;
			const category = text(item?.category) || tr('cell_line_uncategorized');
			const bucket = groups.get(category);
			if (bucket) bucket.push(value);
			else groups.set(category, [value]);
		}
		return [...groups.entries()].map(([category, values]) => ({ category, values }));
	});

	const crossRefs = $derived.by(() =>
		(row?.crossReferences ?? [])
			.map((item) => ({
				database: text(item?.database),
				accession: text(item?.accession),
				category: text(item?.category),
				url: text(item?.url)
			}))
			.filter((item) => item.database || item.accession || item.category || item.url)
	);

	const webPages = $derived.by(() =>
		(row?.webPages ?? [])
			.map((item) => ({
				category: text(item?.category),
				url: text(item?.url),
				institution: text(item?.institution),
				specifier: text(item?.specifier)
			}))
			.filter((item) => item.url)
	);

	const hasSummary = $derived(
		Boolean(
			row &&
			(row.species ||
				row.speciesTaxId != null ||
				row.sex ||
				row.age ||
				diseases.length ||
				derivedSites.length ||
				row.doublingTime ||
				row.microsatelliteInstability ||
				row.parentAccession ||
				row.parentName ||
				row.childCount != null ||
				row.entryVersion != null ||
				row.upstreamCreated ||
				row.upstreamUpdated ||
				transformants.length ||
				row.source ||
				row.createdAt != null)
		)
	);

	const tabItems = $derived.by(() => {
		const items: Array<{ key: string; label: string; badge?: number }> = [
			{ key: 'overview', label: tr('tab_overview') }
		];
		if (row?.parentAccession || row?.parentName || children.length) {
			items.push({ key: 'hierarchy', label: tr('tab_hierarchy'), badge: children.length });
		}
		if (omicsGroups.length || ancestryRows.length || hlaRows.length || strRows.length) {
			items.push({ key: 'genetics', label: tr('tab_genetics') });
		}
		if (commentGroups.length || crossRefs.length || webPages.length || references.length) {
			items.push({ key: 'curation', label: tr('tab_curation') });
		}
		items.push({ key: 'community', label: tr('tab_community') });
		return items;
	});
	$effect(() => {
		if (tabItems.length && !tabItems.some((item) => item.key === tab)) tab = 'overview';
	});
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
					listHref="/cell-lines"
					listLabel={tr('browse_cell_lines')}
					current={String(row.name || row.id)}
				/>
				<h1 class="mt-1 text-2xl font-bold break-all">{row.name || row.id}</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<code class="font-mono text-xs break-all">{row.id}</code>
					{#if row.category}<span>{row.category}</span>{/if}
				</div>
			</div>
			<div class="flex flex-wrap items-center justify-end gap-2">
				<PageTools />
				<IssuePanel entityType="cell_line" entityId={String(row.id)} />
			</div>
		</div>

		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
			<Button
				variant="outline"
				class="h-auto flex-col items-start gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'hierarchy')}
			>
				<span class="text-sm font-semibold tabular-nums"
					>{children.length || row.childCount || 0}</span
				>
				<span class="text-[10px] text-muted-foreground">{tr('tab_hierarchy')}</span>
			</Button>
			<Button
				variant="outline"
				class="h-auto flex-col items-start gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'genetics')}
			>
				<span class="text-sm font-semibold tabular-nums"
					>{omicsGroups.length + ancestryRows.length + hlaRows.length + strRows.length}</span
				>
				<span class="text-[10px] text-muted-foreground">{tr('tab_genetics')}</span>
			</Button>
			<Button
				variant="outline"
				class="h-auto flex-col items-start gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'curation')}
			>
				<span class="text-sm font-semibold tabular-nums">{references.length}</span>
				<span class="text-[10px] text-muted-foreground">{tr('cell_line_references')}</span>
			</Button>
			<Button
				variant="outline"
				class="h-auto flex-col items-start gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'curation')}
			>
				<span class="text-sm font-semibold tabular-nums">{crossRefs.length}</span>
				<span class="text-[10px] text-muted-foreground">{tr('cell_line_cross_references')}</span>
			</Button>
		</div>

		<Tabs bind:active={tab} items={tabItems} />

		{#if tab === 'overview'}
			{#if hasSummary}
				<Section title={tr('cell_line_summary')}>
					<dl
						class="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm [&_dd]:min-w-0 [&_dd]:break-words"
					>
						{#if row.species || row.speciesTaxId != null}
							<dt class="text-muted-foreground">{tr('cell_line_species')}</dt>
							<dd>
								{row.species ?? '—'}
								{#if row.speciesTaxId != null}
									<span class="ml-1 text-xs text-muted-foreground"
										>{tr('cell_line_tax_id')} {row.speciesTaxId}</span
									>
								{/if}
							</dd>
						{/if}
						{#if row.sex}
							<dt class="text-muted-foreground">{tr('cell_line_sex')}</dt>
							<dd>{row.sex}</dd>
						{/if}
						{#if row.age}
							<dt class="text-muted-foreground">{tr('cell_line_age')}</dt>
							<dd>{row.age}</dd>
						{/if}
						{#if diseases.length}
							<dt class="text-muted-foreground">{tr('cell_line_disease')}</dt>
							<dd class="break-words">{diseases.join(' · ')}</dd>
						{/if}
						{#if derivedSites.length}
							<dt class="text-muted-foreground">{tr('cell_line_derived_from_site')}</dt>
							<dd class="space-y-1">
								{#each derivedSites as site, si (`${site.value}-${si}`)}
									<div class="flex flex-wrap items-center gap-1.5">
										<span>{site.value || '—'}</span>
										{#if site.siteType}<Badge tone="muted">{site.siteType}</Badge>{/if}
									</div>
								{/each}
							</dd>
						{/if}
						{#if row.doublingTime}
							<dt class="text-muted-foreground">{tr('cell_line_doubling_time')}</dt>
							<dd>{row.doublingTime}</dd>
						{/if}
						{#if row.microsatelliteInstability}
							<dt class="text-muted-foreground">{tr('cell_line_microsatellite_instability')}</dt>
							<dd>{row.microsatelliteInstability}</dd>
						{/if}
						{#if row.entryVersion != null}
							<dt class="text-muted-foreground">{tr('cell_line_entry_version')}</dt>
							<dd>{row.entryVersion}</dd>
						{/if}
						{#if row.upstreamCreated}
							<dt class="text-muted-foreground">{tr('cell_line_upstream_created')}</dt>
							<dd>{datetimeText(row.upstreamCreated)}</dd>
						{/if}
						{#if row.upstreamUpdated}
							<dt class="text-muted-foreground">{tr('cell_line_upstream_updated')}</dt>
							<dd>{datetimeText(row.upstreamUpdated)}</dd>
						{/if}
						{#if transformants.length}
							<dt class="text-muted-foreground">{tr('cell_line_transformant')}</dt>
							<dd class="space-y-1">
								{#each transformants as item, ti (`${item.database}-${ti}`)}
									<div>
										<span>{item.label || item.database || '—'}</span>
									</div>
								{/each}
							</dd>
						{/if}
						{#if row.source}
							<dt class="text-muted-foreground">{fieldLabel('source')}</dt>
							<dd>{row.source}</dd>
						{/if}
						{#if row.createdAt != null}
							<dt class="text-muted-foreground">{fieldLabel('createdAt')}</dt>
							<dd>{fmtTime(Number(row.createdAt))}</dd>
						{/if}
					</dl>
				</Section>
			{/if}
			<div class="grid gap-4 lg:grid-cols-2">
				<ExternalIdentifiersPanel entityType="cell-line" entityId={String(row.id)} />
				<RelationsPanel entityType="cell-line" entityId={String(row.id)} />
			</div>
			{#if synonyms.length}
				<Section title={`${tr('cell_line_synonyms')} · ${synonyms.length}`} collapsible>
					<p class="break-words">{synonyms.join(' · ')}</p>
				</Section>
			{/if}
		{:else if tab === 'hierarchy'}
			{#if row.parentAccession || row.parentName}
				<Section title={tr('cell_line_parent')}>
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-sm">{row.parentName || row.parentAccession}</span>
						{#if row.parentAccession}
							<Button
								size="xs"
								variant="outline"
								disabled={importingChild === 'parent'}
								onclick={() => openLine(row?.parentAccession ?? undefined, 'parent')}
							>
								{importingChild === 'parent'
									? tr('cell_line_importing_child')
									: tr('cell_line_parent_open')}
							</Button>
						{/if}
					</div>
				</Section>
			{/if}
			{#if children.length}
				<Section title={`${tr('cell_line_children')} · ${children.length}`}>
					<Input
						name="child_filter"
						class="mb-3 h-8 max-w-xs"
						placeholder={tr('cell_line_child_search')}
						bind:value={childFilter}
					/>
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b text-left text-xs text-muted-foreground">
									<th class="py-1.5 pr-3 font-medium">{tr('cell_line_child_name')}</th>
									<th class="py-1.5 pr-3 font-medium"></th>
								</tr>
							</thead>
							<tbody>
								{#each visibleChildren as child, ci (`${child.name ?? child.accession}-${ci}`)}
									<tr class="border-b last:border-0">
										<td class="py-1.5 pr-3">{child.name || '—'}</td>
										<td class="py-1.5 pr-3 text-right">
											{#if child.accession}
												<Button
													size="xs"
													variant="ghost"
													disabled={importingChild === child.accession}
													onclick={() => openLine(child.accession, child.accession ?? '')}
												>
													{importingChild === child.accession
														? tr('cell_line_importing_child')
														: tr('cell_line_open_child')}
												</Button>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if visibleChildren.length < filteredChildren.length}
						<Button size="xs" variant="outline" class="mt-3" onclick={() => (childLimit = 100000)}>
							{tr('cell_line_show_all_children')} · {filteredChildren.length}
						</Button>
					{/if}
					{#if filteredChildren.length === 0}
						<p class="mt-3 text-sm text-muted-foreground">{tr('catalog_empty_tab')}</p>
					{/if}
				</Section>
			{/if}
			{#if !row.parentAccession && !row.parentName && !children.length}
				<p class="text-sm text-muted-foreground">{tr('catalog_empty_tab')}</p>
			{/if}
		{:else if tab === 'genetics'}
			<div class="space-y-3">
				{#if omicsGroups.length}
					<Section title={tr('cell_line_omics')}>
						<div class="grid gap-3 sm:grid-cols-2">
							{#each omicsGroups as group (group.branch)}
								<div>
									<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										{group.branch}
									</p>
									<ul class="mt-1 list-disc space-y-0.5 pl-5 text-sm">
										{#each group.values as value, vi (`${value}-${vi}`)}
											<li class="break-words">{value}</li>
										{/each}
									</ul>
								</div>
							{/each}
						</div>
					</Section>
				{/if}
				{#if ancestryRows.length}
					<Section title={tr('cell_line_genome_ancestry')} collapsible>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b text-left text-xs text-muted-foreground">
										<th class="py-1.5 pr-3 font-medium">{tr('cell_line_population')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('cell_line_percentage')}</th>
									</tr>
								</thead>
								<tbody>
									{#each ancestryRows as item, ai (`${item.population}-${ai}`)}
										<tr class="border-b last:border-0">
											<td class="py-1.5 pr-3">{item.population || '—'}</td>
											<td class="py-1.5 pr-3">
												{#if item.pct != null}
													<div class="flex items-center gap-2">
														<div class="h-1.5 w-24 shrink-0 bg-muted">
															<div class="h-full bg-primary" style={`width: ${item.pct}%`}></div>
														</div>
														<span class="font-mono text-xs tabular-nums">{item.percentage}</span>
													</div>
												{:else}
													<span class="font-mono text-xs">{item.percentage || '—'}</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Section>
				{/if}
				{#if hlaRows.length}
					<Section title={tr('cell_line_hla_typing')} collapsible>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b text-left text-xs text-muted-foreground">
										<th class="py-1.5 pr-3 font-medium">{tr('cell_line_gene')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('cell_line_alleles')}</th>
										{#if hlaHasSource}
											<th class="py-1.5 pr-3 font-medium">{tr('cell_line_reference_source')}</th>
										{/if}
									</tr>
								</thead>
								<tbody>
									{#each hlaRows as item, hi (`${item.gene}-${hi}`)}
										<tr class="border-b last:border-0">
											<td class="py-1.5 pr-3 font-mono text-xs">{item.gene || '—'}</td>
											<td class="py-1.5 pr-3 break-all">{item.alleles || '—'}</td>
											{#if hlaHasSource}
												<td class="py-1.5 pr-3 font-mono text-xs break-all">{item.source || '—'}</td
												>
											{/if}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Section>
				{/if}
				{#if strRows.length}
					<Section title={tr('cell_line_str_profile')} collapsible>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b text-left text-xs text-muted-foreground">
										<th class="py-1.5 pr-3 font-medium">{tr('cell_line_marker')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('cell_line_alleles')}</th>
									</tr>
								</thead>
								<tbody>
									{#each strRows as item, si (`${item.marker}-${si}`)}
										<tr class="border-b last:border-0 {item.conflict ? 'bg-amber-500/5' : ''}">
											<td class="py-1.5 pr-3 font-mono text-xs">
												{item.marker || '—'}
												{#if item.conflict}<Badge tone="warn">{tr('cell_line_str_conflict')}</Badge
													>{/if}
											</td>
											<td class="py-1.5 pr-3 break-all">{item.alleles || '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Section>
				{/if}
				{#if !omicsGroups.length && !ancestryRows.length && !hlaRows.length && !strRows.length}
					<p class="text-sm text-muted-foreground">{tr('catalog_empty_tab')}</p>
				{/if}
			</div>
		{:else if tab === 'curation'}
			<div class="space-y-3">
				{#if commentGroups.length}
					<Section title={tr('cell_line_comments')} collapsible>
						<div class="space-y-3">
							{#each commentGroups as group (group.category)}
								<div>
									<p class="text-xs font-semibold text-muted-foreground">{group.category}</p>
									<ul class="mt-1 space-y-1">
										{#each group.values as value, vi (`${vi}`)}
											<li class="whitespace-pre-line text-sm leading-5 break-words">{value}</li>
										{/each}
									</ul>
								</div>
							{/each}
						</div>
					</Section>
				{/if}
				{#if crossRefs.length}
					<Section title={tr('cell_line_cross_references')} collapsible>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b text-left text-xs text-muted-foreground">
										<th class="py-1.5 pr-3 font-medium">{tr('cell_line_database')}</th>
										<th class="py-1.5 pr-3 font-medium">{fieldLabel('accession')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('cell_line_category')}</th>
									</tr>
								</thead>
								<tbody>
									{#each crossRefs as item, ci (`${item.database}-${ci}`)}
										<tr class="border-b last:border-0">
											<td class="py-1.5 pr-3">{item.database || '—'}</td>
											<td class="py-1.5 pr-3">
												<span class="font-mono text-xs break-all">{item.accession || '—'}</span>
											</td>
											<td class="py-1.5 pr-3">{item.category || '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Section>
				{/if}
				{#if webPages.length}
					<Section title={tr('cell_line_web_pages')} collapsible>
						<ul class="divide-y text-sm">
							{#each webPages as item, wi (`${item.url}-${wi}`)}
								<li class="flex flex-wrap items-center gap-2 py-1.5">
									{#if item.category}<span class="text-xs">{item.category}</span>{/if}
									{#if item.institution}<span class="text-xs">{item.institution}</span>{/if}
									{#if item.specifier}<span class="text-xs text-muted-foreground"
											>{item.specifier}</span
										>{/if}
									<span class="font-mono text-xs break-all">{item.url}</span>
								</li>
							{/each}
						</ul>
					</Section>
				{/if}
				{#if references.length}
					<Section title={`${tr('cell_line_references')} · ${references.length}`} collapsible>
						<ul class="divide-y">
							{#each references as ref, ri (`${ref.id}-${ri}`)}
								<li class="py-1.5">
									{#if ref.citation}<p class="text-sm leading-5 break-words whitespace-pre-line">
											{ref.citation}
										</p>{/if}
									{#if ref.id}<p class="mt-0.5 font-mono text-xs break-all text-muted-foreground">
											{ref.id}
										</p>{/if}
								</li>
							{/each}
						</ul>
					</Section>
				{/if}
				{#if !commentGroups.length && !crossRefs.length && !webPages.length && !references.length}
					<p class="text-sm text-muted-foreground">{tr('catalog_empty_tab')}</p>
				{/if}
			</div>
		{:else if tab === 'community'}
			<SupplierPanel
				{suppliers}
				add={(b) => cellLines.suppliers(id).add(b)}
				remove={(sid) => cellLines.suppliers(id).remove(sid)}
				onchanged={load}
			/>
			<div class="grid gap-4 lg:grid-cols-2">
				<WikiPanel entityType="cell_line" entityId={String(row.id)} collapsible />
				<ReferencesPanel entityType="cell_line" entityId={String(row.id)} collapsible />
			</div>
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('page_not_found')}</p>
{/if}

<svelte:head><title>{row?.name ?? tr('browse_cell_lines')} · SPD</title></svelte:head>
