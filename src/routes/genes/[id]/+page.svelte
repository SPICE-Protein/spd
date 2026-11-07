<script lang="ts">
	import { page } from '$app/state';
	import { genes, restrictionEnzymes, external } from '$lib/api/client';
	import type { GeneRecord, GeneRegionRow } from '$lib/api/types';
	import { tr, enumLabel } from '$lib/i18n';
	import { displayRecordName, fmtTime, shortPublicId } from '$lib/format';
	import { session } from '$lib/state/session.svelte';
	import { toastOk, toastInfo, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';
	import IdLink from '$lib/components/IdLink.svelte';
	import TargetPicker from '$lib/components/TargetPicker.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import RelationsPanel from '$lib/components/RelationsPanel.svelte';
	import ExternalIdentifiersPanel from '$lib/components/ExternalIdentifiersPanel.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import EvidenceChain from '$lib/components/EvidenceChain.svelte';
	import ExportMenu from '$lib/components/ExportMenu.svelte';
	import RecordActions from '$lib/components/RecordActions.svelte';
	import DnaViewer from '$lib/gene/DnaViewer.svelte';
	import { fileStem, GENE, regionFeatureType, toFasta, toGenbank, toSbol3 } from '$lib/export/bio';
	import {
		REGION_TYPE_COLORS,
		regionsToViewerFeatures,
		scanDnaSites
	} from '$lib/gene/utils/geneView';

	/**
	 * Gene page (FEATURE_LIST §55). A gene record IS its asserted letters:
	 * the DNA and RNA strings live on the row, regions are append-only
	 * evidence with coordinates per molecule, and only an RNA CDS region may
	 * name the protein it encodes. Nothing here computes: the viewers render
	 * what the record quotes; a region that no longer fits an editorially
	 * shortened sequence stays in the table with an "unplaced" badge and is
	 * deliberately absent from the canvas (never clipped, never invented).
	 */
	const id = $derived(page.params.id ?? '');

	let row = $state<GeneRecord | null>(null);
	let regions = $state<GeneRegionRow[]>([]);
	let dnaCutters = $state<
		Array<{ name: string; recognitionSite?: unknown; cutPosition?: unknown }>
	>([]);
	let error = $state('');
	let tab = $state('overview');
	let loading = $state(false);

	async function load() {
		const gid = id;
		// Regions and the restriction-enzyme catalog only need the route id;
		// they no longer wait for the gene record to come back.
		const regionsP = genes.regions.list(gid).catch(() => null);
		const cuttersP = restrictionEnzymes.list(undefined, 'dna').catch(() => null);
		try {
			row = await genes.get(gid);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			row = null;
			return;
		}
		const [rd, cd] = await Promise.all([regionsP, cuttersP]);
		if (row?.id !== gid) return;
		regions = rd && Array.isArray(rd.items) ? rd.items : [];
		const items = !cd ? [] : Array.isArray(cd) ? cd : ((cd as { items?: unknown[] }).items ?? []);
		dnaCutters = (items as Array<Record<string, unknown>>)
			.filter((e) => String(e.targetMolecule ?? 'dna') === 'dna')
			.map((e) => ({
				name: String(e.name ?? ''),
				recognitionSite: e.recognitionSite,
				cutPosition: e.cutPosition
			}));
	}
	$effect(() => {
		if (id) void load();
	});

	const dnaSeq = $derived(String(row?.dnaSequence ?? ''));
	const rnaSeq = $derived(String(row?.rnaSequence ?? ''));
	const dnaRegions = $derived(regions.filter((r) => r.molecule === 'dna'));
	const rnaRegions = $derived(regions.filter((r) => r.molecule === 'rna'));
	const dnaView = $derived(regionsToViewerFeatures(dnaRegions, dnaSeq.length));
	const rnaView = $derived(regionsToViewerFeatures(rnaRegions, rnaSeq.length));
	const dnaSites = $derived(dnaSeq ? scanDnaSites(dnaSeq, dnaCutters) : []);
	const unplacedCount = $derived(dnaView.unplaced.length + rnaView.unplaced.length);
	const cdsRegions = $derived(regions.filter((r) => r.regionType === 'cds'));
	const linkedProteinIds = $derived([
		...new Set(
			cdsRegions
				.map((r) => r.proteinId)
				.filter((v): v is string => typeof v === 'string' && v.length > 0)
		)
	]);
	const linkedProteins = $derived(linkedProteinIds.length);
	const relatedActions = $derived(
		linkedProteinIds[0]
			? [
					{
						label: tr('action_new_sequence'),
						href: `/submit/sequence?proteinId=${linkedProteinIds[0]}`
					}
				]
			: []
	);

	const displayName = $derived(displayRecordName(row?.name, row?.symbol));
	const exportBase = $derived(fileStem(displayName, id));
	const exportDescription = $derived(
		String(row?.definition ?? row?.description ?? '')
			.replace(/<[^>]*>/g, '')
			.trim()
	);
	const genbankFeatures = $derived(
		dnaSeq
			? dnaRegions
					.filter(
						(r) =>
							r.startPosition != null &&
							r.endPosition != null &&
							r.endPosition >= r.startPosition &&
							r.endPosition <= dnaSeq.length
					)
					.map((r) => ({
						type: regionFeatureType(r.regionType),
						name: r.description,
						start: r.startPosition as number,
						end: r.endPosition as number,
						strand: (r.strand === 'reverse' ? -1 : 1) as 1 | -1
					}))
			: []
	);
	const exportFormats = $derived([
		{
			key: 'dna-fasta',
			label: tr('export_dna_fasta'),
			filename: `${exportBase}.dna.fasta`,
			disabled: !dnaSeq,
			build: () =>
				toFasta({
					name: displayName,
					description: exportDescription,
					sequence: dnaSeq,
					molecule: 'dna' as const
				})
		},
		{
			key: 'rna-fasta',
			label: tr('export_rna_fasta'),
			filename: `${exportBase}.rna.fasta`,
			disabled: !rnaSeq,
			build: () =>
				toFasta({
					name: displayName,
					description: exportDescription,
					sequence: rnaSeq,
					molecule: 'rna' as const
				})
		},
		{
			key: 'genbank',
			label: tr('export_genbank'),
			filename: `${exportBase}.gb`,
			disabled: !dnaSeq,
			build: () =>
				toGenbank({
					name: displayName,
					description: exportDescription,
					sequence: dnaSeq,
					molecule: 'dna' as const,
					circular: row?.topology === 'circular',
					features: genbankFeatures
				})
		},
		{
			key: 'sbol3',
			label: tr('export_sbol3'),
			filename: `${exportBase}.sbol3.json`,
			mime: 'application/json',
			disabled: !dnaSeq && !rnaSeq,
			build: () =>
				toSbol3({
					id,
					name: displayName,
					description: exportDescription,
					sequence: dnaSeq || rnaSeq,
					molecule: dnaSeq ? ('dna' as const) : ('rna' as const),
					role: GENE,
					type: GENE
				})
		}
	]);

	const organism = $derived(row?.organism ?? {});
	const organismLabel = $derived(
		[organism.scientificName, organism.taxId ? `taxId ${organism.taxId}` : null]
			.filter(Boolean)
			.join(' · ')
	);
	const organismLineage = $derived(row?.organismLineage ?? []);
	const upstreamPresent = $derived(
		Boolean(
			row?.accession ||
			row?.accessionVersion ||
			row?.definition ||
			row?.keywords?.length ||
			row?.comment?.trim() ||
			row?.locusTag ||
			row?.ncbiGeneId != null ||
			row?.moleculeType ||
			row?.topology ||
			row?.division ||
			row?.chromosome ||
			row?.mapLocation ||
			row?.strand ||
			row?.organismCommonName ||
			row?.organismLineage?.length ||
			row?.sequenceVersion != null
		)
	);

	function topologyLabel(v: string | null | undefined): string {
		if (v === 'linear' || v === 'circular') return tr(`ln_topology_${v}`);
		return v ?? '';
	}
	function strandLabel(v: string | null | undefined): string {
		if (v === 'forward' || v === 'reverse' || v === 'unknown') return tr(`ln_strand_${v}`);
		return '';
	}
	function strandGlyph(v: string | null | undefined): string {
		if (v === 'forward') return '→';
		if (v === 'reverse') return '←';
		if (v === 'unknown') return '?';
		return '—';
	}

	// A region's `/protein_id` is upstream evidence (NP_033894.3), not an SPD
	// address. Clicking it resolves through the one federation door: an
	// existing local protein is returned from the ledger, otherwise its
	// UniProt record is imported. An unbound CDS region is then bound in the
	// same gesture — the click is the statement that this protein is the one
	// the region encodes. A region that already names a protein keeps that
	// claim and the click simply opens it.
	let resolvingProtein = $state('');
	async function openExternalProtein(region: GeneRegionRow, accession: string) {
		resolvingProtein = accession;
		try {
			const r = await external.resolveProtein(accession);
			if (session.canWrite && region.regionType === 'cds' && !region.proteinId) {
				await genes.regions.linkProtein(region.id, r.publicId);
				toastOk(tr('gene_external_protein_bound'));
				await load();
				resolvingProtein = '';
				return;
			}
			location.href = r.route;
		} catch (e) {
			toastErr(e);
			resolvingProtein = '';
		}
	}

	async function removeGene() {
		if (!row) return;
		if (!confirm(tr('entity_remove_confirm'))) return;
		try {
			await genes.remove(id);
			toastOk(tr('entity_removed'));
			location.href = '/genes';
		} catch (e) {
			toastErr(e);
		}
	}

	// ------------------------------------------------ add-region dialog ----
	const GRT_KEYS = [
		'promoter',
		'operator',
		'enhancer',
		'silencer',
		'tata_box',
		'caat_signal',
		'terminator',
		'origin',
		'exon',
		'intron',
		'five_prime_utr',
		'three_prime_utr',
		'cds',
		'rnase_site',
		'other'
	];
	const REGION_MOLECULES = ['dna', 'rna'];
	let showRegion = $state(false);
	let regionValues = $state<Record<string, string>>({
		molecule: 'dna',
		regionType: 'promoter',
		description: ''
	});
	let regionError = $state('');
	let savingRegion = $state(false);

	const regionFields = $derived.by((): FormField[] => {
		const fields: FormField[] = [
			{ name: 'molecule', kind: 'select', required: true, ns: 'mol', options: REGION_MOLECULES },
			{ name: 'regionType', kind: 'select', required: true, ns: 'grt', options: GRT_KEYS },
			{ name: 'startPosition', kind: 'number', label: tr('f_startPosition') },
			{ name: 'endPosition', kind: 'number', label: tr('f_endPosition') },
			{
				name: 'description',
				kind: 'textarea',
				required: true,
				rows: 3,
				label: tr('f_description'),
				placeholder: tr('gene_region_desc_placeholder')
			}
		];
		if (regionValues.regionType === 'cds') {
			fields.push({
				name: 'proteinId',
				picker: 'protein',
				label: tr('f_proteinId'),
				hint: tr('gene_cds_protein_only_hint')
			});
		}
		return fields;
	});

	const regionOutOfRange = $derived.by(() => {
		const start = String(regionValues.startPosition ?? '').trim();
		const end = String(regionValues.endPosition ?? '').trim();
		if (start === '' || end === '') return false;
		const s = Number(start);
		const e = Number(end);
		const len = regionValues.molecule === 'dna' ? dnaSeq.length : rnaSeq.length;
		if (!len) return true; // open assertion — no sequence to be past
		return !(s >= 1 && e >= s && e <= len);
	});

	function openRegionDialog() {
		regionError = '';
		regionValues = { molecule: 'dna', regionType: 'promoter', description: '' };
		showRegion = true;
	}

	async function addRegion() {
		regionError = '';
		const { body, error: parseErr } = buildSafe(regionValues, regionFields);
		if (parseErr || !body) return (regionError = parseErr ?? '');
		if (regionOutOfRange) return (regionError = tr('gene_region_out_of_range'));
		savingRegion = true;
		try {
			const r = await genes.regions.add(id, [body] as never);
			if (r.duplicates > 0 || !r.regions[0]?.created) toastInfo(tr('gene_region_duplicate'));
			else toastOk(tr('gene_region_added'));
			showRegion = false;
			regionValues = { molecule: 'dna', regionType: 'promoter', description: '' };
			await load();
		} catch (e) {
			regionError = e instanceof Error ? e.message : String(e);
			toastErr(e);
		} finally {
			savingRegion = false;
		}
	}

	// --------------------------------------------------- CDS protein link ----
	let linkRegion = $state<GeneRegionRow | null>(null);
	let linkPick = $state('');
	function openLink(region: GeneRegionRow) {
		linkRegion = region;
		linkPick = region.proteinId ?? '';
	}
	async function confirmLink() {
		if (!linkRegion || !linkPick) return;
		try {
			await genes.regions.linkProtein(linkRegion.id, linkPick);
			toastOk(tr('protein_link_bound'));
			linkRegion = null;
			await load();
		} catch (e) {
			toastErr(e);
		}
	}
	async function unlink(region: GeneRegionRow) {
		if (!confirm(tr('protein_link_unbind_confirm'))) return;
		try {
			await genes.regions.unlinkProtein(region.id);
			toastOk(tr('protein_link_unbound'));
			await load();
		} catch (e) {
			toastErr(e);
		}
	}

	function rangeText(r: GeneRegionRow): string {
		if (r.startPosition == null && r.endPosition == null) return tr('gene_region_open_range');
		if (r.startPosition == null) return `…${r.endPosition ?? ''}`;
		if (r.endPosition == null) return `${r.startPosition}…`;
		return `${r.startPosition}..${r.endPosition}`;
	}
	function isUnplaced(r: GeneRegionRow): boolean {
		const list = r.molecule === 'dna' ? dnaView.unplaced : rnaView.unplaced;
		return list.includes(r);
	}

	// The chain only asserts what this record (and its region rows) already
	// carry. Sequence, structure and validation live on the protein page, so
	// the last node hands off instead of pretending the gene page can see them.
	type ChainNode = {
		key: string;
		label: string;
		value?: string | null;
		href?: string | null;
		status: 'present' | 'partial' | 'missing';
		hint?: string | null;
	};
	const chainNodes: ChainNode[] = $derived.by(() => {
		const nodes: ChainNode[] = [
			{
				key: 'gene',
				label: tr('chain_gene'),
				value: displayName,
				href: `/genes/${id}`,
				status: 'present'
			},
			{
				key: 'rna',
				label: tr('chain_rna'),
				value: rnaSeq ? `${rnaSeq.length} nt` : null,
				status: rnaSeq ? 'present' : 'missing',
				hint: rnaSeq ? null : tr('evidence_chain_rna_missing')
			}
		];

		const firstCds = cdsRegions[0];
		nodes.push({
			key: 'cds',
			label: tr('chain_cds'),
			value: firstCds
				? `${rangeText(firstCds)}${cdsRegions.length > 1 ? ` +${cdsRegions.length - 1}` : ''}`
				: null,
			status: firstCds ? 'present' : 'partial',
			hint: firstCds
				? tr('evidence_chain_cds_count', { count: cdsRegions.length })
				: tr('evidence_chain_cds_missing')
		});

		if (linkedProteinIds.length === 0) {
			nodes.push({
				key: 'protein',
				label: tr('chain_protein'),
				value: null,
				status: 'missing',
				hint: tr('evidence_chain_protein_missing')
			});
		} else {
			for (const pid of linkedProteinIds) {
				nodes.push({
					key: `protein:${pid}`,
					label: tr('chain_protein'),
					value: shortPublicId(pid),
					href: `/proteins/${pid}`,
					status: 'present'
				});
			}
		}

		const primaryProtein = linkedProteinIds[0];
		nodes.push({
			key: 'chain_continue',
			label: tr('chain_continue'),
			value: primaryProtein ? shortPublicId(primaryProtein) : null,
			href: primaryProtein ? `/proteins/${primaryProtein}` : null,
			status: 'partial',
			hint: tr('chain_continue_hint')
		});
		return nodes;
	});
</script>

{#if error}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		{error}
	</div>
{:else if row}
	<div class="space-y-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold">{displayName}</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					{#if row.symbol && row.symbol !== displayName}
						<span class="font-medium">{row.symbol}</span>
					{/if}
					{#if organismLabel}<span class="break-words">{organismLabel}</span>{/if}
					{#if unplacedCount}<Badge tone="warn">{tr('gene_region_unplaced')} ×{unplacedCount}</Badge
						>{/if}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					<code class="font-mono break-all">{row.id}</code>
				</p>
			</div>
			<div class="flex flex-wrap items-center justify-end gap-2">
				<PageTools />
				<RecordActions
					entityType="gene"
					id={String(row.id)}
					name={displayName}
					href={`/genes/${row.id}`}
					record={row}
					related={relatedActions}
				/>
				<ExportMenu formats={exportFormats} />
				<IssuePanel
					entityType="gene"
					entityId={String(row.id)}
					onannotate={() => (tab = 'community')}
				/>
				{#if session.signedIn}
					<Button size="sm" variant="danger" onclick={removeGene}>{tr('common_delete')}</Button>
				{/if}
			</div>
		</div>

		<div class="grid grid-cols-5 gap-2">
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'regions')}
			>
				<p class="text-lg font-semibold tabular-nums">{row.dnaLength ?? '—'}</p>
				<p class="truncate text-[10px] text-muted-foreground">DNA (nt)</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'regions')}
			>
				<p class="text-lg font-semibold tabular-nums">{row.rnaLength ?? '—'}</p>
				<p class="truncate text-[10px] text-muted-foreground">RNA (nt)</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'regions')}
			>
				<p class="text-lg font-semibold tabular-nums">{regions.length}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('f_regions')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'regions')}
			>
				<p class="text-lg font-semibold tabular-nums">{cdsRegions.length}</p>
				<p class="truncate text-[10px] text-muted-foreground">{enumLabel('grt', 'cds')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'regions')}
			>
				<p class="text-lg font-semibold tabular-nums">{linkedProteins || '—'}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('nav_proteins')}</p>
			</Button>
		</div>

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'overview', label: tr('tab_overview') },
				{ key: 'regions', label: tr('f_regions'), badge: regions.length },
				{ key: 'community', label: tr('protein_tab_community') }
			]}
		/>

		{#if tab === 'overview'}
			<Section title={tr('evidence_chain_title')}>
				<EvidenceChain nodes={chainNodes} />
			</Section>
			<div class="grid gap-4 lg:grid-cols-2">
				<Section title={tr('gene_key_facts')} hint={tr('gene_hint_one_model')}>
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
						<dt class="text-muted-foreground">{tr('f_name')}</dt>
						<dd>{displayName}</dd>
						<dt class="text-muted-foreground">{tr('f_symbol')}</dt>
						<dd>{row.symbol ?? '—'}</dd>
						<dt class="text-muted-foreground">{tr('f_geneType')}</dt>
						<dd>{row.geneType ? enumLabel('gt', row.geneType) : '—'}</dd>
						<dt class="text-muted-foreground">{tr('f_organism')}</dt>
						<dd>{organismLabel || '—'}</dd>
						<dt class="text-muted-foreground">{tr('f_dnaLength')}</dt>
						<dd>{row.dnaLength != null ? `${row.dnaLength} nt` : tr('gene_seq_none')}</dd>
						<dt class="text-muted-foreground">{tr('f_rnaLength')}</dt>
						<dd>{row.rnaLength != null ? `${row.rnaLength} nt` : tr('gene_seq_none')}</dd>
						<dt class="text-muted-foreground">{tr('f_createdAt')}</dt>
						<dd>{row.createdAt != null ? fmtTime(Number(row.createdAt)) : '—'}</dd>
					</dl>
				</Section>
				<div class="space-y-4">
					<Section title={tr('common_details')}>
						{#if row.description}<p class="text-sm leading-6">{row.description}</p>
						{:else}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>{/if}
					</Section>
				</div>
			</div>
			<div class="grid gap-4 lg:grid-cols-2">
				<ExternalIdentifiersPanel entityType="gene" entityId={String(row.id)} />
				<RelationsPanel entityType="gene" entityId={String(row.id)} />
			</div>
			{#if upstreamPresent}
				<div class="grid gap-4 lg:grid-cols-2">
					{#if row.definition || row.keywords?.length}
						<Section title={tr('gene_upstream_group_identity')}>
							<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
								{#if row.definition}
									<dt class="text-muted-foreground">{tr('f_definition')}</dt>
									<dd class="leading-5">{row.definition}</dd>
								{/if}
								{#if row.keywords?.length}
									<dt class="text-muted-foreground">{tr('f_keywords')}</dt>
									<dd class="break-words">{row.keywords.join(' · ')}</dd>
								{/if}
							</dl>
						</Section>
					{/if}
					{#if row.moleculeType || row.topology || row.sequenceVersion != null || row.division}
						<Section title={tr('gene_upstream_group_sequence')}>
							<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
								{#if row.moleculeType}
									<dt class="text-muted-foreground">{tr('f_moleculeType')}</dt>
									<dd>{row.moleculeType}</dd>
								{/if}
								{#if row.topology}
									<dt class="text-muted-foreground">{tr('f_topology')}</dt>
									<dd>{topologyLabel(row.topology)}</dd>
								{/if}
								{#if row.sequenceVersion != null}
									<dt class="text-muted-foreground">{tr('f_sequenceVersion')}</dt>
									<dd>{row.sequenceVersion}</dd>
								{/if}
								{#if row.division}
									<dt class="text-muted-foreground">{tr('f_division')}</dt>
									<dd>{row.division}</dd>
								{/if}
							</dl>
						</Section>
					{/if}
					{#if row.chromosome || row.mapLocation || row.strand || row.locusTag || row.ncbiGeneId != null}
						<Section title={tr('gene_upstream_group_location')}>
							<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
								{#if row.locusTag}
									<dt class="text-muted-foreground">{tr('f_locusTag')}</dt>
									<dd class="font-mono text-xs">{row.locusTag}</dd>
								{/if}
								{#if row.ncbiGeneId != null}
									<dt class="text-muted-foreground">{tr('f_ncbiGeneId')}</dt>
									<dd class="font-mono text-xs">{row.ncbiGeneId}</dd>
								{/if}
								{#if row.chromosome}
									<dt class="text-muted-foreground">{tr('f_chromosome')}</dt>
									<dd>{row.chromosome}</dd>
								{/if}
								{#if row.mapLocation}
									<dt class="text-muted-foreground">{tr('f_mapLocation')}</dt>
									<dd class="font-mono text-xs">{row.mapLocation}</dd>
								{/if}
								{#if row.strand}
									<dt class="text-muted-foreground">{tr('f_strand')}</dt>
									<dd>{strandGlyph(row.strand)} {strandLabel(row.strand)}</dd>
								{/if}
							</dl>
						</Section>
					{/if}
					{#if row.organismCommonName || organismLineage.length}
						<Section title={tr('gene_upstream_group_organism')}>
							<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
								{#if row.organismCommonName}
									<dt class="text-muted-foreground">{tr('f_organismCommonName')}</dt>
									<dd>{row.organismCommonName}</dd>
								{/if}
								{#if organismLineage.length}
									<dt class="text-muted-foreground">{tr('f_lineage')}</dt>
									<dd class="text-xs">{organismLineage.join(' › ')}</dd>
								{/if}
							</dl>
						</Section>
					{/if}
					{#if row.comment?.trim()}
						<div class="lg:col-span-2">
							<Section title={tr('f_comment')}>
								<details>
									<summary class="cursor-pointer text-xs text-muted-foreground"
										>{tr('common_view')}</summary
									>
									<p class="mt-2 text-sm leading-5 whitespace-pre-line">{row.comment}</p>
								</details>
							</Section>
						</div>
					{/if}
				</div>
			{/if}
		{:else if tab === 'regions'}
			{#if dnaSeq}
				<Section title={`DNA · ${dnaSeq.length} nt`} hint={tr('gene_dna_sites_hint')}>
					<div class="gene-view" style="height: 420px;">
						<DnaViewer
							mode="dna"
							{dnaSeq}
							plasmidName={displayName}
							restrictionSites={dnaSites}
							geneFeatures={dnaView.features}
							parts={[]}
							primers={[]}
						/>
					</div>
				</Section>
			{/if}
			{#if rnaSeq}
				<Section title={`RNA · ${rnaSeq.length} nt`}>
					<div class="gene-view" style="height: 420px;">
						<DnaViewer
							mode="rna"
							dnaSeq={rnaSeq}
							plasmidName={displayName}
							restrictionSites={[]}
							geneFeatures={rnaView.features}
							parts={[]}
							primers={[]}
						/>
					</div>
				</Section>
			{/if}
			{#if !dnaSeq && !rnaSeq}
				<p class="text-sm text-muted-foreground">{tr('gene_seq_none')}</p>
			{/if}

			<Section title={tr('gene_regions_title')}>
				{#snippet actions()}
					{#if session.canWrite}
						<Button size="xs" variant="outline" onclick={openRegionDialog}
							>{tr('gene_region_add')}</Button
						>
					{/if}
				{/snippet}
				{#if !session.canWrite}
					<p class="mb-2 text-xs text-muted-foreground">{tr('feature_write_requires_researcher')}</p>
				{/if}
				{#if regions.length === 0}
					<p class="text-sm text-muted-foreground">{tr('gene_region_none')}</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b text-left text-xs text-muted-foreground">
									<th class="py-1.5 pr-3 font-medium">{tr('f_molecule')}</th>
									<th class="py-1.5 pr-3 font-medium">{tr('f_regionType')}</th>
									<th class="py-1.5 pr-3 font-medium">{tr('f_featureKey')}</th>
									<th class="py-1.5 pr-3 font-medium">
										<span class="inline-flex items-center gap-1">
											{tr('gene_col_range')}
											<InfoTip
												text={tr('gene_unplaced_hint')}
												label={`${tr('gene_col_range')} — ${tr('common_more_info')}`}
											/>
										</span>
									</th>
									<th class="py-1.5 pr-3 font-medium">{tr('f_strand')}</th>
									<th class="py-1.5 pr-3 font-medium">{tr('f_description')}</th>
									<th class="py-1.5 pr-3 font-medium">{tr('f_proteinId')}</th>
									<th class="py-1.5 pr-3 font-medium">{tr('gene_evidence_title')}</th>
								</tr>
							</thead>
							<tbody>
								{#each regions as r (r.id)}
									<tr class="border-b/60 border-b last:border-0">
										<td class="py-1.5 pr-3"
											><Badge tone={r.molecule === 'rna' ? 'info' : 'muted'}
												>{enumLabel('mol', r.molecule)}</Badge
											></td
										>
										<td class="py-1.5 pr-3">
											<span class="inline-flex items-center gap-1.5">
												<span
													class="inline-block size-2.5 rounded-none"
													style="background: {REGION_TYPE_COLORS[r.regionType] ??
														REGION_TYPE_COLORS.other}"
												></span>
												{enumLabel('grt', r.regionType)}
											</span>
										</td>
										<td class="py-1.5 pr-3">
											{#if r.featureKey}<span class="font-mono text-xs">{r.featureKey}</span>
											{:else}<span class="text-muted-foreground">—</span>{/if}
										</td>
										<td class="py-1.5 pr-3 font-mono text-xs tabular-nums">{rangeText(r)}</td>
										<td class="py-1.5 pr-3">
											<span
												class="font-mono"
												title={r.strand ? strandLabel(r.strand) : tr('f_strand')}
												>{strandGlyph(r.strand)}</span
											>
										</td>
										<td class="py-1.5 pr-3">
											{r.description}
											{#if isUnplaced(r)}<Badge tone="warn">{tr('gene_region_unplaced')}</Badge
												>{/if}
										</td>
										<td class="py-1.5 pr-3">
											{#if r.proteinId}
												<div class="flex flex-wrap items-center gap-2">
													<IdLink id={r.proteinId} />
													{#if session.canWrite && r.regionType === 'cds'}
														<Button size="xs" variant="outline" onclick={() => openLink(r)}
															>{tr('protein_link_rebind')}</Button
														>
														<Button size="xs" variant="ghost" onclick={() => void unlink(r)}
															>{tr('protein_link_unbind')}</Button
														>
													{/if}
												</div>
											{:else if session.canWrite && r.regionType === 'cds'}
												<Button size="xs" onclick={() => openLink(r)}
													>{tr('protein_link_bind')}</Button
												>
											{:else}
												<span class="text-muted-foreground">—</span>
											{/if}
											{#if r.externalProteinId && session.canWrite}
												<Button
													size="xs"
													variant="ghost"
													title={tr('gene_external_protein_hint')}
													disabled={resolvingProtein === r.externalProteinId}
													onclick={() => void openExternalProtein(r, r.externalProteinId!)}
												>
													{resolvingProtein === r.externalProteinId
														? tr('common_loading')
														: tr('gene_external_protein_resolve')}
												</Button>
											{/if}
										</td>
										<td class="py-1.5 pr-3 align-top">
											{#if r.location || r.qualifiers?.length}
												<details>
													<summary class="cursor-pointer text-xs text-muted-foreground"
														>{tr('gene_evidence_title')}</summary
													>
													<div
														class="mt-1 max-h-40 max-w-md overflow-auto rounded-none border bg-muted/30 p-2"
													>
														{#if r.location}
															<p
																class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
															>
																{tr('f_featureLocation')}
															</p>
															<p class="font-mono text-xs break-all">{r.location}</p>
														{/if}
														{#if r.qualifiers?.length}
															<p
																class="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
															>
																{tr('f_qualifiers')}
															</p>
															<ul class="space-y-0.5 font-mono text-xs">
																{#each r.qualifiers as q, qi (`${q.key}-${qi}`)}
																	<li class="break-all">
																		<span class="text-muted-foreground">{q.key}=</span>{q.value}
																	</li>
																{/each}
															</ul>
														{/if}
													</div>
												</details>
											{:else}
												<span class="text-muted-foreground" title={tr('gene_evidence_none')}>—</span
												>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Section>

			<Dialog
				open={linkRegion !== null}
				onclose={() => (linkRegion = null)}
				title={linkRegion?.proteinId ? tr('protein_link_rebind') : tr('protein_link_bind')}
				hint={tr('protein_link_hint')}
			>
				<div class="space-y-3">
					<TargetPicker
						entityType="protein"
						initial={linkRegion?.proteinId ? { id: linkRegion.proteinId } : undefined}
						onpick={(h) => (linkPick = h?.id ?? '')}
					/>
					<div class="flex justify-end gap-2">
						<Button variant="ghost" onclick={() => (linkRegion = null)}
							>{tr('common_cancel')}</Button
						>
						<Button onclick={confirmLink} disabled={!linkPick}>{tr('common_save')}</Button>
					</div>
				</div>
			</Dialog>

			<Dialog bind:open={showRegion} title={tr('gene_region_add')}>
				<div class="space-y-3">
					{#if regionError}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">
							{regionError}
						</p>{/if}
					<FormFields fields={regionFields} bind:values={regionValues} />
					{#if regionOutOfRange}
						<p class="text-xs text-destructive">{tr('gene_region_out_of_range')}</p>
					{/if}
					<div class="flex justify-end gap-2">
						<Button variant="ghost" onclick={() => (showRegion = false)}>{tr('common_cancel')}</Button>
						<Button onclick={addRegion} disabled={savingRegion}>{tr('gene_region_add')}</Button>
					</div>
				</div>
			</Dialog>
		{:else if tab === 'community'}
			<div class="grid gap-4 lg:grid-cols-2">
				<WikiPanel entityType="gene" entityId={String(row.id)} collapsible />
				<ReferencesPanel entityType="gene" entityId={String(row.id)} collapsible />
			</div>
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{/if}

<svelte:head><title>{displayName || tr('browse_genes')} · SPD</title></svelte:head>
