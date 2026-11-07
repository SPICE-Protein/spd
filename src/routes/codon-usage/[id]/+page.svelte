<script lang="ts">
	import { page } from '$app/state';
	import { codonUsage, geneticCodes } from '$lib/api/client';
	import type { CodonSpeciesUsage, CodonUsageRow, GeneticCodeRow } from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { aaGroupsFor, lookupCodon, nonStandardCodons, type AaGroup } from '$lib/codons';
	import Section from '$lib/components/Section.svelte';
	import EntityBreadcrumb from '$lib/components/EntityBreadcrumb.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Badge from '$lib/components/Badge.svelte';

	const id = $derived(page.params.id ?? '');
	let row = $state<CodonUsageRow | null>(null);
	let codeTables = $state<Record<string, GeneticCodeRow>>({});
	let error = $state('');
	let loading = $state(true);

	async function load() {
		loading = true;
		try {
			row = await codonUsage.get(id);
			error = '';
			const ids = new Set<string>();
			if (row.geneticCodeTableId) ids.add(row.geneticCodeTableId);
			for (const sp of row.species ?? []) {
				if (sp.geneticCodeTableId) ids.add(sp.geneticCodeTableId);
			}
			const loaded = await Promise.allSettled([...ids].map((key) => geneticCodes.get(key)));
			const next: Record<string, GeneticCodeRow> = {};
			loaded.forEach((r) => {
				if (r.status === 'fulfilled') next[r.value.id] = r.value;
			});
			codeTables = next;
		} catch (e) {
			row = null;
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
	$effect(() => void load());

	/** Accept JSON numbers, numeric strings, or {frequency|value} wrappers. */
	function normalizeUsage(raw: unknown): Record<string, number> {
		if (!raw || typeof raw !== 'object') return {};
		const out: Record<string, number> = {};
		for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
			const n =
				typeof v === 'number'
					? v
					: typeof v === 'string'
						? Number(v)
						: typeof v === 'object' && v !== null
							? Number(
									(v as Record<string, unknown>).frequency ?? (v as Record<string, unknown>).value
								)
							: NaN;
			if (/^[ACGTU]{3}$/i.test(k) && Number.isFinite(n)) out[k.toUpperCase()] = n;
		}
		return out;
	}

	interface CodonItem {
		codon: string;
		n?: number;
	}
	interface GroupView extends AaGroup {
		items: CodonItem[];
	}
	interface SpeciesView {
		key: string;
		taxonId: number | null;
		name: string;
		tableId: string | null;
		table: GeneticCodeRow | null;
		groups: GroupView[];
		usage: Record<string, number>;
		extra: string[];
		raw: Record<string, number>;
	}

	function viewFor(sp: CodonSpeciesUsage, index: number): SpeciesView {
		const tableId = sp.geneticCodeTableId ?? row?.geneticCodeTableId ?? null;
		const table = tableId ? (codeTables[tableId] ?? null) : null;
		// A single-species row stores its map at the top level; multi-species
		// rows store each map inside `species[]`. The page presents both as
		// one species view.
		const usage = normalizeUsage(
			sp.codonMap ??
				(row?.snapshotKind !== 'multi' && row?.taxonId === sp.taxonId ? row?.codonMap : undefined)
		);
		const code = table?.codonToAa;
		const groups: GroupView[] = aaGroupsFor(code).map((g) => {
			const items: CodonItem[] = g.codons.map((codon) => {
				const rna = codon.replace(/T/g, 'U');
				const shown = usage[codon] !== undefined ? codon : rna in usage ? rna : codon;
				return { codon: shown, n: lookupCodon(usage, codon) };
			});
			return { ...g, items };
		});
		return {
			key: tableId ? `${tableId}:${sp.taxonId ?? index}` : String(sp.taxonId ?? index),
			taxonId: sp.taxonId ?? null,
			name:
				sp.scientificName ||
				(sp.taxonId != null ? `taxon ${sp.taxonId}` : tr('codon_species_unnamed')),
			tableId,
			table,
			groups: groups.filter((g) => g.items.some((i) => i.n !== undefined)),
			usage,
			extra: nonStandardCodons(
				usage,
				code ? new Set(Object.keys(code).map((c) => c.toUpperCase())) : undefined
			),
			raw: usage
		};
	}

	const isMulti = $derived(row?.snapshotKind === 'multi' || (row?.species?.length ?? 0) > 1);
	const species = $derived.by<CodonSpeciesUsage[]>(() => {
		if (!row) return [];
		if (row.species?.length) {
			const singleMap = row.codonMap;
			if (row.snapshotKind !== 'multi' && singleMap) {
				return row.species.map((sp, i) =>
					i === 0 ? { ...sp, codonMap: singleMap as Record<string, number> } : sp
				);
			}
			return row.species;
		}
		return [
			{
				taxonId: row.taxonId,
				geneticCodeTableId: row.geneticCodeTableId,
				codonMap: (row.codonMap ?? {}) as Record<string, number>
			}
		];
	});
	const views = $derived(species.map((sp, i) => viewFor(sp, i)));
	const tablesUsed = $derived([
		...new Map(views.filter((v) => v.table).map((v) => [v.tableId, v.table!])).values()
	]);
</script>

<div class="space-y-4">
	{#if loading}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else if error || !row}
		<div
			class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
		>
			{error || tr('page_not_found')}
		</div>
	{:else}
		<div>
			<EntityBreadcrumb
				listHref="/codon-usage"
				listLabel={tr('browse_codon_usage')}
				current={`${row.title || row.source}${!isMulti && row.taxonId != null ? ` · ${tr('codon_taxon')} ${row.taxonId}` : ''}`}
			/>
			<h1 class="mt-1 text-xl font-bold">
				{row.title || row.source}{#if !isMulti && row.taxonId != null}
					· {tr('codon_taxon')} {row.taxonId}{/if}
			</h1>
			<p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<code class="font-mono break-all">{row.id}</code>
				{#if row.selectionMode}<span>{row.selectionMode}</span>{/if}
				{#if isMulti}<span>{tr('codon_species_count', { n: views.length })}</span>{/if}
				{#if row.createdAt}<span>{fmtTime(Number(row.createdAt))}</span>{/if}
				{#if row.sourceUrl}<a
						class="underline"
						href={String(row.sourceUrl)}
						target="_blank"
						rel="noopener">{tr('codon_source_link')}</a
					>{/if}
			</p>
		</div>

		<div class="flex justify-end"><PageTools /></div>

		<IssuePanel entityType="codon_usage" entityId={row.id} />

		{#if tablesUsed.length}
			<Section title={tr('codon_code_title')} hint={tr('codon_code_hint')}>
				<ul class="space-y-1 text-sm">
					{#each tablesUsed as t (t.id)}
						<li class="flex flex-wrap items-center gap-2">
							<a class="underline" href="/genetic-codes/{t.id}">{t.name}</a>
							<span>NCBI {t.ncbiTableId}</span>
							<span class="text-xs text-muted-foreground">
								{tr('codon_code_species_using', {
									n: views.filter((v) => v.tableId === t.id).length
								})}
							</span>
						</li>
					{/each}
				</ul>
			</Section>
		{/if}

		<Section
			title={isMulti ? tr('codon_species_title') : tr('codon_table_title')}
			hint={tr('codon_bar_hint')}
		>
			{#if views.every((v) => v.groups.length === 0)}
				<p class="text-sm text-muted-foreground">{tr('codon_no_map')}</p>
			{:else}
				<div class={isMulti ? 'grid gap-6 xl:grid-cols-2' : ''}>
					{#each views as v (v.key)}
						<div class="space-y-2.5">
							{#if isMulti}
								<div class="flex flex-wrap items-baseline gap-2 border-b pb-1">
									<h3 class="text-sm font-semibold">{v.name}</h3>
									{#if v.taxonId != null}<span class="text-xs text-muted-foreground"
											>{tr('codon_taxon')} {v.taxonId}</span
										>{/if}
									{#if v.table}<a class="text-xs underline" href="/genetic-codes/{v.table.id}"
											>{v.table.name}</a
										>{/if}
								</div>
							{/if}
							<div class="overflow-x-auto">
								<table class="w-full border-collapse text-sm">
									<thead>
										<tr class="border-b text-left text-xs text-muted-foreground">
											<th class="py-1.5 pr-3 font-medium">{tr('genetic_code_col_codons')}</th>
											<th class="py-1.5 pr-3 font-medium">{tr('genetic_code_col_amino')}</th>
											<th class="py-1.5 text-right font-medium">{tr('codon_col_frequency')}</th>
										</tr>
									</thead>
									<tbody>
										{#each v.groups as g (g.aa)}
											{#each g.items as it (it.codon)}
												<tr class="border-b border-border/60 last:border-0">
													<td class="py-1 pr-3 font-mono text-xs">{it.codon}</td>
													<td class="py-1 pr-3">
														<span class="font-mono text-xs font-bold">{g.aa}</span>
														<span class="ml-1 text-xs text-muted-foreground"
															>{g.aa === '*' ? tr('codon_stop') : g.aa3}</span
														>
													</td>
													<td class="py-1 text-right text-xs tabular-nums"
														>{it.n !== undefined ? it.n : '—'}</td
													>
												</tr>
											{/each}
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/each}
				</div>
				{#if row.snapshotSha256}
					<p class="mt-3 break-all font-mono text-[10px] text-muted-foreground">
						{row.snapshotSha256}
					</p>
				{/if}
			{/if}
		</Section>

		<WikiPanel entityType="codon_usage" entityId={row.id} collapsible />
	{/if}
</div>

<svelte:head
	><title>{row?.title || row?.source || tr('browse_codon_usage')} · SPD</title></svelte:head
>
