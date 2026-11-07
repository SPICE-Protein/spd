<script lang="ts">
	import { page } from '$app/state';
	import { pdbEntries, artifacts as artifactApi } from '$lib/api/client';
	import { SpdApiError } from '$lib/api/base';
	import type { PdbEntityRecord, PdbEntryRow } from '$lib/api/types';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import EntityBreadcrumb from '$lib/components/EntityBreadcrumb.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import RecordActions from '$lib/components/RecordActions.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import IdLink from '$lib/components/IdLink.svelte';
	import RelationsPanel from '$lib/components/RelationsPanel.svelte';
	import ExternalIdentifiersPanel from '$lib/components/ExternalIdentifiersPanel.svelte';
	import MolViewer from '$lib/components/mol/MolViewer.svelte';
	import DnaViewer from '$lib/gene/DnaViewer.svelte';

	const id = $derived(page.params.id ?? '');

	let row = $state<PdbEntryRow | null>(null);
	let entities = $state<PdbEntityRecord[]>([]);
	let error = $state('');
	let tab = $state('overview');

	async function load() {
		const pid = id;
		// The entity table is keyed by the same route id; fetch it beside the
		// entry record rather than after it.
		const entitiesP = pdbEntries.entities(pid).catch(() => null);
		try {
			row = await pdbEntries.get(pid);
			error = '';
			const ent = await entitiesP;
			if (row?.id !== pid && row?.pdbId !== pid) return;
			entities = ent?.entities ?? [];
		} catch (e) {
			error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
		}
	}
	$effect(() => void load());

	const accessions = $derived(row?.uniprotAccessions ?? []);
	const cell = $derived(row?.cell ?? null);
	const citation = $derived(row?.citation ?? null);
	const chainCount = $derived(new Set(entities.flatMap((e) => e.chainNames)).size);
	const viewerArtifacts = $derived(
		row?.coordinatesArtifactId
			? [
					{
						id: row.coordinatesArtifactId,
						kind: 'full_structure_bincif',
						mediaType: 'chemical/bincif',
						status: 'completed'
					}
				]
			: []
	);
	const depositedAt = $derived.by(() => {
		const raw = row?.metadata as Record<string, unknown> | undefined;
		const value = raw?.depositDate;
		return typeof value === 'string' ? value.slice(0, 10) : null;
	});
</script>

