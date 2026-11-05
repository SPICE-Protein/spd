<script lang="ts">
	import {
		biobricks,
		cassettes,
		constructs,
		firstArray,
		genes,
		proteins,
		reagents,
		strains,
		vectors
	} from '$lib/api/client';
	import { displayRecordName, entityHref, shortPublicId } from '$lib/format';
	import { enumLabel, tr } from '$lib/i18n';
	import { downloadText } from '$lib/export/download';
	import { market } from '$lib/state/market.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import MarketCard from '$lib/components/MarketCard.svelte';
	import Section from '$lib/components/Section.svelte';
	import Select from '$lib/components/Select.svelte';
	import Tabs from '$lib/components/Tabs.svelte';

	/**
	 * The Market is a local shortlist. This page can browse it and fill it from
	 * the public catalogs, but it never sends the collection anywhere: the store
	 * lives in localStorage (see $lib/state/market) and the only network calls
	 * here are ordinary public catalog list reads for Discover.
	 *
	 * The collection is hydrated from storage before hydration, so store-backed
	 * markup waits for `mounted`; otherwise the server's empty list and the
	 * browser's saved list would disagree at hydration time.
	 */

	type KindKey =
		| 'biobricks'
		| 'vectors'
		| 'cassettes'
		| 'constructs'
		| 'strains'
		| 'reagents'
		| 'proteins'
		| 'genes';

	interface DiscoverRow {
		id: string;
		name: string;
		entityType: string;
		href: string;
	}

	interface KindDef {
		labelKey: string;
		entityType: string;
		load: () => Promise<unknown>;
		nameOf: (row: Record<string, unknown>) => string;
	}

	function text(value: unknown): string {
		return typeof value === 'string' ? value.trim() : '';
	}

	function metadataName(row: Record<string, unknown>): string {
		const meta = row.metadata;
		if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return '';
		return text((meta as Record<string, unknown>).name);
	}

	/** Most catalog rows name themselves; the symbol/id pairs read through the
	 * same display rule the record pages use. */
	function baseName(row: Record<string, unknown>): string {
		const symbol = text(row.symbol);
		for (const candidate of [row.preferredName, row.name, row.title, row.symbol]) {
			const value = text(candidate);
			if (value) return displayRecordName(value, symbol || null);
		}
		return displayRecordName(metadataName(row));
	}

	/** A cassette carries its identity in its parts, not a name column. */
	function cassetteName(row: Record<string, unknown>): string {
		const parts = Array.isArray(row.parts) ? row.parts : [];
		const first = parts[0];
		if (first && typeof first === 'object' && !Array.isArray(first)) {
			const id = text((first as Record<string, unknown>).id);
			if (id) return `${id} (${parts.length})`;
		}
		return baseName(row);
	}

	const KINDS: Record<KindKey, KindDef> = {
		biobricks: {
			labelKey: 'browse_biobricks',
			entityType: 'biobrick',
			load: () => biobricks.list(),
			nameOf: baseName
		},
		vectors: {
			labelKey: 'browse_vectors',
			entityType: 'vector',
			load: () => vectors.list(),
			nameOf: baseName
		},
		cassettes: {
			labelKey: 'browse_cassettes',
			entityType: 'cassette',
			load: () => cassettes.list(),
			nameOf: cassetteName
		},
		constructs: {
			labelKey: 'browse_constructs',
			entityType: 'construct',
			load: () => constructs.list(),
			nameOf: baseName
		},
		strains: {
			labelKey: 'browse_strains',
			entityType: 'strain',
			load: () => strains.list(),
			nameOf: baseName
		},
		reagents: {
			labelKey: 'browse_reagents',
			entityType: 'reagent',
			load: () => reagents.list(),
			nameOf: baseName
		},
		proteins: {
			labelKey: 'nav_proteins',
			entityType: 'protein',
			load: () => proteins.list(50),
			nameOf: baseName
		},
		genes: {
			labelKey: 'browse_genes',
			entityType: 'gene',
			load: () => genes.list(),
			nameOf: baseName
		}
	};

	const KIND_ORDER: KindKey[] = [
		'biobricks',
		'vectors',
		'cassettes',
		'constructs',
		'strains',
		'reagents',
		'proteins',
		'genes'
	];
	const kindOptions = KIND_ORDER.map((kind) => ({
		value: kind,
		label: tr(KINDS[kind].labelKey)
	}));

	function normalizeRows(kind: KindKey, data: unknown): DiscoverRow[] {
		const def = KINDS[kind];
		const rows = firstArray<Record<string, unknown>>(data, 'items');
		const out: DiscoverRow[] = [];
		const seen = new Set<string>();
		for (const row of rows) {
			if (!row || typeof row !== 'object') continue;
			const id = text(row.id) || text(row.publicId);
			if (!id || seen.has(id)) continue;
			seen.add(id);
			out.push({
				id,
				name: def.nameOf(row) || shortPublicId(id),
				entityType: def.entityType,
				href: entityHref(def.entityType, id)
			});
		}
		return out;
	}

	let tab = $state('mine');
	let mounted = $state(false);

	// Storage-backed markup appears only after hydration; see the note above.
	$effect(() => {
		mounted = true;
	});

	const tabItems = $derived([
		{
			key: 'mine',
			label: tr('market_tab_mine'),
			badge: mounted ? market.items.length : undefined
		},
		{ key: 'discover', label: tr('market_tab_discover') }
	]);

	let mineTerm = $state('');
	let mineType = $state('all');

	const mineTypes = $derived(
		Array.from(new Set(market.items.map((item) => item.entityType))).sort()
	);

	const typeOptions = $derived([
		{ value: 'all', label: tr('search_all_types') },
		...mineTypes.map((type) => ({
			value: type,
			label: enumLabel('et', type.replace(/-/g, '_'))
		}))
	]);

	const mineFiltered = $derived.by(() => {
		const needle = mineTerm.trim().toLowerCase();
		return [...market.items]
			.filter((item) => mineType === 'all' || item.entityType === mineType)
			.filter((item) => {
				if (!needle) return true;
				return [item.name, item.id, item.entityType, item.note ?? '', ...(item.tags ?? [])]
					.join(' ')
					.toLowerCase()
					.includes(needle);
			})
			.sort((a, b) => b.addedAt - a.addedAt);
	});

	let kindValue = $state('biobricks');
	const discoverKind = $derived((kindValue in KINDS ? kindValue : 'biobricks') as KindKey);
	let discoverTerm = $state('');
	let discoverRows = $state<DiscoverRow[]>([]);
	// true until the first catalog answer, so the panel opens on a spinner
	// instead of briefly claiming the catalog is empty
	let discoverLoading = $state(true);
	let discoverError = $state('');
	let requestSeq = 0;

	const discoverFiltered = $derived.by(() => {
		const needle = discoverTerm.trim().toLowerCase();
		if (!needle) return discoverRows;
		return discoverRows.filter(
			(row) =>
				row.name.toLowerCase().includes(needle) ||
				row.id.toLowerCase().includes(needle) ||
				row.entityType.toLowerCase().includes(needle)
		);
	});

	async function loadDiscover(kind: KindKey): Promise<void> {
		const seq = ++requestSeq;
		discoverLoading = true;
		discoverError = '';
		try {
			const data = await KINDS[kind].load();
			if (seq !== requestSeq) return;
			discoverRows = normalizeRows(kind, data);
		} catch (e) {
			if (seq !== requestSeq) return;
			discoverRows = [];
			discoverError = e instanceof Error ? e.message : String(e);
		} finally {
			if (seq === requestSeq) discoverLoading = false;
		}
	}

	// One catalog at a time, and only while Discover is on screen.
	$effect(() => {
		if (!mounted || tab !== 'discover') return;
		const kind = discoverKind;
		void loadDiscover(kind);
	});

	function addRow(row: DiscoverRow): void {
		market.add({ id: row.id, entityType: row.entityType, name: row.name, href: row.href });
	}

	function stamp(): string {
		return new Date().toISOString().slice(0, 10);
	}

	function exportJSON(): void {
		downloadText(`spd-market-${stamp()}.json`, market.toJSON(), 'application/json;charset=utf-8');
	}

	function exportCSV(): void {
		downloadText(`spd-market-${stamp()}.csv`, market.toCSV(), 'text/csv;charset=utf-8');
	}

	function clearAll(): void {
		if (typeof window === 'undefined') return;
		if (!window.confirm(tr('market_clear_confirm'))) return;
		market.clear();
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center gap-2">
		<h1 class="text-2xl font-bold">{tr('market_title')}</h1>
		<Badge tone="info">{tr('market_local_only')}</Badge>
		{#if mounted && market.items.length > 0}
			<span class="text-xs tabular-nums text-muted-foreground">{market.items.length}</span>
		{/if}
	</div>
	<p class="max-w-3xl text-sm text-muted-foreground">{tr('market_intro')}</p>

	<Tabs items={tabItems} bind:active={tab} />

	{#if tab === 'mine'}
		<Section title={tr('market_tab_mine')}>
			{#snippet actions()}
				{#if mounted}
					<Button
						size="xs"
						variant="outline"
						disabled={market.items.length === 0}
						onclick={exportJSON}
					>
						{tr('market_export_json')}
					</Button>
					<Button
						size="xs"
						variant="outline"
						disabled={market.items.length === 0}
						onclick={exportCSV}
					>
						{tr('market_export_csv')}
					</Button>
					<Button
						size="xs"
						variant="danger"
						disabled={market.items.length === 0}
						onclick={clearAll}
					>
						{tr('market_clear')}
					</Button>
				{/if}
			{/snippet}

			{#if !mounted}
				<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
			{:else}
				<div class="flex flex-wrap items-end gap-2">
					<label class="block min-w-48 flex-1 text-xs">
						<span class="mb-1 block text-muted-foreground">{tr('market_search')}</span>
						<Input
							name="market-search"
							type="search"
							bind:value={mineTerm}
							placeholder={tr('market_search')}
							aria_label={tr('market_search')}
						/>
					</label>
					<label class="block min-w-40 text-xs">
						<span class="mb-1 block text-muted-foreground">{tr('market_filter_type')}</span>
						<Select
							name="market-type"
							bind:value={mineType}
							options={typeOptions}
							placeholder={tr('market_filter_type')}
						/>
					</label>
				</div>

				{#if market.items.length === 0}
					<p class="mt-3 text-sm text-muted-foreground">{tr('market_empty')}</p>
				{:else if mineFiltered.length === 0}
					<p class="mt-3 text-sm text-muted-foreground">{tr('common_empty')}</p>
				{:else}
					<div class="mt-3 space-y-2">
						{#each mineFiltered as item (`${item.entityType}:${item.id}`)}
							<MarketCard {item} />
						{/each}
					</div>
				{/if}
			{/if}
		</Section>
	{:else}
		<Section title={tr('market_tab_discover')}>
			<div class="flex flex-wrap items-end gap-2">
				<label class="block min-w-48 text-xs">
					<span class="mb-1 block text-muted-foreground">{tr('market_filter_type')}</span>
					<Select name="market-discover-kind" bind:value={kindValue} options={kindOptions} />
				</label>
				<label class="block min-w-48 flex-1 text-xs">
					<span class="mb-1 block text-muted-foreground">{tr('market_search')}</span>
					<Input
						name="market-discover-search"
						type="search"
						bind:value={discoverTerm}
						placeholder={tr('market_search')}
						aria_label={tr('market_search')}
					/>
				</label>
			</div>
			<p class="mt-2 text-xs text-muted-foreground">{tr('market_discover_hint')}</p>

			{#if discoverLoading}
				<p class="mt-3 text-sm text-muted-foreground">{tr('common_loading')}</p>
			{:else if discoverError}
				<p
					class="mt-3 rounded-none border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive"
				>
					{discoverError}
				</p>
			{:else if discoverFiltered.length === 0}
				<p class="mt-3 text-sm text-muted-foreground">
					{discoverRows.length === 0 ? tr('market_discover_empty') : tr('common_empty')}
				</p>
			{:else}
				<div class="mt-3 divide-y rounded-none ring-1 ring-foreground/10">
					{#each discoverFiltered as row (`${row.entityType}:${row.id}`)}
						<div class="flex flex-wrap items-center gap-2 px-3 py-2">
							<a
								href={row.href}
								class="min-w-0 flex-1 truncate text-sm hover:underline"
								title={row.name}
							>
								{row.name}
							</a>
							<Badge tone="neutral">{enumLabel('et', row.entityType)}</Badge>
							<a
								href={row.href}
								class="font-mono text-xs text-muted-foreground hover:underline"
								title={row.id}
							>
								{shortPublicId(row.id)}
							</a>
							{#if mounted && market.has(row.entityType, row.id)}
								<Badge tone="ok">{tr('market_added')}</Badge>
							{:else}
								<Button size="xs" variant="outline" onclick={() => addRow(row)}>
									{tr('market_add')}
								</Button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</Section>
	{/if}
</div>

<svelte:head><title>{tr('market_title')} · SPD</title></svelte:head>
