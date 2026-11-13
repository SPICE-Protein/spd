<script lang="ts">
	import { page } from '$app/state';
	import { enzymes } from '$lib/api/client';
	import type { EnzymeDetail, EnzymeSourceEntry, SupplierInput } from '$lib/api/types';
	import { tr, enumLabel, fieldLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { session } from '$lib/state/session.svelte';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Button from '$lib/components/Button.svelte';
	import Section from '$lib/components/Section.svelte';
	import EntityBreadcrumb from '$lib/components/EntityBreadcrumb.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import RelationsPanel from '$lib/components/RelationsPanel.svelte';
	import RecordContextBar from '$lib/components/RecordContextBar.svelte';
	import ProteinLinkPanel from '$lib/components/ProteinLinkPanel.svelte';
	import SupplierPanel from '$lib/components/SupplierPanel.svelte';
	import AttachmentList from '$lib/components/AttachmentList.svelte';

	/**
	 * Enzyme page: identity and reaction lead, then the BRENDA measurements
	 * grouped by organism, provenance, and the community records. Data is
	 * disclosed in layers; provider accessions are never part of the reading.
	 */
	const id = $derived(page.params.id ?? '');

	let row = $state<EnzymeDetail | null>(null);
	// Major categories are tabs; long subcategories inside a tab stay behind
	// their own disclosure (organism groups, provenance, community records).
	let tab = $state('overview');
	let suppliers = $state<Record<string, unknown>[]>([]);
	let error = $state('');
	let loading = $state(true);
	let brendaBusy = $state(false);

	async function load() {
		loading = true;
		try {
			const r = await enzymes.get(id);
			row = r as unknown as EnzymeDetail;
			suppliers = Array.isArray(r.suppliers) ? (r.suppliers as Record<string, unknown>[]) : [];
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

	const metadata = $derived.by((): Record<string, unknown> => {
		const value = row?.metadata;
		return value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	});

	const sourceEntries = $derived.by((): EnzymeSourceEntry[] => {
		const entries = row?.sourceEntries;
		return Array.isArray(entries) ? (entries as EnzymeSourceEntry[]) : [];
	});
	const hasBrendaEntries = $derived(sourceEntries.some((entry) => entry.source === 'brenda'));

	// Only the two prose assertions in metadata are shown. Anything id-like
	// is deliberately absent from this page.
	const reactionText = $derived(
		typeof metadata.reaction === 'string' ? metadata.reaction.trim() : ''
	);
	const reactionComments = $derived.by((): string[] => {
		const value = metadata.comments;
		if (typeof value === 'string' && value.trim()) return [value.trim()];
		if (Array.isArray(value)) {
			return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
		}
		return [];
	});

	const SOURCE_LABELS: Record<string, string> = {
		community: 'enzyme_source_community',
		brenda: 'enzyme_source_brenda',
		rebase: 'enzyme_source_rebase'
	};

	function sourceLabel(value: unknown): string {
		if (typeof value !== 'string' || !value.trim()) return '';
		const key = value.trim().toLowerCase();
		const messageKey = SOURCE_LABELS[key];
		return messageKey ? tr(messageKey) : fieldLabel(key);
	}

	// A value node keeps arbitrary provider payloads readable without ever
	// falling back to a raw JSON dump.
	type DisplayNode =
		| { kind: 'text'; text: string }
		| { kind: 'list'; items: DisplayNode[] }
		| { kind: 'record'; fields: Array<{ label: string; value: DisplayNode }> };

	const HIDDEN_KEYS = new Set([
		'id',
		'externalid',
		'accession',
		'accessionnumber',
		'uniprot',
		'uniprotaccession',
		'pdbid',
		'xref',
		'xrefs',
		'crossreference',
		'crossreferences',
		'referenceid'
	]);

	function isHiddenKey(key: string): boolean {
		const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
		return (
			HIDDEN_KEYS.has(normalized) ||
			normalized.endsWith('externalid') ||
			normalized.endsWith('accession')
		);
	}

	/** BRENDA stores reversibility as `r` / `ir`; show the boolean it means. */
	function normalizeFieldValue(key: string, value: unknown): unknown {
		if (key.toLowerCase().replace(/[^a-z0-9]/g, '') !== 'reversibility') return value;
		const label = (item: unknown) => {
			const text = String(item).trim().toLowerCase();
			if (text === 'r' || text === 'true' || text === 'yes') return 'True';
			if (text === 'ir' || text === 'false' || text === 'no') return 'False';
			return item;
		};
		return Array.isArray(value) ? value.map(label) : label(value);
	}

	function isEmptyValue(value: unknown): boolean {
		if (value == null || value === '') return true;
		if (Array.isArray(value)) return value.length === 0;
		if (typeof value === 'object')
			return Object.keys(value as Record<string, unknown>).length === 0;
		return false;
	}

	function toDisplay(value: unknown, depth = 0): DisplayNode | null {
		if (isEmptyValue(value)) return null;
		if (Array.isArray(value)) {
			const items = value
				.map((item) => toDisplay(item, depth + 1))
				.filter((node): node is DisplayNode => node !== null);
			return items.length ? { kind: 'list', items } : null;
		}
		if (typeof value === 'object') {
			const entries = Object.entries(value as Record<string, unknown>).filter(
				([key, item]) => !isHiddenKey(key) && !isEmptyValue(item)
			);
			if (!entries.length) return null;
			if (depth >= 3) {
				// Beyond the readable nesting budget, keep the scalars and drop
				// the rest instead of serialising an opaque blob.
				const flat = entries
					.map(([, item]) => (typeof item === 'object' ? '' : String(item)))
					.filter(Boolean);
				return flat.length ? { kind: 'text', text: flat.join(' · ') } : null;
			}
			const fields = entries
				.map(([key, item]) => {
					const node = toDisplay(normalizeFieldValue(key, item), depth + 1);
					return node ? { label: fieldLabel(key), value: node } : null;
				})
				.filter((field): field is { label: string; value: DisplayNode } => field !== null);
			return fields.length ? { kind: 'record', fields } : null;
		}
		return { kind: 'text', text: String(value) };
	}

	type BrendaCategory =
		| 'kinetics'
		| 'reaction'
		| 'protein'
		| 'stability'
		| 'source'
		| 'nomenclature'
		| 'notes'
		| 'other';

	// One category order for every organism group. The first category opens
	// by default so the common question (Km, kcat) needs no extra click.
	const BRENDA_CATEGORIES: Array<{
		key: BrendaCategory;
		message: string;
		order: number;
	}> = [
		{ key: 'kinetics', message: 'enzyme_brenda_cat_kinetics', order: 1 },
		{ key: 'reaction', message: 'enzyme_brenda_cat_reaction', order: 2 },
		{ key: 'protein', message: 'enzyme_brenda_cat_protein', order: 3 },
		{ key: 'stability', message: 'enzyme_brenda_cat_stability', order: 4 },
		{ key: 'source', message: 'enzyme_brenda_cat_source', order: 5 },
		{ key: 'nomenclature', message: 'enzyme_brenda_cat_nomenclature', order: 6 },
		{ key: 'notes', message: 'enzyme_brenda_cat_notes', order: 7 },
		{ key: 'other', message: 'enzyme_brenda_cat_other', order: 8 }
	];

	const BRENDA_KEYS: Record<string, { message: string; order: number; category: BrendaCategory }> =
		{
			km: { message: 'enzyme_brenda_km', order: 1, category: 'kinetics' },
			kmvalue: { message: 'enzyme_brenda_km', order: 1, category: 'kinetics' },
			kmvalues: { message: 'enzyme_brenda_km', order: 1, category: 'kinetics' },
			kcat: { message: 'enzyme_brenda_kcat', order: 2, category: 'kinetics' },
			kcatvalue: { message: 'enzyme_brenda_kcat', order: 2, category: 'kinetics' },
			turnovernumber: { message: 'enzyme_brenda_kcat', order: 2, category: 'kinetics' },
			kcatkmvalue: { message: 'enzyme_brenda_kcat_km', order: 3, category: 'kinetics' },
			kivalue: { message: 'enzyme_brenda_ki', order: 4, category: 'kinetics' },
			ic50value: { message: 'enzyme_brenda_ic50', order: 5, category: 'kinetics' },
			specificactivity: {
				message: 'enzyme_brenda_specific_activity',
				order: 6,
				category: 'kinetics'
			},
			phoptimum: { message: 'enzyme_brenda_ph', order: 7, category: 'kinetics' },
			ph: { message: 'enzyme_brenda_ph', order: 7, category: 'kinetics' },
			temperatureoptimum: {
				message: 'enzyme_brenda_temperature',
				order: 8,
				category: 'kinetics'
			},
			phrange: { message: 'enzyme_brenda_ph_range', order: 9, category: 'kinetics' },
			temperaturerange: {
				message: 'enzyme_brenda_temperature_range',
				order: 10,
				category: 'kinetics'
			},

			reaction: { message: 'enzyme_brenda_reaction', order: 1, category: 'reaction' },
			reactiontype: {
				message: 'enzyme_brenda_reaction_type',
				order: 2,
				category: 'reaction'
			},
			substrates: { message: 'enzyme_brenda_substrates', order: 3, category: 'reaction' },
			substrate: { message: 'enzyme_brenda_substrates', order: 3, category: 'reaction' },
			products: { message: 'enzyme_brenda_products', order: 4, category: 'reaction' },
			product: { message: 'enzyme_brenda_products', order: 4, category: 'reaction' },
			naturalsubstrate: {
				message: 'enzyme_brenda_natural_substrate',
				order: 5,
				category: 'reaction'
			},
			naturalproduct: {
				message: 'enzyme_brenda_natural_product',
				order: 6,
				category: 'reaction'
			},
			cofactors: { message: 'enzyme_brenda_cofactors', order: 7, category: 'reaction' },
			cofactor: { message: 'enzyme_brenda_cofactors', order: 7, category: 'reaction' },
			metalsions: { message: 'enzyme_brenda_metals_ions', order: 8, category: 'reaction' },
			inhibitors: { message: 'enzyme_brenda_inhibitors', order: 9, category: 'reaction' },
			inhibitor: { message: 'enzyme_brenda_inhibitors', order: 9, category: 'reaction' },
			activatingcompound: {
				message: 'enzyme_brenda_activating_compound',
				order: 10,
				category: 'reaction'
			},
			reversibility: {
				message: 'enzyme_brenda_reversibility',
				order: 11,
				category: 'reaction'
			},

			molecularweight: {
				message: 'enzyme_brenda_molecular_weight',
				order: 1,
				category: 'protein'
			},
			subunit: { message: 'enzyme_brenda_subunit', order: 2, category: 'protein' },
			pivalue: { message: 'enzyme_brenda_pi', order: 3, category: 'protein' },
			posttranslationalmodification: {
				message: 'enzyme_brenda_ptm',
				order: 4,
				category: 'protein'
			},
			proteinvariants: {
				message: 'enzyme_brenda_protein_variants',
				order: 5,
				category: 'protein'
			},
			crystallization: {
				message: 'enzyme_brenda_crystallization',
				order: 6,
				category: 'protein'
			},

			phstability: { message: 'enzyme_brenda_ph_stability', order: 1, category: 'stability' },
			temperaturestability: {
				message: 'enzyme_brenda_temperature_stability',
				order: 2,
				category: 'stability'
			},
			generalstability: {
				message: 'enzyme_brenda_general_stability',
				order: 3,
				category: 'stability'
			},
			organicsolvent: {
				message: 'enzyme_brenda_organic_solvent',
				order: 4,
				category: 'stability'
			},
			oxidationstability: {
				message: 'enzyme_brenda_oxidation_stability',
				order: 5,
				category: 'stability'
			},
			storagestability: {
				message: 'enzyme_brenda_storage_stability',
				order: 6,
				category: 'stability'
			},

			sourcetissue: { message: 'enzyme_brenda_source_tissue', order: 1, category: 'source' },
			localization: { message: 'enzyme_brenda_localization', order: 2, category: 'source' },
			expression: { message: 'enzyme_brenda_expression', order: 3, category: 'source' },
			cloned: { message: 'enzyme_brenda_cloned', order: 4, category: 'source' },
			renatured: { message: 'enzyme_brenda_renatured', order: 5, category: 'source' },
			purification: { message: 'enzyme_brenda_purification', order: 6, category: 'source' },
			application: { message: 'enzyme_brenda_application', order: 7, category: 'source' },
			generalinformation: {
				message: 'enzyme_brenda_general_information',
				order: 8,
				category: 'source'
			},

			synonym: { message: 'enzyme_brenda_synonym', order: 1, category: 'nomenclature' },
			commentary: { message: 'enzyme_brenda_commentary', order: 1, category: 'notes' }
		};

	function brendaMeta(
		key: string
	): { message: string; order: number; category: BrendaCategory } | null {
		return BRENDA_KEYS[key.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null;
	}

	function brendaLabel(key: string): string {
		const meta = brendaMeta(key);
		return meta ? tr(meta.message) : fieldLabel(key);
	}

	function brendaRank(key: string): number {
		return brendaMeta(key)?.order ?? 99;
	}

	interface BrendaFieldView {
		key: string;
		label: string;
		value: DisplayNode;
		rank: number;
	}
	interface BrendaCategoryView {
		key: BrendaCategory;
		label: string;
		fields: BrendaFieldView[];
	}
	interface BrendaEntryView {
		name: string;
		source: string;
		citation: string;
		artifactIds: string[];
		categories: BrendaCategoryView[];
	}
	interface BrendaGroup {
		organism: string;
		entries: BrendaEntryView[];
	}

	const brendaGroups = $derived.by((): BrendaGroup[] => {
		const groups = new Map<string, BrendaEntryView[]>();
		for (const entry of sourceEntries) {
			const organism =
				typeof entry.organism === 'string' && entry.organism.trim() ? entry.organism.trim() : '—';
			const buckets = new Map<BrendaCategory, BrendaFieldView[]>();
			for (const [key, value] of Object.entries(entry.data ?? {})) {
				if (isHiddenKey(key) || isEmptyValue(value)) continue;
				const node = toDisplay(normalizeFieldValue(key, value));
				if (!node) continue;
				const category = brendaMeta(key)?.category ?? 'other';
				const field: BrendaFieldView = {
					key,
					label: brendaLabel(key),
					value: node,
					rank: brendaRank(key)
				};
				const list = buckets.get(category) ?? [];
				list.push(field);
				buckets.set(category, list);
			}
			const categories = BRENDA_CATEGORIES.map((category) => ({
				key: category.key,
				label: tr(category.message),
				fields: (buckets.get(category.key) ?? []).sort((a, b) => a.rank - b.rank)
			})).filter((category) => category.fields.length > 0);
			const list = groups.get(organism) ?? [];
			list.push({
				name: typeof entry.name === 'string' ? entry.name : '',
				source: typeof entry.source === 'string' ? entry.source : '',
				citation: typeof entry.citation === 'string' ? entry.citation.trim() : '',
				artifactIds: Array.isArray(entry.artifactIds)
					? entry.artifactIds.map(String).filter(Boolean)
					: [],
				categories
			});
			groups.set(organism, list);
		}
		return Array.from(groups, ([organism, entries]) => ({ organism, entries }));
	});

	interface SourceRow {
		label: string;
		value: string;
	}

	// Empty assertions stay out entirely — a provenance row is a fact, not a
	// placeholder.
	const sourceRows = $derived.by((): SourceRow[] => {
		if (!row) return [];
		const rows: SourceRow[] = [];
		const source = sourceLabel(row.source);
		if (source) rows.push({ label: tr('f_source'), value: source });
		if (row.sourceRelease) {
			rows.push({ label: tr('enzyme_source_release'), value: String(row.sourceRelease) });
		}
		if (row.sourceFetchedAt != null) {
			rows.push({
				label: tr('enzyme_source_fetched'),
				value: fmtTime(Number(row.sourceFetchedAt))
			});
		}
		if (row.license) {
			rows.push({ label: tr('enzyme_source_license'), value: String(row.license) });
		}
		if (row.citation) {
			rows.push({ label: tr('enzyme_source_citation'), value: String(row.citation) });
		}
		return rows;
	});

	const sourceAttribution = $derived.by(() => {
		if (!row) return '';
		const source = sourceLabel(row.source);
		const license = row.license ? String(row.license).trim() : '';
		return source && license ? tr('source_attribution', { source, license }) : '';
	});

	async function fetchBrenda() {
		if (!row?.ecNumber || brendaBusy) return;
		brendaBusy = true;
		try {
			const receipt = await enzymes.fetchBrenda(id, hasBrendaEntries);
			await load();
			toastOk(tr('enzyme_brenda_fetched', { n: receipt.entries }));
		} catch (e) {
			toastErr(e);
		} finally {
			brendaBusy = false;
		}
	}

	function text(v: unknown): string {
		return v == null || v === '' ? '—' : String(v);
	}
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
	{#snippet longText(value: string)}
		{@const LIMIT = 160}
		{#if value.length <= LIMIT}
			<span class="whitespace-pre-line break-words">{value}</span>
		{:else}
			<details class="group">
				<summary class="cursor-pointer text-muted-foreground">
					<span class="group-open:hidden">
						<span class="whitespace-pre-line break-words">{value.slice(0, LIMIT)}…</span>
						<span class="ml-1 whitespace-nowrap text-[11px] underline"
							>{tr('enzyme_brenda_expand')}</span
						>
					</span>
					<span class="hidden text-[11px] underline group-open:inline"
						>{tr('enzyme_brenda_collapse')}</span
					>
				</summary>
				<div class="mt-1 whitespace-pre-line break-words">{value}</div>
			</details>
		{/if}
	{/snippet}

	{#snippet valueList(values: string[])}
		{@const INLINE = 60}
		{@const short = values.filter((item) => item.length <= INLINE)}
		{@const long = values.filter((item) => item.length > INLINE)}
		{#if short.length}
			<p class="break-words">{short.join(' · ')}</p>
		{/if}
		{#each long as item, i (i)}
			<div class="break-words">{@render longText(item)}</div>
		{/each}
	{/snippet}

	{#snippet textValues(texts: string[])}
		{@const LIMIT = 12}
		{@const shown = texts.slice(0, LIMIT)}
		{@const rest = texts.slice(LIMIT)}
		<div class="min-w-0 space-y-1">
			{@render valueList(shown)}
			{#if rest.length}
				<details>
					<summary class="cursor-pointer text-[11px] text-muted-foreground">
						{tr('enzyme_brenda_more', { n: rest.length })}
					</summary>
					<div class="mt-1 min-w-0">
						{@render valueList(rest)}
					</div>
				</details>
			{/if}
		</div>
	{/snippet}

	{#snippet displayNode(node: DisplayNode)}
		{#if node.kind === 'text'}
			{@render longText(node.text)}
		{:else if node.kind === 'list'}
			{#if node.items.every((item) => item.kind === 'text')}
				{@const texts = [
					...new Set(
						node.items.map((item) => (item.kind === 'text' ? item.text.trim() : '')).filter(Boolean)
					)
				]}
				{@render textValues(texts)}
			{:else}
				<div class="space-y-1">
					{#each node.items as item, i (i)}
						{@render displayNode(item)}
					{/each}
				</div>
			{/if}
		{:else}
			<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
				{#each node.fields as field, i (i)}
					<dt class="text-muted-foreground">{field.label}</dt>
					<dd class="min-w-0">{@render displayNode(field.value)}</dd>
				{/each}
			</dl>
		{/if}
	{/snippet}

	<div class="space-y-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<EntityBreadcrumb
					listHref="/enzymes"
					listLabel={tr('browse_enzymes')}
					current={String(row.name ?? '')}
				/>
				<h1 class="mt-1 text-2xl font-bold break-all">{row.name}</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					{#if row.ecNumber}<span>EC {row.ecNumber}</span>{/if}
					{#if row.sourceOrganism}<span class="break-words">{row.sourceOrganism}</span>{/if}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					<code class="font-mono break-all">{row.id}</code>
				</p>
			</div>
			<div class="flex items-center gap-2">
				<PageTools />
				<IssuePanel entityType="enzyme" entityId={String(row.id)} />
			</div>
		</div>

		<RecordContextBar
			entityType="enzyme"
			entityId={String(row.id)}
			name={String(row.name ?? '')}
			showIdentifiers={false}
		/>

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'overview', label: tr('tab_overview') },
				{ key: 'brenda', label: tr('enzyme_page_brenda'), badge: sourceEntries.length },
				{ key: 'source', label: tr('enzyme_page_source') },
				{ key: 'community', label: tr('protein_tab_community') }
			]}
		/>

		{#if tab === 'overview'}
			<Section title={tr('enzyme_page_identity')}>
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
					<dt class="text-muted-foreground">{tr('f_name')}</dt>
					<dd>{row.name}</dd>
					<dt class="text-muted-foreground">{tr('f_ecNumber')}</dt>
					<dd>{text(row.ecNumber)}</dd>
					<dt class="text-muted-foreground">{tr('f_enzymeClass')}</dt>
					<dd>{row.enzymeClass ? enumLabel('ec', row.enzymeClass) : '—'}</dd>
					<dt class="text-muted-foreground">{tr('f_targetMolecule')}</dt>
					<dd>{row.targetMolecule ? enumLabel('tm', row.targetMolecule) : '—'}</dd>
					<dt class="text-muted-foreground">{tr('f_sourceOrganism')}</dt>
					<dd>{text(row.sourceOrganism)}</dd>
				</dl>
			</Section>

			<Section title={tr('enzyme_page_reaction')}>
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
					{#if row.substrate}
						<dt class="text-muted-foreground">{tr('f_substrate')}</dt>
						<dd class="whitespace-pre-line break-words">{text(row.substrate)}</dd>
					{/if}
					{#if row.product}
						<dt class="text-muted-foreground">{tr('f_product')}</dt>
						<dd class="whitespace-pre-line break-words">{text(row.product)}</dd>
					{/if}
					{#if row.optimalPh != null}
						<dt class="text-muted-foreground">{tr('f_optimalPh')}</dt>
						<dd class="tabular-nums">{text(row.optimalPh)}</dd>
					{/if}
					{#if row.optimalTemperature != null}
						<dt class="text-muted-foreground">{tr('f_optimalTemperature')}</dt>
						<dd class="tabular-nums">{text(row.optimalTemperature)}</dd>
					{/if}
					{#if reactionText}
						<dt class="text-muted-foreground">{fieldLabel('reaction')}</dt>
						<dd class="whitespace-pre-line break-words">{reactionText}</dd>
					{/if}
					{#if reactionComments.length}
						<dt class="text-muted-foreground">{fieldLabel('comments')}</dt>
						<dd class="min-w-0">
							<ul class="list-disc space-y-1 pl-4">
								{#each reactionComments as comment, i (i)}
									<li class="break-words">{comment}</li>
								{/each}
							</ul>
						</dd>
					{/if}
				</dl>
				{#if !row.substrate && !row.product && row.optimalPh == null && row.optimalTemperature == null && sourceEntries.length}
					<button
						type="button"
						class="mt-3 text-sm font-medium underline underline-offset-2"
						onclick={() => (tab = 'brenda')}
					>
						{tr('enzyme_overview_brenda_hint')}
					</button>
				{/if}
			</Section>
		{:else if tab === 'brenda'}
			<Section title={tr('enzyme_page_brenda')}>
				<div class="mb-3 flex flex-wrap items-end justify-between gap-2">
					<p class="text-xs text-muted-foreground">
						{#if !row.ecNumber}
							{tr('enzyme_brenda_need_ec')}
						{:else if sourceEntries.length}
							{tr('enzyme_brenda_summary', {
								entries: sourceEntries.length,
								organisms: brendaGroups.length
							})}
						{:else}
							{tr('enzyme_brenda_fetch_hint')}
						{/if}
					</p>
					{#if row.ecNumber}
						<div class="flex flex-wrap items-center gap-2">
							<a
								class="text-xs font-medium underline underline-offset-2"
								href={`/submit/species-data?enzymeId=${encodeURIComponent(String(row.id))}`}
							>
								{tr('species_data_add')}
							</a>
							{#if session.signedIn}
								<Button size="xs" variant="outline" onclick={fetchBrenda} disabled={brendaBusy}>
									{brendaBusy
										? tr('enzyme_brenda_fetching')
										: hasBrendaEntries
											? tr('enzyme_brenda_refresh')
											: tr('enzyme_brenda_fetch')}
								</Button>
							{:else}
								<Button size="xs" variant="ghost" onclick={() => session.signIn()}>
									{tr('enzyme_brenda_signin')}
								</Button>
							{/if}
						</div>
					{/if}
				</div>
				{#if sourceEntries.length}
					<div class="space-y-2">
						{#each brendaGroups as group (group.organism)}
							<details class="rounded-none border bg-muted/20">
								<summary class="cursor-pointer px-3 py-2 text-sm">
									<span class="flex items-center justify-between gap-2">
										<span class="min-w-0 font-medium break-words">{group.organism}</span>
										<span class="shrink-0 text-xs tabular-nums text-muted-foreground">
											{group.entries.length}
											{tr('enzyme_brenda_records')}
										</span>
									</span>
								</summary>
								<div class="space-y-3 border-t px-3 py-2">
									{#each group.entries as entry, i (`${group.organism}-${i}`)}
										<div class="space-y-1.5">
											{#if entry.name}
												<p class="text-xs font-medium break-words">{entry.name}</p>
											{/if}
											{#if entry.source === 'community' || entry.citation}
												<div class="space-y-0.5 text-[11px] text-muted-foreground">
													{#if entry.source === 'community'}
														<p class="font-medium text-emerald-700 dark:text-emerald-300">
															{tr('species_data_community_entry')}
														</p>
													{/if}
													{#if entry.citation}
														<p class="break-words">{entry.citation}</p>
													{/if}
												</div>
											{/if}
											{#if entry.artifactIds.length}
												<AttachmentList ids={entry.artifactIds} />
											{/if}
											{#if entry.categories.length}
												<div class="space-y-2">
													{#each entry.categories as category (category.key)}
														<details
															class="rounded-none border bg-muted/20"
															open={category.key === 'kinetics'}
														>
															<summary class="cursor-pointer px-2 py-1.5 text-xs">
																<span class="flex items-center justify-between gap-2">
																	<span class="font-medium">{category.label}</span>
																	<span class="shrink-0 tabular-nums text-muted-foreground">
																		{category.fields.length}
																	</span>
																</span>
															</summary>
															<dl class="grid gap-x-4 gap-y-2 border-t px-2 py-2 sm:grid-cols-2">
																{#each category.fields as field (field.key)}
																	<div class="min-w-0">
																		<dt
																			class="text-[11px] uppercase tracking-wide text-muted-foreground"
																		>
																			{field.label}
																		</dt>
																		<dd class="mt-0.5 text-xs">
																			{@render displayNode(field.value)}
																		</dd>
																	</div>
																{/each}
															</dl>
														</details>
													{/each}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							</details>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">{tr('enzyme_brenda_empty')}</p>
				{/if}
				{#if row.brenda}
					<p class="mt-3 text-xs text-muted-foreground">
						{tr('enzyme_brenda_attribution', {
							release: row.brenda.release ?? '—',
							license: row.brenda.license ?? 'CC BY 4.0',
							date: row.brenda.fetchedAt ? fmtTime(row.brenda.fetchedAt) : '—'
						})}
					</p>
				{/if}
			</Section>
		{:else if tab === 'source'}
			<Section title={tr('enzyme_page_source')}>
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
					{#each sourceRows as item (item.label)}
						<dt class="text-muted-foreground">{item.label}</dt>
						<dd class="whitespace-pre-line break-words">{item.value}</dd>
					{/each}
				</dl>
				{#if sourceAttribution}
					<p class="mt-3 text-xs text-muted-foreground">{sourceAttribution}</p>
				{/if}
			</Section>
		{:else}
			<Section title={tr('enzyme_page_relations')}>
				<div class="space-y-4">
					<ProteinLinkPanel
						current={typeof row.proteinId === 'string' ? row.proteinId : ''}
						bind={(pid: string) => enzymes.linkProtein(id, pid)}
						unbind={() => enzymes.unlinkProtein(id)}
						onchanged={load}
					/>

					<SupplierPanel
						{suppliers}
						add={(b: SupplierInput) => enzymes.suppliers(id).add(b)}
						remove={(sid: string) => enzymes.suppliers(id).remove(sid)}
						onchanged={load}
					/>

					<div class="grid gap-4 lg:grid-cols-2">
						<WikiPanel entityType="enzyme" entityId={String(row.id)} />
						<ReferencesPanel entityType="enzyme" entityId={String(row.id)} />
					</div>

					<RelationsPanel entityType="enzyme" entityId={String(row.id)} />
				</div>
			</Section>
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('page_not_found')}</p>
{/if}

<svelte:head><title>{row?.name ?? tr('browse_enzymes')} · SPD</title></svelte:head>