{#if error}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		{error}
	</div>
{:else if row}
	<div class="mx-auto max-w-6xl space-y-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				<EntityBreadcrumb
					listHref="/pdb-entries"
					listLabel={tr('browse_pdb_entries')}
					current={String(row.pdbId ?? row.id ?? '')}
				/>
				<h1 class="mt-1 font-mono text-2xl font-bold uppercase">{row.pdbId}</h1>
				<p class="mt-1 max-w-3xl text-sm text-muted-foreground">{row.title}</p>
				<div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<span>{row.experimentalMethod}</span>
					{#if row.resolutionAngstrom != null}
						<span>{Number(row.resolutionAngstrom).toFixed(2)} Å</span>
					{/if}
					{#if row.releasedAt}
						<span>{tr('pdb_released')} {fmtTime(Number(row.releasedAt), true)}</span>
					{/if}
					<code class="font-mono break-all">{row.publicId ?? row.id ?? ''}</code>
				</div>
			</div>
			<PageTools />
			<IssuePanel
				entityType="pdb_entry"
				entityId={String(row.publicId ?? row.id ?? '')}
				hasWiki={false}
			/>
			<RecordActions
				entityType="pdb_entry"
				id={String(row.publicId ?? row.id ?? '')}
				name={row.title || row.pdbId}
				href={`/pdb-entries/${id}`}
				record={row}
			/>
		</div>

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'overview', label: tr('tab_overview') },
				{ key: 'entities', label: tr('pdb_entities_title'), badge: entities.length },
				{ key: 'crystallography', label: tr('pdb_crystallography') },
				{ key: 'community', label: tr('protein_tab_community') }
			]}
		/>

		{#if tab === 'overview'}
			<div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
				<Section title={tr('protein_observed_structure')} hint={tr('pdb_viewer_hint')}>
					{#snippet actions()}
						{#if row?.coordinatesArtifactId}
							<a
								class="text-xs underline text-muted-foreground"
								href={artifactApi.downloadUrl(row.coordinatesArtifactId!)}
								>{tr('pdb_download_coords')}</a
							>
						{/if}
					{/snippet}
					{#if viewerArtifacts.length}
						<MolViewer artifacts={viewerArtifacts} height={560} />
					{:else}
						<p class="text-sm text-muted-foreground">{tr('pdb_viewer_missing')}</p>
					{/if}
				</Section>

				<div class="space-y-4">
					<Section title={tr('pdb_summary_title')}>
						<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
							<dt class="text-muted-foreground">{tr('f_experimentalMethod')}</dt>
							<dd>{row.experimentalMethod}</dd>
							<dt class="text-muted-foreground">{tr('f_resolutionAngstrom')}</dt>
							<dd class="font-mono text-xs">
								{row.resolutionAngstrom != null
									? `${Number(row.resolutionAngstrom).toFixed(2)} Å`
									: '—'}
							</dd>
							<dt class="text-muted-foreground">{tr('pdb_chains_count')}</dt>
							<dd class="tabular-nums">{chainCount}</dd>
							<dt class="text-muted-foreground">{tr('pdb_entities_count')}</dt>
							<dd class="tabular-nums">{entities.length}</dd>
							{#if row.assemblyCount != null}
								<dt class="text-muted-foreground">{tr('f_assemblyCount')}</dt>
								<dd class="tabular-nums">{row.assemblyCount}</dd>
							{/if}
							{#if row.spaceGroup}
								<dt class="text-muted-foreground">{tr('f_spaceGroup')}</dt>
								<dd class="font-mono text-xs">{row.spaceGroup}</dd>
							{/if}
							{#if row.rFactorWork != null || row.rFree != null}
								<dt class="text-muted-foreground">{tr('pdb_r_factors')}</dt>
								<dd class="font-mono text-xs">
									{row.rFactorWork ?? '—'} / {row.rFree ?? '—'}
								</dd>
							{/if}
							{#if row.releasedAt}
								<dt class="text-muted-foreground">{tr('pdb_released')}</dt>
								<dd>{fmtTime(Number(row.releasedAt), true)}</dd>
							{/if}
							{#if depositedAt}
								<dt class="text-muted-foreground">{tr('pdb_deposited')}</dt>
								<dd>{depositedAt}</dd>
							{/if}
							{#if row.sourceUpdatedAt}
								<dt class="text-muted-foreground">{tr('pdb_source_updated')}</dt>
								<dd>{fmtTime(Number(row.sourceUpdatedAt), true)}</dd>
							{/if}
						</dl>
					</Section>

					<Section title={tr('pdb_cross_links')} collapsible open={accessions.length > 0}>
						<ul class="space-y-1 text-sm">
							{#each accessions as a (a)}
								<li>
									<span class="text-xs text-muted-foreground">UniProt</span>
									<a
										class="ml-2 font-mono text-xs underline"
										href={`https://www.uniprot.org/uniprotkb/${a}`}
										target="_blank"
										rel="noopener">{a}</a
									>
								</li>
							{/each}
							{#if accessions.length === 0}
								<li class="text-sm text-muted-foreground">{tr('common_empty')}</li>
							{/if}
							<li>
								<span class="text-xs text-muted-foreground">RCSB PDB</span>
								<a
									class="ml-2 text-xs underline"
									href={`https://www.rcsb.org/structure/${row.pdbId.toUpperCase()}`}
									target="_blank"
									rel="noopener">{row.pdbId.toUpperCase()} ↗</a
								>
							</li>
						</ul>
					</Section>
				</div>
			</div>
		{:else if tab === 'entities'}
			<Section title={tr('pdb_entities_title')} hint={tr('pdb_entities_hint')}>
				{#if entities.length === 0}
					<p class="text-sm text-muted-foreground">{tr('pdb_entities_none')}</p>
				{:else}
					<div class="divide-y">
						{#each entities as ent (ent.entityId)}
							<details class="group">
								<summary class="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
									<Badge
										tone={ent.entityKind === 'polymer'
											? 'ok'
											: ent.entityKind === 'water'
												? 'muted'
												: 'info'}>{enumLabel('entity_kind', ent.entityKind)}</Badge
									>
									<span class="font-mono text-xs">Entity {ent.entityId}</span>
									{#if ent.chainNames.length}
										<span class="font-mono text-xs text-muted-foreground"
											>{ent.chainNames.join(', ')}</span
										>
									{/if}
									<span class="min-w-0 flex-1 truncate text-sm">{ent.description || '—'}</span>
									{#if ent.residueCount != null}
										<span class="text-xs tabular-nums text-muted-foreground"
											>{ent.residueCount} aa</span
										>
									{/if}
									{#if ent.proteinSequenceId}
										<Badge tone="ok">{tr('pdb_entity_linked')}</Badge>
									{:else}
										<Badge tone="muted">{tr('pdb_entity_unlinked')}</Badge>
									{/if}
								</summary>

								<div class="grid gap-4 pb-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
									{#if ent.sequence}
										<div>
											<p class="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
												{tr('pdb_entity_sequence')}
												<InfoTip
													text={tr('pdb_chain_verbatim')}
													label={`${tr('pdb_entity_sequence')} — ${tr('common_more_info')}`}
												/>
											</p>
											<div class="gene-view" style="height: 280px;">
												<DnaViewer
													dnaSeq={ent.sequence}
													plasmidName={`${row.pdbId} / ${ent.entityId}`}
													mode="protein"
													colorTheme="aa_family"
													restrictionSites={[]}
													geneFeatures={[]}
													parts={[]}
													primers={[]}
												/>
											</div>
										</div>
									{:else}
										<p class="text-sm text-muted-foreground">{tr('pdb_entity_no_sequence')}</p>
									{/if}
									<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
										{#if ent.polymerType}
											<dt class="text-muted-foreground">{tr('f_polymerType')}</dt>
											<dd>{ent.polymerType}</dd>
										{/if}
										{#if ent.proteinSequenceId}
											<dt class="text-muted-foreground">{tr('pdb_entity_col_link')}</dt>
											<dd><IdLink id={ent.proteinSequenceId} kind="sequence" /></dd>
										{/if}
										{#if ent.uniprotAccessions.length}
											<dt class="text-muted-foreground">UniProt</dt>
											<dd class="font-mono text-xs break-all">
												{ent.uniprotAccessions.join(', ')}
											</dd>
										{/if}
										{#if ent.compIds.length}
											<dt class="text-muted-foreground">{tr('pdb_entity_components')}</dt>
											<dd class="font-mono text-xs break-all">{ent.compIds.join(' / ')}</dd>
										{/if}
										{#if ent.sequenceSha256}
											<dt class="text-muted-foreground">SHA-256</dt>
											<dd class="break-all font-mono text-[10px] text-muted-foreground">
												{ent.sequenceSha256}
											</dd>
										{/if}
									</dl>
								</div>
							</details>
						{/each}
					</div>
				{/if}
			</Section>
		{:else if tab === 'crystallography'}
			<Section title={tr('pdb_crystallography')}>
				{#if !row.spaceGroup && !cell && !citation}
					<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
				{:else}
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
						{#if cell}
							<dt class="text-muted-foreground">{tr('f_cell')}</dt>
							<dd class="font-mono text-xs">
								{cell.a ?? '—'} · {cell.b ?? '—'} · {cell.c ?? '—'} Å &nbsp; {cell.alpha ?? '—'}° {cell.beta ??
									'—'}° {cell.gamma ?? '—'}°
							</dd>
						{/if}
						{#if citation}
							<dt class="text-muted-foreground">{tr('f_citation')}</dt>
							<dd>
								{citation.title ?? ''}
								{#if citation.journal}<i>{citation.journal}</i>{/if}
								{#if citation.year != null}
									· {citation.year}{/if}
								{#if citation.doi}
									· <a
										class="font-mono text-xs underline"
										href={`https://doi.org/${citation.doi}`}
										target="_blank"
										rel="noopener">{citation.doi}</a
									>
								{/if}
							</dd>
						{/if}
					</dl>
				{/if}
			</Section>
		{:else}
			<div class="grid gap-4 lg:grid-cols-2">
				<ExternalIdentifiersPanel
					entityType="pdb-entry"
					entityId={String(row.publicId ?? row.id ?? '')}
				/>
				<RelationsPanel entityType="pdb-entry" entityId={String(row.publicId ?? row.id ?? '')} />
			</div>
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{/if}

<svelte:head><title>{id.toUpperCase()} · {tr('pdb_title')}</title></svelte:head>
