<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { BiobrickRegistry } from '$lib/api/types';
	import { biobricks, external } from '$lib/api/client';
	import { tr, enumLabel } from '$lib/i18n';
	import { session } from '$lib/state/session.svelte';
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
	import { projectionFormats } from '$lib/export/menu';

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
	/**
	 * The registry's chassis lists carry whole organism records (uuid, NCBI
	 * taxid, scientific/common name); older rows stored bare names. Both are
	 * read here, and the page shows the name either way.
	 */
	type ChassisEntry = string | { scientificName?: string; commonName?: string };
	interface Chassis {
		designedFor?: ChassisEntry[];
		characterisedIn?: ChassisEntry[];
		sourceOrganism?: ChassisEntry[];
	}

	function chassisNames(entries: ChassisEntry[] | undefined): string {
		return (entries ?? [])
			.map((e) => (typeof e === 'string' ? e : (e.scientificName ?? e.commonName ?? '')))
			.filter((name) => name)
			.join(', ');
	}

	let row = $state<Record<string, unknown> | null>(null);
	let registry = $state<BiobrickRegistry | null>(null);
	let vectors = $state<BiobrickVector[]>([]);
	let error = $state('');
	let tab = $state('overview');
	let copied = $state(false);
	let importing = $state(false);
	let importError = $state('');

	// A part page addressed by registry part number is also the way to ask
	// for a part SPD has not imported yet.
	const registryPart = $derived(/^BBa_[A-Za-z0-9_]{1,55}$/.test(id.trim()));
	const notHeld = $derived(registryPart && /not found/i.test(error));

	async function load() {
		try {
			const r = (await biobricks.get(id)) as unknown as Record<string, unknown>;
			vectors = Array.isArray(r.vectors) ? (r.vectors as BiobrickVector[]) : [];
			registry = (r.registry as BiobrickRegistry | undefined) ?? null;
			const { vectors: _drop, registry: _registry, ...core } = r;
			row = core;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}
	$effect(() => void load());

	async function importPart() {
		importing = true;
		importError = '';
		try {
			// The federation's import door, not a biobrick-specific one: a
			// part arrives the same way a protein or a reaction does.
			const part = await external.import('igem', id.trim());
			await goto(part.route, { invalidateAll: true });
		} catch (e) {
			importError = e instanceof Error ? e.message : String(e);
		} finally {
			importing = false;
		}
	}

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
	// Registry facts live in their own block (0068). Rows imported before that
	// kept the same values inside `metadata`; read either, prefer the block.
	const reg = $derived({
		status: registry?.status ?? (metadata.status as string | null | undefined) ?? null,
		role: registry?.role ?? (metadata.registryRole as string | null | undefined) ?? null,
		topology: registry?.topology ?? null,
		license: registry?.license ?? (metadata.registryLicense as string | null | undefined) ?? null,
		usage: Number(registry?.usageCount ?? metadata.usageCount ?? 0),
		updatedAt: registry?.updatedAt ?? null
	});
	const chassis = $derived(
		registry?.chassis ??
			(metadata.chassis && typeof metadata.chassis === 'object'
				? (metadata.chassis as Chassis)
				: null)
	);
	const categories = $derived(Array.isArray(row?.categories) ? (row.categories as string[]) : []);
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
	const paramColumns: Column<[string, unknown]>[] = [
		{ key: 'key', label: tr('f_parameters'), format: ([k]) => k },
		{
			key: 'value',
			label: 'Value',
			format: ([, v]) => (typeof v === 'object' ? JSON.stringify(v) : String(v))
		}
	];

	const usageCount = $derived(reg.usage);
</script>

{#if error}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		{error}
	</div>
	{#if notHeld && session.canWrite}
		<div class="mt-3 flex flex-wrap items-center gap-3 border border-border bg-muted/30 p-4 text-sm">
			<span>{tr('biobrick_not_held')}</span>
			<Button size="sm" disabled={importing} onclick={importPart}>
				{importing ? tr('common_loading') : tr('biobrick_import_registry')}
			</Button>
			{#if importError}<span class="text-destructive">{importError}</span>{/if}
		</div>
	{/if}
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
					{#if reg.status}<Badge
							tone={String(reg.status) === 'published' ? 'ok' : 'muted'}
							>{enumLabel('st', String(reg.status))}</Badge
						>{/if}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					<code class="font-mono break-all">{String(row.id)}</code>
				</p>
				<!-- The one place that says where this record came from. -->
				{#if registry?.name}
					<p class="mt-1 text-xs text-muted-foreground">
						{tr('f_source')}:
						<a
							class="underline underline-offset-2"
							href={`https://registry.igem.org/Part:${registry.name}`}
							target="_blank"
							rel="noreferrer"
							title={metadata.importNote ? String(metadata.importNote) : undefined}
							>{tr('ext_source_igem')} ↗</a
						>
					</p>
				{/if}
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
						{#if reg.topology}
							<dt class="text-muted-foreground">{tr('f_topology')}</dt>
							<dd>
								{reg.topology.toLowerCase() === 'linear'
									? tr('ln_topology_linear')
									: reg.topology.toLowerCase() === 'circular'
										? tr('ln_topology_circular')
										: String(reg.topology)}
							</dd>
						{/if}
						<dt class="text-muted-foreground">{tr('f_length')}</dt>
						<dd>{seqLen ? `${seqLen} bp` : '—'}</dd>
						{#if seq}
							<dt class="text-muted-foreground">{tr('biobrick_gc')}</dt>
							<dd>{comp.gc}%</dd>
						{/if}
						{#if reg.license}
							<dt class="text-muted-foreground">{tr('f_license')}</dt>
							<dd>{String(reg.license).toUpperCase()}</dd>
						{/if}
						<dt class="text-muted-foreground">{tr('f_createdAt')}</dt>
						<dd>{row.createdAt != null ? fmtTime(Number(row.createdAt)) : '—'}</dd>
						{#if reg.updatedAt}
							<dt class="text-muted-foreground">{tr('f_updatedAt')}</dt>
							<dd>{fmtTime(Number(reg.updatedAt))}</dd>
						{/if}
						{#if row.sha256}
							<dt class="text-muted-foreground">{tr('f_sha256')}</dt>
							<dd class="break-all font-mono text-xs">{String(row.sha256)}</dd>
						{/if}
					</dl>
					{#if chassis && (chassis.designedFor?.length || chassis.characterisedIn?.length || chassis.sourceOrganism?.length)}
						<div class="mt-3 space-y-1 border-t pt-2 text-sm">
							<p class="text-xs font-semibold text-muted-foreground">{tr('biobrick_chassis')}</p>
							{#if chassisNames(chassis.designedFor)}
								<p class="text-xs">
									<span class="text-muted-foreground">{tr('biobrick_designed_for')}:</span>
									{chassisNames(chassis.designedFor)}
								</p>
							{/if}
							{#if chassisNames(chassis.characterisedIn)}
								<p class="text-xs">
									<span class="text-muted-foreground">{tr('biobrick_characterised_in')}:</span>
									{chassisNames(chassis.characterisedIn)}
								</p>
							{/if}
							{#if chassisNames(chassis.sourceOrganism)}
								<p class="text-xs">
									<span class="text-muted-foreground">{tr('biobrick_source_organism')}:</span>
									{chassisNames(chassis.sourceOrganism)}
								</p>
							{/if}
						</div>
					{/if}
				</Section>
				<div class="space-y-4">
					<Section title={tr('biobrick_functional_desc')}>
						{#if description}<p class="text-sm leading-6">{description}</p>
						{:else}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>{/if}
					</Section>
					{#if categories.length}
						<Section title={tr('f_categories')}>
							<span class="break-words text-sm">{categories.join(' · ')}</span>
						</Section>
					{/if}
				</div>
			</div>
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
						},
						...projectionFormats({
							base: exportBase,
							disabled: !seq,
							record: () => ({
								name: String(row?.name ?? 'biobrick'),
								description: exportDescription,
								sequence: seq,
								molecule: 'dna' as const,
								features: exportFeatures
							}),
							meta: () => ({ id: String(row?.id ?? ''), role: partRole(partType) }),
							json: () => row ?? {}
						})
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
						{tr('biobrick_used_in', { n: usageCount })}
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
