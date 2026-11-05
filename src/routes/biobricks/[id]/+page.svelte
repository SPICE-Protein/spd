<script lang="ts">
	import { page } from '$app/state';
	import { biobricks } from '$lib/api/client';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/components/table';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import ProvenancePanel from '$lib/components/ProvenancePanel.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import RecordActions from '$lib/components/RecordActions.svelte';
	import DnaViewer from '$lib/gene/DnaViewer.svelte';
	import ExportMenu from '$lib/components/ExportMenu.svelte';
	import {
		fileStem,
		partFeatureType,
		partRole,
		toFasta,
		toGenbank,
		toSbol3
	} from '$lib/export/bio';

	/**
	 * BioBrick part page, sectioned after the iGEM Registry (part number +
	 * role/composition/length/GC fact grid, base composition breakdown,
	 * functional description, ruler-numbered sequence, "used in" block).
	 * The sequence is inline on the record — unlike vectors, a part IS its
	 * bases — so no artifact round-trip is needed.
	 */
	const id = $derived(page.params.id ?? '');

	interface BiobrickVector {
		id: string;
		name?: string;
		role?: string | null;
		linkedAt?: number;
	}
	interface Chassis {
		designedFor?: string[];
		characterisedIn?: string[];
		sourceOrganism?: string[];
	}

	let row = $state<Record<string, unknown> | null>(null);
	let vectors = $state<BiobrickVector[]>([]);
	let error = $state('');
	let tab = $state('overview');
	let copied = $state(false);

	async function load() {
		try {
			const r = (await biobricks.get(id)) as unknown as Record<string, unknown>;
			vectors = Array.isArray(r.vectors) ? (r.vectors as BiobrickVector[]) : [];
			const { vectors: _drop, ...core } = r;
			row = core;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}
	$effect(() => void load());

	const seq = $derived(
		String(row?.sequence ?? '')
			.replace(/[^A-Za-z]/g, '')
			.toUpperCase()
	);
	const seqLen = $derived(seq.length || Number(row?.length ?? 0));

	// Registry seeds left stray markup in descriptions (</p>, <i>) — show text.
	const description = $derived(
		String(row?.description ?? '')
			.replace(/<[^>]*>/g, '')
			.trim()
	);

	const comp = $derived.by(() => {
		const c = { A: 0, T: 0, G: 0, C: 0 };
		for (const ch of seq) if (ch in c) c[ch as 'A' | 'T' | 'G' | 'C']++;
		const total = seq.length || 1;
		const pct = (n: number) => Math.round((n / total) * 100);
		return {
			A: pct(c.A),
			T: pct(c.T),
			G: pct(c.G),
			C: pct(c.C),
			gc: pct(c.G + c.C)
		};
	});

	const metadata = $derived(
		row?.metadata && typeof row.metadata === 'object'
			? (row.metadata as Record<string, unknown>)
			: {}
	);
	const chassis = $derived(
		metadata.chassis && typeof metadata.chassis === 'object' ? (metadata.chassis as Chassis) : null
	);
	const categories = $derived(Array.isArray(row?.categories) ? (row.categories as string[]) : []);
	const crossRefs = $derived(
		Array.isArray(row?.crossReferences) ? (row.crossReferences as Record<string, unknown>[]) : []
	);
	const parameters = $derived(
		row?.parameters && typeof row.parameters === 'object' && !Array.isArray(row.parameters)
			? (row.parameters as Record<string, unknown>)
			: {}
	);
	const paramEntries = $derived(Object.entries(parameters));

	const partType = $derived(String(row?.partType ?? 'other'));
	const exportBase = $derived(fileStem(String(row?.name ?? 'biobrick'), String(row?.id ?? '')));
	const exportDescription = $derived(description || String(row?.id ?? ''));
	const exportFeatures = $derived(
		seq
			? [
					{
						type: partFeatureType(partType),
						name: String(row?.name ?? 'part'),
						start: 1,
						end: seq.length,
						strand: 1 as const
					}
				]
			: []
	);

	async function copySeq() {
		try {
			await navigator.clipboard.writeText(seq);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			/* clipboard unavailable — no-op */
		}
	}

	const vectorColumns: Column<BiobrickVector>[] = [
		{ key: 'name', label: tr('f_name'), format: (v) => String(v.name ?? v.id).slice(0, 32) },
		{ key: 'role', label: tr('f_role'), format: (v) => (v.role ? String(v.role) : '—') },
		{
			key: 'linkedAt',
			label: tr('f_linkedAt'),
			format: (v) => (v.linkedAt != null ? fmtTime(v.linkedAt) : '—')
		}
	];
	const xrefColumns: Column<Record<string, unknown>>[] = [
		{ key: 'source', label: tr('f_source') },
		{ key: 'url', label: 'URL', format: (x) => String(x.url ?? '—') }
	];
	const paramColumns: Column<[string, unknown]>[] = [
		{ key: 'key', label: tr('f_parameters'), format: ([k]) => k },
		{
			key: 'value',
			label: 'Value',
			format: ([, v]) => (typeof v === 'object' ? JSON.stringify(v) : String(v))
		}
	];

	const usageCount = $derived(Number(metadata.usageCount ?? 0));
</script>

{#if error}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		{error}
	</div>
{:else if row}
	<div class="space-y-4">
		<!-- iGEM leads with the part number, then role/composition badges -->
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold">{String(row.name ?? '')}</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<Badge tone="info">{enumLabel('part', String(row.partType ?? ''))}</Badge>
					{#if seqLen}<span>{seqLen} bp</span>{/if}
					{#if seq}<span>GC {comp.gc}%</span>{/if}
					{#if metadata.status}<Badge
							tone={String(metadata.status) === 'published' ? 'ok' : 'muted'}
							>{enumLabel('st', String(metadata.status))}</Badge
						>{/if}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					<code class="font-mono break-all">{String(row.id)}</code>
				</p>
			</div>
			<PageTools />
			<IssuePanel
				entityType="biobrick"
				entityId={String(row.id)}
				onannotate={() => (tab = 'community')}
			/>
			<RecordActions
				entityType="biobrick"
				id={String(row.id)}
				name={String(row.name ?? row.id)}
				href={`/biobricks/${row.id}`}
				record={row}
			/>
			{#if crossRefs.length}
				<div class="flex flex-wrap gap-2">
					{#each crossRefs as x, i (i)}
						{#if x.url}
							<a class="underline text-xs" href={String(x.url)} target="_blank" rel="noopener"
								>{String(x.source ?? 'link')} ↗</a
							>
						{/if}
					{/each}
				</div>
			{/if}
		</div>

		<!-- at-a-glance tiles mirror the iGEM fact grid -->
		<div class="grid grid-cols-5 gap-2">
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'sequence')}
			>
				<p class="text-lg font-semibold tabular-nums">{seqLen || '—'}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('f_length')} (bp)</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'sequence')}
			>
				<p class="text-lg font-semibold tabular-nums">{seq ? `${comp.gc}%` : '—'}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('biobrick_gc')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'sequence')}
			>
				<p class="text-lg font-semibold tabular-nums">
					{seq ? `A${comp.A} T${comp.T} G${comp.G} C${comp.C}` : '—'}
				</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('biobrick_base_comp')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'used')}
			>
				<p class="text-lg font-semibold tabular-nums">{usageCount || '—'}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('f_usageCount')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'used')}
			>
				<p class="text-lg font-semibold tabular-nums">{vectors.length}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('browse_vectors')}</p>
			</Button>
		</div>

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'overview', label: tr('tab_overview') },
				{ key: 'sequence', label: tr('vector_tab_sequence') },
				{ key: 'parameters', label: tr('f_parameters'), badge: paramEntries.length },
				{ key: 'used', label: tr('biobrick_tab_used'), badge: vectors.length },
				{ key: 'community', label: tr('protein_tab_community') }
			]}
		/>

		{#if tab === 'overview'}
			<div class="grid gap-4 lg:grid-cols-2">
				<Section title={tr('biobrick_key_facts')}>
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
						<dt class="text-muted-foreground">{tr('f_name')}</dt>
						<dd>{String(row.name ?? '')}</dd>
						<dt class="text-muted-foreground">{tr('f_partType')}</dt>
						<dd>{enumLabel('part', String(row.partType ?? ''))}</dd>
						{#if metadata.registryRole}
							<dt class="text-muted-foreground">{tr('biobrick_registry_role')}</dt>
							<dd>{String(metadata.registryRole)}</dd>
						{/if}
						<dt class="text-muted-foreground">{tr('f_length')}</dt>
						<dd>{seqLen ? `${seqLen} bp` : '—'}</dd>
						{#if seq}
							<dt class="text-muted-foreground">{tr('biobrick_gc')}</dt>
							<dd>{comp.gc}%</dd>
						{/if}
						{#if metadata.registryLicense}
							<dt class="text-muted-foreground">{tr('f_license')}</dt>
							<dd>{String(metadata.registryLicense).toUpperCase()}</dd>
						{/if}
						{#if metadata.source}
							<dt class="text-muted-foreground">{tr('f_source')}</dt>
							<dd>{String(metadata.source)}</dd>
						{/if}
						<dt class="text-muted-foreground">{tr('f_createdAt')}</dt>
						<dd>{row.createdAt != null ? fmtTime(Number(row.createdAt)) : '—'}</dd>
						{#if row.sha256}
							<dt class="text-muted-foreground">{tr('f_sha256')}</dt>
							<dd class="break-all font-mono text-xs">{String(row.sha256)}</dd>
						{/if}
					</dl>
					{#if chassis && (chassis.designedFor?.length || chassis.characterisedIn?.length || chassis.sourceOrganism?.length)}
						<div class="mt-3 space-y-1 border-t pt-2 text-sm">
							<p class="text-xs font-semibold text-muted-foreground">{tr('biobrick_chassis')}</p>
							{#if chassis.designedFor?.length}
								<p class="text-xs">
									<span class="text-muted-foreground">{tr('biobrick_designed_for')}:</span>
									{chassis.designedFor.join(', ')}
								</p>
							{/if}
							{#if chassis.characterisedIn?.length}
								<p class="text-xs">
									<span class="text-muted-foreground">{tr('biobrick_characterised_in')}:</span>
									{chassis.characterisedIn.join(', ')}
								</p>
							{/if}
							{#if chassis.sourceOrganism?.length}
								<p class="text-xs">
									<span class="text-muted-foreground">{tr('biobrick_source_organism')}:</span>
									{chassis.sourceOrganism.join(', ')}
								</p>
							{/if}
						</div>
					{/if}
					{#if metadata.importNote}
						<p class="mt-3 border-t pt-2 text-xs text-muted-foreground">
							{tr('biobrick_import_note')}: {String(metadata.importNote)}
						</p>
					{/if}
				</Section>
				<div class="space-y-4">
					<Section title={tr('biobrick_functional_desc')}>
						{#if description}<p class="text-sm leading-6">{description}</p>
						{:else}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>{/if}
					</Section>
					<Section title={tr('f_categories')}>
						{#if categories.length}
							<div class="flex flex-wrap gap-1.5">
								<span class="break-words">{categories.join(' · ')}</span>
							</div>
						{:else}
							<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
						{/if}
					</Section>
				</div>
			</div>
			{#if crossRefs.length}
				<Section title={tr('f_crossReferences')}>
					<DataTable rows={crossRefs} columns={xrefColumns} />
				</Section>
			{/if}
		{:else if tab === 'sequence'}
			<div class="flex flex-wrap items-center gap-2">
				<Button size="xs" variant="outline" onclick={copySeq} disabled={!seq}
					>{copied ? tr('common_copied') : tr('common_copy')}</Button
				>
				<ExportMenu
					formats={[
						{
							key: 'fasta',
							label: 'FASTA',
							filename: `${exportBase}.fasta`,
							disabled: !seq,
							build: () =>
								toFasta({
									name: String(row?.name ?? 'biobrick'),
									description: exportDescription,
									sequence: seq,
									molecule: 'dna'
								})
						},
						{
							key: 'genbank',
							label: tr('export_genbank'),
							filename: `${exportBase}.gb`,
							disabled: !seq,
							build: () =>
								toGenbank({
									name: String(row?.name ?? 'biobrick'),
									description: exportDescription,
									sequence: seq,
									molecule: 'dna',
									features: exportFeatures
								})
						},
						{
							key: 'sbol3',
							label: tr('export_sbol3'),
							filename: `${exportBase}.sbol3.json`,
							mime: 'application/json',
							disabled: !seq,
							build: () =>
								toSbol3({
									id: String(row?.id ?? ''),
									name: String(row?.name ?? 'biobrick'),
									description: exportDescription,
									sequence: seq,
									molecule: 'dna',
									role: partRole(partType)
								})
						}
					]}
				/>
			</div>
			<Section title={tr('vector_tab_sequence')}>
				{#if !seq}
					<p class="text-sm text-muted-foreground">{tr('biobrick_seq_none')}</p>
				{:else}
					<!-- SnapGene-style row renderer ported from the SPICE GUI:
					     ruler, complement strand, +5 spacing marks, selection -->
					<div class="gene-view" style="height: 480px;">
						<DnaViewer
							dnaSeq={seq}
							plasmidName={String(row.name ?? '')}
							restrictionSites={[]}
							geneFeatures={[]}
							parts={[]}
							primers={[]}
						/>
					</div>
				{/if}
			</Section>
		{:else if tab === 'parameters'}
			<Section title={tr('f_parameters')}>
				{#if paramEntries.length === 0}
					<p class="text-sm text-muted-foreground">{tr('biobrick_no_params')}</p>
				{:else}
					<DataTable rows={paramEntries} columns={paramColumns} />
				{/if}
			</Section>
		{:else if tab === 'used'}
			<Section title={tr('biobrick_tab_used')}>
				{#if usageCount}
					<p class="mb-2 text-xs text-muted-foreground">
						{tr('biobrick_used_in')} <b class="tabular-nums">{usageCount}</b>
						{tr('browse_biobricks').toLowerCase()} · {tr('biobrick_registry_usage_hint')}
					</p>
				{/if}
				{#if vectors.length === 0}
					<p class="text-sm text-muted-foreground">{tr('biobrick_no_vectors')}</p>
				{:else}
					<DataTable rows={vectors} columns={vectorColumns} hrefFor={(v) => `/vectors/${v.id}`} />
				{/if}
			</Section>
		{:else if tab === 'community'}
			<div class="grid gap-4 lg:grid-cols-2">
				<WikiPanel entityType="biobrick" entityId={String(row.id)} collapsible />
				<ReferencesPanel entityType="biobrick" entityId={String(row.id)} collapsible />
				<ProvenancePanel entityType="biobrick" entityId={String(row.id)} collapsible />
			</div>
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{/if}

<svelte:head><title>{String(row?.name ?? tr('browse_biobricks'))} · SPD</title></svelte:head>
