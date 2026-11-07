<script lang="ts">
	import { page } from '$app/state';
	import { geneticCodes } from '$lib/api/client';
	import type {
		GeneticCodeRow,
		GeneticCodeSpeciesBinding,
		SpeciesGeneticCodeData
	} from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { aaGroupsFor } from '$lib/codons';
	import { session } from '$lib/state/session.svelte';
	import { toastOk } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import EntityBreadcrumb from '$lib/components/EntityBreadcrumb.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';

	const id = $derived(page.params.id ?? '');
	let row = $state<GeneticCodeRow | null>(null);
	let bindings = $state<GeneticCodeSpeciesBinding[]>([]);
	let error = $state('');
	let loading = $state(true);

	async function load() {
		loading = true;
		try {
			const [code, species] = await Promise.all([
				geneticCodes.get(id),
				geneticCodes.species(id).catch(() => ({ geneticCodeTableId: id, items: [] }))
			]);
			row = code;
			bindings = species.items;
			error = '';
		} catch (e) {
			row = null;
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
	$effect(() => void load());

	const groups = $derived(aaGroupsFor(row?.codonToAa));
	const stops = $derived(
		(row?.stopCodons ?? []).length
			? row!.stopCodons!
			: Object.entries(row?.codonToAa ?? {})
					.filter(([, aa]) => aa === '*')
					.map(([codon]) => codon)
	);

	let taxId = $state('');
	let sciName = $state('');
	let saving = $state(false);
	let bindError = $state('');
	let lookup = $state<SpeciesGeneticCodeData | null>(null);
	let lookupError = $state('');

	async function bind() {
		bindError = '';
		if (!row || !session.signedIn) return;
		if (!/^\d+$/.test(taxId.trim()) || Number(taxId) <= 0) {
			bindError = tr('genetic_code_taxon_invalid');
			return;
		}
		saving = true;
		try {
			await geneticCodes.setSpeciesCode(Number(taxId), {
				geneticCodeTableId: row.id,
				scientificName: sciName.trim() || undefined
			});
			toastOk(tr('genetic_code_bound'));
			taxId = '';
			sciName = '';
			await load();
		} catch (e) {
			bindError = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	async function lookupTaxon() {
		lookup = null;
		lookupError = '';
		if (!/^\d+$/.test(taxId.trim()) || Number(taxId) <= 0) {
			lookupError = tr('genetic_code_taxon_invalid');
			return;
		}
		try {
			lookup = await geneticCodes.speciesCode(Number(taxId));
		} catch (e) {
			lookupError = e instanceof Error ? e.message : String(e);
		}
	}
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
				listHref="/genetic-codes"
				listLabel={tr('browse_genetic_codes')}
				current={String(row.name ?? '')}
			/>
			<h1 class="mt-1 text-xl font-bold">{row.name}</h1>
			<p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<code class="font-mono break-all">{row.id}</code>
				{#if row.updatedAt}<span>{fmtTime(Number(row.updatedAt))}</span>{/if}
				{#if row.sourceUrl}<a class="underline" href={row.sourceUrl} target="_blank" rel="noopener"
						>{tr('codon_source_link')}</a
					>{/if}
			</p>
			{#if row.description}
				<p class="mt-2 max-w-3xl text-sm text-muted-foreground">{row.description}</p>
			{/if}
		</div>

		<div class="flex justify-end"><PageTools /></div>

		<Section title={tr('genetic_code_table_title')} hint={tr('genetic_code_hint')}>
			<p class="mb-1 text-xs text-muted-foreground">NCBI {row.ncbiTableId}</p>
			<div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
				<span class="text-muted-foreground">{tr('genetic_code_start')}</span>
				{#each row.startCodons ?? [] as c (c)}<code class="font-mono">{c}</code>{/each}
				{#if !(row.startCodons ?? []).length}<span class="text-muted-foreground">—</span>{/if}
				<span class="ml-3 text-muted-foreground">{tr('genetic_code_stop')}</span>
				{#each stops as c (c)}<code class="font-mono">{c}</code>{/each}
			</div>
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-sm">
					<thead>
						<tr class="border-b text-left text-xs text-muted-foreground">
							<th class="py-2 pr-4 font-medium">{tr('genetic_code_col_amino')}</th>
							<th class="py-2 font-medium">{tr('genetic_code_col_codons')}</th>
						</tr>
					</thead>
					<tbody>
						{#each groups as g (g.aa)}
							<tr class="border-b border-border/60 align-top last:border-0">
								<td class="whitespace-nowrap py-2 pr-4">
									<span class="font-mono text-sm font-bold">{g.aa}</span>
									<span class="ml-1.5 text-xs text-muted-foreground">{g.aa3}</span>
								</td>
								<td class="py-2">
									<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
										{#each g.codons as codon (codon)}
											<span class="inline-flex items-center gap-1">
												<code class="font-mono text-xs">{codon}</code>
												{#if stops.includes(codon)}<Badge tone="muted"
														>{tr('genetic_code_stop')}</Badge
													>{/if}
												{#if (row.startCodons ?? []).includes(codon)}
													<Badge tone="info">{tr('genetic_code_start_short')}</Badge>
												{/if}
											</span>
										{/each}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Section>

		<Section title={tr('genetic_code_species_title')} hint={tr('genetic_code_species_hint')}>
			{#if bindings.length}
				<ul class="divide-y text-sm">
					{#each bindings as b (b.taxonId)}
						<li class="flex flex-wrap items-baseline gap-2 py-1.5">
							<span class="font-medium"
								>{b.scientificName || `${tr('codon_taxon')} ${b.taxonId}`}</span
							>
							<span class="font-mono text-xs text-muted-foreground">{b.taxonId}</span>
							{#if b.updatedAt}<span class="ml-auto text-xs text-muted-foreground"
									>{fmtTime(Number(b.updatedAt))}</span
								>{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-muted-foreground">{tr('genetic_code_no_species')}</p>
			{/if}

			<div class="mt-4 border-t pt-3">
				<h3 class="flex items-center gap-1 text-sm font-semibold">
					{tr('genetic_code_bind_title')}
					<InfoTip
						text={tr('genetic_code_bind_hint')}
						label={`${tr('genetic_code_bind_title')} — ${tr('common_more_info')}`}
					/>
				</h3>
				{#if session.signedIn}
					<div class="mt-2 flex flex-wrap items-end gap-2">
						<label class="text-xs">
							<span class="mb-1 block text-muted-foreground">{tr('codon_field_taxon')}</span>
							<Input name="genetic-code-taxon" bind:value={taxId} placeholder="9606" class="w-36" />
						</label>
						<label class="text-xs">
							<span class="mb-1 block text-muted-foreground"
								>{tr('codon_field_scientific_name')}</span
							>
							<Input
								name="genetic-code-species-name"
								bind:value={sciName}
								placeholder="Homo sapiens"
								class="w-56"
							/>
						</label>
						<Button size="sm" onclick={bind} disabled={saving}>{tr('genetic_code_bind_cta')}</Button
						>
						<Button size="sm" variant="outline" onclick={lookupTaxon}
							>{tr('genetic_code_lookup_cta')}</Button
						>
					</div>
				{:else}
					<Button size="sm" variant="outline" href="/login">{tr('nav_login')}</Button>
				{/if}
				{#if bindError}<p class="mt-2 text-xs text-destructive">{bindError}</p>{/if}
				{#if lookupError}<p class="mt-2 text-xs text-destructive">{lookupError}</p>{/if}
				{#if lookup}
					<p class="mt-2 text-xs">
						{tr('genetic_code_lookup_result', { n: lookup.taxonId })}:
						<a class="underline" href="/genetic-codes/{lookup.table.id}">{lookup.table.name}</a>
						<Badge tone={lookup.explicit ? 'info' : 'muted'}>
							{lookup.explicit ? tr('genetic_code_explicit') : tr('genetic_code_fallback')}
						</Badge>
					</p>
				{/if}
			</div>
		</Section>
	{/if}
</div>

<svelte:head><title>{row?.name ?? tr('browse_genetic_codes')} · SPD</title></svelte:head>
