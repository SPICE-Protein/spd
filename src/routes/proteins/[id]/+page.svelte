<script lang="ts">
	import { page } from '$app/state';
	import {
		proteins,
		sequences,
		search,
		graphQuery,
		folds,
		interactions,
		comparisons,
		firstArray,
		enzymes,
		restrictionEnzymes,
		genes
	} from '$lib/api/client';
	import { SpdApiError } from '$lib/api/base';
	import type {
		ArtifactRecord,
		ComparisonRow,
		EnvironmentRecord,
		FoldRecord,
		GeneListRow,
		GeneRecord,
		GeneRegionRow,
		InteractionRow,
		ObservedStructureRecord,
		ProteinAnnotationRecord,
		ProteinRecord,
		SequenceMutationMapData,
		SequenceRecord,
		SequenceStructureCandidatesData,
		SequenceStructuresData,
		ValidationDigest
	} from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { displayRecordName, fmtTime, shortPublicId } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/components/table';
	import IdLink from '$lib/components/IdLink.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import ProvenancePanel from '$lib/components/ProvenancePanel.svelte';
	import RelationsPanel from '$lib/components/RelationsPanel.svelte';
	import ExternalIdentifiersPanel from '$lib/components/ExternalIdentifiersPanel.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import RecordActions from '$lib/components/RecordActions.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';
	import RangeSlider from '$lib/components/RangeSlider.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import MolViewer from '$lib/components/mol/MolViewer.svelte';
	import StructureCandidates from '$lib/components/StructureCandidates.svelte';
	import MutationMap from '$lib/components/MutationMap.svelte';
	import EvidenceChain from '$lib/components/EvidenceChain.svelte';
	import type { ChainNode } from '$lib/components/EvidenceChain.svelte';
	import DnaViewer from '$lib/gene/DnaViewer.svelte';
	import {
		annotationsToViewerFeatures,
		FEATURE_DEFAULT_COLOR,
		FEATURE_TYPE_COLORS,
		PROTEIN_FEATURE_TYPES
	} from '$lib/gene/utils/proteinView';

	const id = $derived(page.params.id ?? '');

	let protein = $state<ProteinRecord | null>(null);
	let seqRows = $state<SequenceRecord[]>([]);
	let loading = $state(true);
	let error = $state('');
	let tab = $state('overview');
	// Feature rows (0034) pinned to the canonical sequence. The features tab
	// drives the protein-mode viewer with them; a missing/failed read just
	// means an empty feature track, never a broken page.
	let annotations = $state<ProteinAnnotationRecord[]>([]);
	let annSeq = $state<SequenceRecord | null>(null);
	let aaTheme = $state<'aa_family' | 'aa_chem'>('aa_family');
	// Table-row → viewer selection bridge (bindable props on DnaViewer).
	let featStart = $state(1);
	let featEnd = $state(1);

	const relatedActions = $derived(
		protein
			? [
					{
						label: tr('action_new_sequence'),
						href: `/submit/sequence?proteinId=${protein.id}&proteinName=${encodeURIComponent(protein.preferredName ?? '')}`
					}
				]
			: []
	);

	/**
	 * First paint waits only for the protein record. Everything else needs
	 * nothing but the route id, so it starts at the same time and streams
	 * into its tab instead of extending a serial waterfall:
	 *   protein.get ─┐
	 *   annotations  ─┤ (parallel)
	 *   gene regions ─┤
	 *   graph walk   ─┘
	 * `protein` unblocks the page at ~0.7s; the remaining reads land as the
	 * tabs and counters need them.
	 */
	async function load() {
		loading = true;
		const pid = id;
		const proteinP = proteins.get(pid);
		const annotationsP = proteins.annotations(pid).catch(() => null);
		const geneRegionsP = genes.regions.byProtein(pid).catch(() => null);
		// One DSL walk yields both the sequence rows and (on the standard
		// tier) their folds — the old code paid for two separate walks.
		const graphP = loadSequenceGraph(pid);

		try {
			protein = await proteinP;
		} catch (e) {
			error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
			protein = null;
			loading = false;
			return;
		}
		loading = false;
		communityLoaded = false;

		// Features ride on the canonical sequence; the per-sequence read
		// answers even bare rows, and a failed read leaves the track empty.
		void annotationsP.then(async (ann) => {
			if (protein?.id !== pid) return;
			annotations = ann?.annotations ?? [];
			if (ann?.sequenceId) {
				annSeq = await sequences.get(ann.sequenceId).catch(() => null);
			}
		});

		void geneRegionsP.then((gs) => {
			if (!gs || protein?.id !== pid) return;
			geneRows = firstArray<GeneRegionRow>(gs, 'items');
			cdsRows = geneRows;
			const geneId = geneRows[0]?.geneId;
			if (!geneId) {
				if (protein) findCandidateGene(protein);
				return;
			}
			void genes
				.get(geneId)
				.then((g) => {
					if (protein?.id === pid) geneRecord = g;
				})
				.catch(() => {
					if (protein?.id === pid) geneRecord = null;
				});
		});

		void graphP
			.then(({ seqs, folds, foldsCovered }) => {
				if (protein?.id !== pid) return;
				seqRows = seqs;
				expTotal = seqs.length;
				expDone = seqs.length;
				if (foldsCovered) {
					// The same walk already paid for the folds; only the batched
					// environment reads and evidence remain.
					void settleFolds(folds).catch((e) => {
						if (protein?.id === pid) expError = e instanceof Error ? e.message : String(e);
					});
				} else {
					// Anonymous tier: protein → sequences is depth 1, folds are
					// one level deeper than the walk allows.
					void loadExplorer();
				}
			})
			.catch(() => {
				if (protein?.id === pid) seqRows = [];
			});
	}
	$effect(() => void load());

	/**
	 * A gene record exists long before anyone asserts which CDS encodes this
	 * protein. Match the protein's own symbol + organism against the gene
	 * index so the upstream chain can show that record and send the reader to
	 * the gene page to make the link explicit.
	 */
	function findCandidateGene(p: ProteinRecord) {
		const symbol = p.geneName?.trim().toLowerCase();
		if (!symbol) {
			candidateGene = null;
			return;
		}
		const organism = p.organism?.scientificName?.trim().toLowerCase() ?? '';
		void genes
			.list()
			.then(({ items }) => {
				if (protein?.id !== p.id) return;
				const sameSymbol = items.filter((g) => (g.symbol ?? '').toLowerCase() === symbol);
				candidateGene =
					sameSymbol.find(
						(g) => organism && (g.organismScientificName ?? '').toLowerCase() === organism
					) ??
					sameSymbol[0] ??
					null;
			})
			.catch(() => {
				if (protein?.id === p.id) candidateGene = null;
			});
	}

	/**
	 * One graph walk for the two edges the page always needs. The deep walk
	 * (protein → sequences → folds) is available to standard/unlimited
	 * sessions; anonymous depth 2 falls back to sequences-only, and the
	 * search API stays the last resort for tiers whose budget cannot pay for
	 * the edge at all.
	 */
	async function loadSequenceGraph(
		pid: string
	): Promise<{ seqs: SequenceRecord[]; folds: unknown[]; foldsCovered: boolean }> {
		try {
			const g = await graphQuery.run({
				root: {
					type: 'protein',
					id: pid,
					expand: { sequences: { limit: SEQ_CAP, expand: { folds: { limit: 100 } } } }
				}
			});
			const node = (g.results as Record<string, unknown>[])[0] ?? {};
			const seqNodes = Array.isArray(node.sequences)
				? (node.sequences as Record<string, unknown>[])
				: [];
			return {
				seqs: seqNodes as unknown as SequenceRecord[],
				folds: seqNodes.flatMap((s) => (Array.isArray(s.folds) ? s.folds : [])),
				foldsCovered: true
			};
		} catch {
			try {
				const g = await graphQuery.run({
					root: { type: 'protein', id: pid, expand: { sequences: { limit: 100 } } }
				});
				const node = (g.results as Record<string, unknown>[])[0] ?? {};
				return {
					seqs: (Array.isArray(node.sequences)
						? node.sequences
						: []) as unknown as SequenceRecord[],
					folds: [],
					foldsCovered: false
				};
			} catch {
				const env = await search.run({ q: pid, entityType: 'sequence', limit: 100 });
				return {
					seqs: (Array.isArray(env.data) ? env.data : [])
						.map((h) => h.payload as unknown as SequenceRecord)
						.filter((s) => !!s?.id),
					folds: [],
					foldsCovered: false
				};
			}
		}
	}

	const FIELDS: FormField[] = [
		{
			name: 'sequence',
			kind: 'textarea',
			required: true,
			rows: 6,
			hint: tr('sequence_hint_letters')
		},
		{ name: 'parentSequenceId', picker: 'sequence', hint: tr('sequence_hint_parent') },
		{ name: 'mutations', kind: 'objectList', hint: tr('sequence_hint_mutations') },
		{ name: 'tags', kind: 'list' },
		{ name: 'license', kind: 'select', options: ['CC-BY-4.0'] }
	];

	let showAdd = $state(false);
	let values = $state<Record<string, string>>({ license: 'CC-BY-4.0' });
	let formError = $state('');
	let saving = $state(false);

	async function addSequence() {
		formError = '';
		const { body, error: parseErr } = buildSafe(values, FIELDS);
		if (parseErr || !body) return (formError = parseErr ?? '');
		if (!body.sequence) return (formError = tr('form_required_missing'));
		saving = true;
		try {
			const receipt = await sequences.create({ ...body, proteinId: protein?.id } as never);
			toastOk(receipt.created ? tr('sequence_created') : tr('sequence_deduplicated'));
			showAdd = false;
			values = { license: 'CC-BY-4.0' };
			await load();
		} catch (e) {
			formError = e instanceof Error ? e.message : String(e);
			toastErr(e);
		} finally {
			saving = false;
		}
	}

	// Feature authoring mirrors the gene-region row: additive, researcher-gated,
	// and pinned to the canonical sequence by the server. External accessions
	// are provenance and never appear in the label itself.
	const FEATURE_FIELDS: FormField[] = [
		{ name: 'featureType', kind: 'select', required: true, ns: 'ft', options: PROTEIN_FEATURE_TYPES },
		{ name: 'startPosition', kind: 'number', label: tr('f_startPosition') },
		{ name: 'endPosition', kind: 'number', label: tr('f_endPosition') },
		{ name: 'residue', label: tr('f_residue') },
		{ name: 'description', kind: 'textarea', required: true, rows: 3, label: tr('ft_col_description') },
		{ name: 'evidenceText', kind: 'textarea', rows: 2, label: tr('f_evidence') }
	];
	let showFeature = $state(false);
	let featureValues = $state<Record<string, string>>({ featureType: 'DOMAIN' });
	let featureError = $state('');
	let savingFeature = $state(false);

	async function reloadAnnotations() {
		const ann = await proteins.annotations(id).catch(() => null);
		annotations = ann?.annotations ?? [];
		if (ann?.sequenceId) annSeq = await sequences.get(ann.sequenceId).catch(() => null);
	}

	async function addFeature() {
		featureError = '';
		const { body, error: parseErr } = buildSafe(featureValues, FEATURE_FIELDS);
		if (parseErr || !body) return (featureError = parseErr ?? '');
		savingFeature = true;
		try {
			await proteins.createAnnotations(id, { annotations: [body] });
			toastOk(tr('protein_feature_created'));
			showFeature = false;
			featureValues = { featureType: 'DOMAIN' };
			await reloadAnnotations();
		} catch (e) {
			featureError = e instanceof Error ? e.message : String(e);
			toastErr(e);
		} finally {
			savingFeature = false;
		}
	}

	const seqColumns: Column<SequenceRecord>[] = [
		{ key: 'id', label: tr('seq_col_variant'), format: (r) => shortPublicId(r.id) },
		{
			key: 'sequenceRole',
			label: tr('f_sequenceRole'),
			format: (r) => tr(`seq_role_${r.sequenceRole ?? 'variant'}`)
		},
		{ key: 'length', label: tr('f_length') },
		{
			key: 'mutations',
			label: tr('f_mutations'),
			format: (r) => {
				if (!Array.isArray(r.mutations) || r.mutations.length === 0) return '—';
				return r.mutations
					.map((m) => {
						if (typeof m === 'string') return m;
						const mm = m as { from?: string; position?: number | string; to?: string };
						return `${mm.from ?? ''}${mm.position ?? ''}${mm.to ?? ''}`;
					})
					.filter(Boolean)
					.join(', ');
			}
		},
		{ key: 'createdAt', label: tr('f_createdAt'), format: (r) => fmtTime(r.createdAt) }
	];

	const tagList = $derived(Array.isArray(protein?.tags) ? (protein.tags as unknown[]) : []);

	function strList(v: unknown): string[] {
		return Array.isArray(v) ? v.map(String).filter((x) => x !== '') : [];
	}

	// Every value below is a source assertion stored on the protein row
	// (0033): the page quotes it, it derives nothing.
	const altNames = $derived(strList(protein?.altNames));
	const geneSynonyms = $derived(strList(protein?.geneSynonyms));
	const orfNames = $derived(strList(protein?.orfNames));
	const lineage = $derived(
		(Array.isArray(protein?.organismLineage)
			? (protein?.organismLineage as { value?: string }[])
			: []
		)
			.map((n) => n.value)
			.filter((v): v is string => typeof v === 'string' && v !== '')
	);
	const keywords = $derived(
		Array.isArray(protein?.keywords) ? (protein?.keywords as { name?: string }[]) : []
	);
	const visibleKeywords = $derived(keywords.slice(0, 8));
	const extraKeywordCount = $derived(Math.max(0, keywords.length - visibleKeywords.length));
	const comments = $derived(
		Array.isArray(protein?.comments)
			? (protein?.comments as { type?: string; texts?: unknown; evidence?: unknown }[])
			: []
	);
	const commentGroups = $derived(
		comments
			.map((c) => ({
				type: String(c.type ?? ''),
				texts: strList(c.texts),
				evidence: (Array.isArray(c.evidence)
					? (c.evidence as { source?: string; id?: string }[])
					: []
				).filter((e) => e && (e.source || e.id))
			}))
			.filter((g) => g.type !== '')
	);
	const featureRows = $derived(
		annotationsToViewerFeatures(annotations, annSeq?.length ?? Infinity)
	);
	const canonicalSeqText = $derived(annSeq?.normalizedSequence || annSeq?.sequence || '');
	const annotationSeqId = $derived(annotations[0]?.sequenceId ?? annSeq?.id ?? '');

	function selectFeature(a: ProteinAnnotationRecord) {
		if (a.startPosition == null || a.endPosition == null) return;
		featStart = a.startPosition;
		featEnd = a.endPosition;
	}

	function pubmedLink(e: { source?: string; id?: string }): string | null {
		if (String(e.source ?? '').toUpperCase() === 'PUBMED' && e.id) {
			return `https://pubmed.ncbi.nlm.nih.gov/${e.id}/`;
		}
		return null;
	}

	// ------------------------------------------------------------ explorer ----
	// SPICE studies folding across environments; sliders filter the protein's
	// fold corpus by the environment axes stored on SPD (pH / temperature /
	// ionic strength). SPD computes nothing — this only queries and filters.
	// Runs automatically once the sequences arrive: the Structures tab is the
	// PDB-style centrepiece, and an empty until-clicked panel would not be one.
	interface ExplorerFold {
		foldId: string;
		sequenceId?: string;
		environmentId?: string;
		modelIdentityId?: string;
		confidence?: number | null;
		verificationLevel?: string;
	}

	const K_MIN = 240;
	const K_MAX = 350;
	const SEQ_CAP = 100; // DSL list-edge cap (backend clamps to 100)
	const ENV_BATCH = 25; // graph batch cap; chunked below the 40-node tier budget

	let expFolds = $state<ExplorerFold[]>([]);
	let expEnvs = $state<Record<string, EnvironmentRecord>>({});
	let expLoading = $state(false);
	let expDone = $state(0);
	let expTotal = $state(0);
	let expError = $state('');
	let rPh = $state<[number, number]>([0, 14]);
	let rTemp = $state<[number, number]>([K_MIN, K_MAX]);
	let rIon = $state<[number, number]>([0, 2]);

	function toExplorerFold(f: unknown): ExplorerFold {
		const o = (f ?? {}) as Record<string, unknown>;
		return {
			foldId: String(o.publicId ?? o.id ?? ''),
			sequenceId: o.sequenceId ? String(o.sequenceId) : undefined,
			environmentId: o.environmentId ? String(o.environmentId) : undefined,
			modelIdentityId: o.modelIdentityId ? String(o.modelIdentityId) : undefined,
			confidence: typeof o.confidence === 'number' ? o.confidence : null,
			verificationLevel: o.verificationLevel ? String(o.verificationLevel) : undefined
		};
	}

	async function loadExplorer() {
		if (!protein || seqRows.length === 0) return;
		expLoading = true;
		expError = '';
		expFolds = [];
		expEnvs = {};
		expDone = 0;
		const seqIds = seqRows.slice(0, SEQ_CAP).map((s) => s.id);
		expTotal = seqIds.length;
		try {
			const foldNodes = await walkFolds(protein.id, seqIds);
			expDone = seqIds.length;
			await settleFolds(foldNodes);
		} catch (e) {
			expError = e instanceof Error ? e.message : String(e);
		} finally {
			expLoading = false;
		}
	}

	/** Folds for the explorer. Standard sessions get them from one deep walk;
	 *  anonymous depth 2 cannot leave the root's children, so its sequences
	 *  are walked in batched `roots` calls (one request per 10 sequences, not
	 *  one request per sequence). */
	async function walkFolds(pid: string, seqIds: string[]): Promise<unknown[]> {
		try {
			const g = await graphQuery.run({
				root: {
					type: 'protein',
					id: pid,
					expand: { sequences: { limit: SEQ_CAP, expand: { folds: { limit: 100 } } } }
				}
			});
			const node = (g.results as Record<string, unknown>[])[0] ?? {};
			const seqNodes = Array.isArray(node.sequences)
				? (node.sequences as Record<string, unknown>[])
				: [];
			return seqNodes.flatMap((s) => (Array.isArray(s.folds) ? s.folds : []));
		} catch {
			const foldNodes: unknown[] = [];
			const batch = 10; // 10 roots × (node + fold list) stays inside 40
			for (let i = 0; i < seqIds.length; i += batch) {
				const chunk = seqIds.slice(i, i + batch);
				try {
					const g = await graphQuery.run({
						roots: chunk.map((sid) => ({
							type: 'sequence',
							id: sid,
							expand: { folds: { limit: 100 } }
						}))
					});
					for (const r of g.results as Record<string, unknown>[]) {
						if (Array.isArray(r?.folds)) foldNodes.push(...r.folds);
					}
				} catch {
					/* partial corpus beats a hard failure; the env pass reports gaps */
				}
				expDone += chunk.length;
			}
			return foldNodes;
		}
	}

	/** Folds → environment axes → evidence. Split out so the page's first
	 *  graph walk can hand its folds straight in without walking twice. */
	async function settleFolds(foldNodes: unknown[]) {
		expLoading = true;
		expFolds = foldNodes.map(toExplorerFold).filter((f) => f.foldId);

		// Environment axes: batched root fetches (depth 0, every tier).
		// Results stay index-aligned with `roots` by contract.
		const envIds = [
			...new Set(expFolds.map((f) => f.environmentId).filter((x): x is string => !!x))
		];
		const resolved: Record<string, EnvironmentRecord> = {};
		const chunks: string[][] = [];
		for (let i = 0; i < envIds.length; i += ENV_BATCH) {
			chunks.push(envIds.slice(i, i + ENV_BATCH));
		}
		await Promise.all(
			chunks.map(async (chunk) => {
				try {
					const g = await graphQuery.run({
						roots: chunk.map((eid) => ({ type: 'environment', id: eid }))
					});
					(g.results as Record<string, unknown>[]).forEach((r, j) => {
						if (r && Object.keys(r).length) resolved[chunk[j]] = r as unknown as EnvironmentRecord;
					});
				} catch {
					/* counted as unresolved below */
				}
			})
		);
		expEnvs = resolved;
		const missing = envIds.filter((e) => !resolved[e]).length;
		if (missing > 0) expError = tr('env_explorer_env_partial', { n: missing });
		expLoading = false;
		void loadEvidence();
	}

	const shownFolds = $derived(
		expFolds.filter((f) => {
			const e = f.environmentId ? expEnvs[f.environmentId] : undefined;
			if (!e) return false;
			return (
				(e.ph ?? -1) >= rPh[0] &&
				(e.ph ?? Infinity) <= rPh[1] &&
				(e.temperatureK ?? -1) >= rTemp[0] &&
				(e.temperatureK ?? Infinity) <= rTemp[1] &&
				(e.ionicStrengthM ?? -1) >= rIon[0] &&
				(e.ionicStrengthM ?? Infinity) <= rIon[1]
			);
		})
	);
	const expStats = $derived({
		total: expFolds.length,
		shown: shownFolds.length,
		envs: new Set(expFolds.map((f) => f.environmentId).filter(Boolean)).size,
		mutants: new Set(shownFolds.map((f) => f.sequenceId).filter(Boolean)).size
	});

	const colC = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2));
	/** Coverage may arrive as a fraction or a percentage; render either. */
	const pctText = (v: number | null | undefined) =>
		v == null ? '—' : `${(v <= 1 ? v * 100 : v).toFixed(1)} %`;
	const kToC = (k?: number | null) => (k == null ? '—' : `${(k - 273.15).toFixed(0)} °C`);
	const expColumns: Column<ExplorerFold>[] = [
		{
			key: 'sequenceId',
			label: tr('f_sequenceId'),
			format: (r) => (r.sequenceId ? shortPublicId(r.sequenceId) : '—')
		},
		{
			key: 'ph',
			label: 'pH',
			format: (r) => String(r.environmentId ? (expEnvs[r.environmentId]?.ph ?? '—') : '—')
		},
		{
			key: 'temp',
			label: 'T',
			format: (r) => kToC(r.environmentId ? expEnvs[r.environmentId]?.temperatureK : null)
		},
		{
			key: 'ion',
			label: 'I (M)',
			format: (r) => colC(r.environmentId ? expEnvs[r.environmentId]?.ionicStrengthM : null)
		},
		{ key: 'confidence', label: tr('f_confidence'), format: (r) => colC(r.confidence) }
	];

	// ------------------------------------------------------- structure viewer --
	// PDB-style: picking a fold loads its record + coordinates artifacts and
	// renders them in the shared MolViewer right here on the protein page.
	let selFoldId = $state('');
	let selFold = $state<FoldRecord | null>(null);
	let selSeq = $state<SequenceRecord | null>(null);
	let selArts = $state<ArtifactRecord[]>([]);
	let selLoading = $state(false);

	async function selectFold(fid: string) {
		selFoldId = fid;
		selLoading = true;
		selFold = null;
		selSeq = null;
		selArts = [];
		// Artifacts are keyed by the fold id the click already has; only the
		// sequence read waits for the fold payload.
		const artsP = folds.artifacts(fid).catch(() => null);
		try {
			const f = await folds.get(fid);
			if (selFoldId !== fid) return;
			selFold = f;
			const [s, a] = await Promise.allSettled([
				f.sequenceId ? sequences.get(f.sequenceId) : Promise.resolve(null),
				artsP
			]);
			if (selFoldId !== fid) return;
			selSeq = s.status === 'fulfilled' ? (s.value as SequenceRecord) : null;
			// FoldArtifactsData declares a leaner artifact shape than the
			// catalog schema; the viewer only reads mediaType/objectKey anyway.
			selArts =
				a.status === 'fulfilled' && a.value
					? ((a.value.artifacts ?? []) as unknown as ArtifactRecord[])
					: [];
		} catch (e) {
			if (selFoldId === fid) toastErr(e);
		} finally {
			if (selFoldId === fid) selLoading = false;
		}
	}
	// first fold arrives with the corpus: show something, like rcsb.org does
	let autoSelected = $state(false);
	$effect(() => {
		if (!autoSelected && shownFolds.length > 0 && !selFoldId) {
			autoSelected = true;
			void selectFold(shownFolds[0].foldId);
		}
	});

	// ------------------------------------------------- bound observed fold --
	// §57 round 17: one sequence → one primary exact-match PDB structure. The
	// canonical sequence is the anchor: the native row when present, else the
	// annotations' sequence, else the first sequence (a chain without a native
	// flag still has a concrete address). The engine stability domain is a
	// property of that sequence version, so it lives on /sequences/{id}.
	const boundSequence = $derived(annSeq ?? seqRows.find((s) => s.isNative) ?? seqRows[0] ?? null);
	let observedStructures = $state<SequenceStructuresData | null>(null);
	// Candidate chains and the mutation map ride the same bound sequence. Both
	// are optional reads: a failure leaves the exact structure untouched.
	let structureCandidates = $state<SequenceStructureCandidatesData | null>(null);
	let candidatesLoading = $state(false);
	let mutationMapData = $state<SequenceMutationMapData | null>(null);
	let boundLoading = $state(false);
	let boundSequenceId = $state('');

	async function loadBound(seq: SequenceRecord) {
		boundSequenceId = seq.id;
		boundLoading = true;
		candidatesLoading = true;
		observedStructures = null;
		structureCandidates = null;
		mutationMapData = null;
		try {
			const [structures, candidates, mutationMap] = await Promise.allSettled([
				sequences.structures(seq.id),
				sequences.structureCandidates(seq.id),
				sequences.mutationMap(seq.id)
			]);
			if (boundSequenceId !== seq.id) return;
			observedStructures = structures.status === 'fulfilled' ? structures.value : null;
			structureCandidates = candidates.status === 'fulfilled' ? candidates.value : null;
			mutationMapData = mutationMap.status === 'fulfilled' ? mutationMap.value : null;
		} finally {
			if (boundSequenceId === seq.id) {
				boundLoading = false;
				candidatesLoading = false;
			}
		}
	}

	// Confirmed candidates are observed evidence, never exact matches. The
	// best confirmed row (coordinates first, then coverage) may stand in for
	// the missing primary card, clearly labelled as a candidate.
	const confirmedCandidates = $derived(
		(structureCandidates?.candidates ?? []).filter((c) => c.decision === 'confirmed')
	);
	// A pending candidate is still worth showing: the imported structure is
	// visible immediately, but the badge says it has not been confirmed.
	const previewCandidate = $derived.by(() => {
		const list = [...(structureCandidates?.candidates ?? [])]
			.filter((c) => c.decision !== 'rejected')
			.sort(
				(a, b) =>
					Number(b.hasCoordinates) - Number(a.hasCoordinates) ||
					(b.coverage ?? 0) - (a.coverage ?? 0) ||
					(a.resolutionAngstrom ?? Number.POSITIVE_INFINITY) -
						(b.resolutionAngstrom ?? Number.POSITIVE_INFINITY)
			);
		return list[0] ?? null;
	});
	const primaryCandidate = $derived(
		previewCandidate?.decision === 'confirmed' ? previewCandidate : null
	);

	$effect(() => {
		const seq = boundSequence;
		if (seq?.id && seq.id !== boundSequenceId) void loadBound(seq);
	});

	// ---------------------------------------------------------------- evidence --
	// Wet-lab evidence lives per fold (history endpoint aggregates validations
	// and observed structures). Cap the walk so a huge corpus cannot fan out
	// unbounded; the count line tells the truth about the window.
	const EVIDENCE_CAP = 25;
	interface EvidenceRow {
		kind: 'validation' | 'observed';
		id: string;
		foldId: string;
		method?: string;
		status?: string;
		createdAt?: number;
		raw: Record<string, unknown>;
	}
	let evidence = $state<EvidenceRow[]>([]);
	let evidenceLoading = $state(false);
	let evidenceWindow = $state(0);

	async function loadEvidence() {
		const foldIds = [...new Set(expFolds.map((f) => f.foldId))].slice(0, EVIDENCE_CAP);
		evidenceWindow = foldIds.length;
		evidenceLoading = true;
		const rows: EvidenceRow[] = [];
		const results = await Promise.allSettled(foldIds.map((fid) => folds.history(fid)));
		results.forEach((res, i) => {
			if (res.status !== 'fulfilled') return;
			const h = res.value as Record<string, unknown>;
			for (const v of firstArray<ValidationDigest>(h.validations ?? [])) {
				const o = v as unknown as Record<string, unknown>;
				rows.push({
					kind: 'validation',
					id: String(o.id ?? ''),
					foldId: foldIds[i],
					method: o.method ? String(o.method) : undefined,
					status: o.status ? String(o.status) : undefined,
					createdAt: typeof o.createdAt === 'number' ? o.createdAt : undefined,
					raw: o
				});
			}
			for (const osr of firstArray<ObservedStructureRecord>(h.observedStructures ?? [])) {
				const o = osr as unknown as Record<string, unknown>;
				rows.push({
					kind: 'observed',
					id: String(o.id ?? ''),
					foldId: foldIds[i],
					method: o.method ? String(o.method) : undefined,
					createdAt: typeof o.createdAt === 'number' ? o.createdAt : undefined,
					raw: o
				});
			}
		});
		evidence = rows;
		evidenceLoading = false;
		void loadRelated();
	}

	// ---------------------------------------------------------------- related --
	// Interactions / comparisons bind folds, not proteins — filter the corpus
	// client-side (list endpoints cap at the catalog, so this stays bounded).
	// Enzyme rows (§54) bind THIS protein directly via ?protein_id= and load
	// regardless of folds: a molecule with no predicted structure can still
	// be an enzyme.
	let interRows = $state<InteractionRow[]>([]);
	let compRows = $state<ComparisonRow[]>([]);
	let relatedError = $state('');
	interface EnzymeLinkRow {
		id: string;
		name: string;
		ecNumber?: string | null;
		enzymeClass?: string;
		sourceOrganism?: string | null;
		recognitionSite?: string;
		cutPosition?: string;
	}
	let enzymeRows = $state<EnzymeLinkRow[]>([]);
	let restrictionRows = $state<EnzymeLinkRow[]>([]);
	// §55: the gene side of the same assertion — RNA CDS regions that name
	// this protein as their product. The claim lives on the region row.
	let cdsRows = $state<GeneRegionRow[]>([]);
	// The record chain also needs the gene record behind the first region,
	// not just the CDS rows the related tab lists.
	let geneRows = $state<GeneRegionRow[]>([]);
	let geneRecord = $state<GeneRecord | null>(null);
	// Gene regions only reach the protein through an explicit CDS → protein
	// assertion. Before that link exists, still surface the gene record by
	// symbol + organism so the upstream chain shows the candidate instead of
	// a dead end.
	let candidateGene = $state<GeneListRow | null>(null);

	async function loadRelated() {
		const pid = protein?.id;
		const foldIds = new Set(expFolds.map((f) => f.foldId));
		// Enzyme links key off the protein; interactions/comparisons key off
		// its folds. All four are independent, so one wave instead of two.
		const [ez, rz, ix, cp] = await Promise.allSettled([
			pid ? enzymes.list(undefined, pid) : Promise.resolve(null),
			pid ? restrictionEnzymes.list(pid) : Promise.resolve(null),
			foldIds.size ? interactions.list() : Promise.resolve(null),
			foldIds.size ? comparisons.list() : Promise.resolve(null)
		]);
		if (ez.status === 'fulfilled' && ez.value)
			enzymeRows = firstArray<EnzymeLinkRow>(ez.value, 'enzymes', 'items');
		if (rz.status === 'fulfilled' && rz.value)
			restrictionRows = firstArray<EnzymeLinkRow>(rz.value, 'enzymes', 'items');
		if (foldIds.size === 0) return;
		relatedError = '';
		if (ix.status === 'fulfilled' && ix.value) {
			interRows = firstArray<InteractionRow>(ix.value, 'interactions', 'items').filter(
				(r) => foldIds.has(String(r.foldAId ?? '')) || foldIds.has(String(r.foldBId ?? ''))
			);
		}
		if (cp.status === 'fulfilled' && cp.value) {
			compRows = firstArray<ComparisonRow>(cp.value, 'comparisons', 'items').filter((r) =>
				foldIds.has(String(r.foldId ?? ''))
			);
		}
		if (ix.status === 'rejected' && cp.status === 'rejected')
			relatedError = tr('protein_related_needs_login');
	}

	// ------------------------------------------------------------ community --
	// Contributions/corrections/retractions carry the target's public id in
	// their payload — the LIKE search finds every ledger entry about this
	// protein without SPD computing anything.
	interface LedgerRow {
		kind: string;
		id: string;
		summary: string;
		status?: string;
		createdAt?: number;
	}
	let ledger = $state<LedgerRow[]>([]);
	let ledgerLoading = $state(false);
	// Three LIKE searches for a tab most visitors never open. The effect
	// below fetches them on first visit instead of on every page load.
	let communityLoaded = $state(false);
	$effect(() => {
		if (tab !== 'community' || communityLoaded || !protein) return;
		communityLoaded = true;
		void loadCommunityRecords();
	});

	async function loadCommunityRecords() {
		const p = protein;
		if (!p) return;
		ledgerLoading = true;
		const kinds = ['contribution', 'correction', 'retraction'];
		const results = await Promise.allSettled(
			kinds.map((k) => search.run({ q: p.id, entityType: k, limit: 50 }))
		);
		const rows: LedgerRow[] = [];
		results.forEach((res, i) => {
			if (res.status !== 'fulfilled') return;
			for (const h of res.value.data as Array<{ id: string; payload?: Record<string, unknown> }>) {
				const p = (h.payload ?? {}) as Record<string, unknown>;
				rows.push({
					kind: kinds[i],
					id: String(p.id ?? h.id ?? ''),
					summary: String(p.summary ?? p.reason ?? p.title ?? ''),
					status: p.status ? String(p.status) : undefined,
					createdAt: typeof p.createdAt === 'number' ? p.createdAt : undefined
				});
			}
		});
		ledger = rows;
		ledgerLoading = false;
	}

	const routeByKind: Record<string, string> = {
		contribution: '/contributions',
		correction: '/corrections',
		retraction: '/retractions'
	};

	// UniProt-style at-a-glance counters, derived from what actually loaded
	const glance = $derived({
		sequences: seqRows.length,
		folds: expFolds.length,
		envs: new Set(expFolds.map((f) => f.environmentId).filter(Boolean)).size,
		evidence: evidence.length,
		related:
			interRows.length +
			compRows.length +
			enzymeRows.length +
			restrictionRows.length +
			cdsRows.length,
		ledger: ledger.length
	});

	// The overview's one-line lineage: each node points at the record that
	// carries its claim. Missing links remain visible instead of disappearing.
	const chainNodes = $derived.by((): ChainNode[] => {
		const seq = boundSequence;
		const region = geneRows[0] ?? null;
		const geneId = region?.geneId ?? candidateGene?.id ?? '';
		const hasLinkedRegion = Boolean(region?.geneId);
		const geneName = geneRecord?.name ?? candidateGene?.name;
		const geneSymbol = geneRecord?.symbol ?? candidateGene?.symbol;
		const cds = geneRows.find((r) => r.regionType === 'cds') ?? null;
		const exact = observedStructures?.primaryStructure ?? null;
		const candidate = previewCandidate;
		const mutationCount = mutationMapData?.mutations.length ?? 0;

		return [
			{
				key: 'gene',
				label: tr('chain_gene'),
				value: geneId ? displayRecordName(geneName, geneSymbol) || shortPublicId(geneId) : null,
				href: geneId ? `/genes/${geneId}` : null,
				status: geneId ? (hasLinkedRegion ? 'present' : 'partial') : 'missing',
				hint:
					geneRows.length > 1
						? tr('chain_gene_more', { n: geneRows.length })
						: geneId
							? hasLinkedRegion
								? null
								: tr('chain_gene_candidate', { symbol: protein?.geneName ?? '' })
							: tr('chain_gene_missing')
			},
			{
				key: 'rna',
				label: tr('chain_rna'),
				value:
					cds && cds.startPosition != null && cds.endPosition != null
						? `${cds.startPosition}..${cds.endPosition}`
						: null,
				href: geneId ? `/genes/${geneId}` : null,
				status: cds ? 'present' : 'missing',
				hint:
					cds?.description ||
					(cds ? null : candidateGene ? tr('chain_rna_candidate') : tr('chain_rna_missing'))
			},
			{
				key: 'protein',
				label: tr('chain_protein'),
				value: protein?.preferredName ?? null,
				status: protein ? 'present' : 'missing',
				hint: protein?.geneName ? `${tr('f_geneName')}: ${protein.geneName}` : null
			},
			{
				key: 'sequence',
				label: tr('chain_sequence'),
				value: seq
					? tr('chain_sequence_value', {
							n: seq.length,
							role: tr(`seq_role_${seq.sequenceRole ?? 'variant'}`)
						})
					: null,
				href: seq ? `/sequences/${seq.id}` : null,
				status: seq ? 'present' : 'missing',
				hint: seq ? null : tr('chain_sequence_missing')
			},
			{
				key: 'pdb',
				label: tr('chain_pdb'),
				value: exact?.entry.pdbId ?? candidate?.pdbId ?? null,
				href: exact
					? `/pdb-entries/${exact.entry.id}`
					: candidate
						? `/pdb-entries/${candidate.pdbEntryId || candidate.pdbId}`
						: null,
				status: exact ? 'present' : candidate ? 'partial' : 'missing',
				hint: exact
					? tr('chain_pdb_exact')
					: candidate
						? tr('chain_pdb_candidate')
						: tr('chain_pdb_missing')
			},
			{
				key: 'fold',
				label: tr('chain_fold'),
				value: tr('chain_fold_value', {
					folds: expFolds.length,
					evidence: evidence.length
				}),
				status: evidence.length > 0 ? 'present' : expFolds.length > 0 ? 'partial' : 'missing',
				hint: evidence.length > 0 || expFolds.length > 0 ? null : tr('chain_fold_missing')
			},
			{
				key: 'mutation',
				label: tr('chain_mutation'),
				value: tr('chain_mutation_value', { n: mutationCount }),
				href: seq ? `/sequences/${seq.id}` : null,
				status: mutationCount > 0 ? 'present' : 'missing',
				hint: mutationCount > 0 ? null : tr('chain_mutation_missing')
			}
		];
	});
</script>

{#if loading}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{:else if !protein}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		<p class="font-medium">{tr('page_not_found')}</p>
		<p class="mt-1">{error}</p>
	</div>
{:else}
	<div class="space-y-4">
		<!-- identity header, UniProt order: name · gene · organism · ids · badges -->
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold">{protein.preferredName}</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					{#if protein.geneName}<span>{tr('f_geneName')}: {protein.geneName}</span>{/if}
					{#if protein.organism?.scientificName}<span class="break-words"
							><i>{protein.organism.scientificName}</i>{#if protein.organism?.taxId != null}
								· {protein.organism.taxId}{/if}</span
						>{/if}
					<Badge tone={protein.status === 'active' ? 'ok' : 'bad'}
						>{tr(`status_${protein.status}`)}</Badge
					>
					{#if protein.sourceEntryStatus}
						<Badge tone={protein.sourceEntryStatus === 'reviewed' ? 'ok' : 'muted'}
							>{tr(`status_${protein.sourceEntryStatus}`)}</Badge
						>
					{/if}
				</div>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<code class="font-mono break-all">{protein.id}</code>
					{#if tagList.length}<span class="break-words">{tagList.join(' · ')}</span>{/if}
				</div>
				{#if visibleKeywords.length}
					<div class="mt-1.5 flex flex-wrap items-center gap-1">
						{#each visibleKeywords as kw (kw.name)}
							<Badge tone="muted" class="px-1.5 py-0 text-[10px] font-normal"
								>{kw.name ?? '—'}</Badge
							>
						{/each}
						{#if extraKeywordCount > 0}
							<button
								class="text-[10px] underline text-muted-foreground"
								onclick={() => (tab = 'overview')}>+{extraKeywordCount}</button
							>
						{/if}
					</div>
				{/if}
			</div>
			<IssuePanel
				entityType="protein"
				entityId={protein.id}
				onannotate={() => (tab = 'community')}
			/>
			<div class="flex flex-wrap items-center gap-2">
				<PageTools />
				<RecordActions
					entityType="protein"
					id={protein.id}
					name={protein.preferredName}
					href={`/proteins/${protein.id}`}
					record={protein}
					related={relatedActions}
				/>
				{#if session.signedIn}
					<Button size="sm" variant="outline" onclick={() => (showAdd = true)}
						>{tr('protein_add_sequence')}</Button
					>
					<Button size="sm" href="/submit/fold" variant="ghost">{tr('protein_predict_cta')}</Button>
				{/if}
			</div>
		</div>

		<!-- at-a-glance counters (PDB summary strip): each tile jumps to its tab -->
		<div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'sequences')}
			>
				<p class="text-lg font-semibold tabular-nums">{glance.sequences}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('nav_sequences')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'structures')}
			>
				<p class="text-lg font-semibold tabular-nums">{expLoading ? '…' : glance.folds}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('protein_tab_structures')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'structures')}
			>
				<p class="text-lg font-semibold tabular-nums">{glance.envs}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('env_explorer_stat_envs')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'evidence')}
			>
				<p class="text-lg font-semibold tabular-nums">{evidenceLoading ? '…' : glance.evidence}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('protein_tab_evidence')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'related')}
			>
				<p class="text-lg font-semibold tabular-nums">{glance.related}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('protein_tab_related')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'community')}
			>
				<p class="text-lg font-semibold tabular-nums">{ledgerLoading ? '…' : glance.ledger}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('protein_tab_community')}</p>
			</Button>
		</div>

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'overview', label: tr('tab_overview') },
				{ key: 'features', label: tr('tab_features'), badge: annotations.length },
				{ key: 'sequences', label: tr('nav_sequences'), badge: seqRows.length },
				{ key: 'structures', label: tr('protein_tab_structures'), badge: expFolds.length },
				{ key: 'evidence', label: tr('protein_tab_evidence'), badge: evidence.length },
				{ key: 'related', label: tr('protein_tab_related'), badge: glance.related },
				{ key: 'community', label: tr('protein_tab_community') }
			]}
		/>

		{#if tab === 'overview'}
			<!-- UniProt entry-page order: Names & Taxonomy, keywords/comments,
			     then the entry footer facts. All values are source assertions
			     stored on the row (0033); none of this is computed here. -->
			<div class="grid gap-4 lg:grid-cols-2">
				<Section title={tr('sec_names_taxonomy')}>
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
						<dt class="text-muted-foreground">{tr('f_preferredName')}</dt>
						<dd class="font-medium">{protein.preferredName}</dd>
						{#if protein.entryName}
							<dt class="text-muted-foreground">{tr('f_entryName')}</dt>
							<dd>{protein.entryName}</dd>
						{/if}
						{#if protein.fullName}
							<dt class="text-muted-foreground">{tr('f_fullName')}</dt>
							<dd>{protein.fullName}</dd>
						{/if}
						{#if protein.ecNumber}
							<dt class="text-muted-foreground">{tr('f_ecNumber')}</dt>
							<dd class="font-mono text-xs">{protein.ecNumber}</dd>
						{/if}
						{#if altNames.length}
							<dt class="text-muted-foreground">{tr('f_altNames')}</dt>
							<dd>{altNames.join('; ')}</dd>
						{/if}
						<dt class="text-muted-foreground">{tr('f_geneName')}</dt>
						<dd>
							{protein.geneName ?? '—'}
							{#if geneSynonyms.length}<span class="text-muted-foreground">
									({tr('f_geneSynonyms')}: {geneSynonyms.join(', ')})</span
								>{/if}
							{#if orfNames.length}<span class="text-muted-foreground">
									({tr('f_orfNames')}: {orfNames.join(', ')})</span
								>{/if}
						</dd>
						<dt class="text-muted-foreground">{tr('f_organism')}</dt>
						<dd>
							<i>{protein.organism?.scientificName ?? '—'}</i>{#if protein.organism?.taxId != null}
								· {protein.organism.taxId}{/if}
						</dd>
						{#if lineage.length}
							<dt class="text-muted-foreground">{tr('f_lineage')}</dt>
							<dd class="text-xs">{lineage.join(' → ')}</dd>
						{/if}
					</dl>
				</Section>
				<Section title={tr('sec_keywords_comments')} collapsible={!comments.length}>
					{#if keywords.length}
						<div class="mb-2 flex flex-wrap gap-1">
							{#each keywords as kw (kw.name)}
								<Badge tone="muted" class="px-1.5 py-0 text-[10px] font-normal"
									>{kw.name ?? '—'}</Badge
								>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">{tr('keywords_none')}</p>
					{/if}
					{#if commentGroups.length}
						<div class="space-y-2">
							{#each commentGroups as g, i (`${g.type}-${i}`)}
								<div>
									<p class="text-xs font-semibold text-muted-foreground">
										{enumLabel('comment', g.type)}
									</p>
									{#each g.texts as txt, j (`${g.type}-${j}`)}
										<p class="text-sm leading-5">{txt}</p>
									{/each}
									{#if g.evidence.length}
										<div class="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
											{#each g.evidence as e, k (`${g.type}-ev-${k}`)}
												{#if pubmedLink(e)}
													<a
														class="underline text-primary"
														href={pubmedLink(e) ?? '#'}
														target="_blank"
														rel="noreferrer">{e.source} {e.id}</a
													>
												{:else}
													<span class="break-words"
														>{[e.source, e.id].filter(Boolean).join(' ')}</span
													>
												{/if}
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{:else if !keywords.length}{:else}
						<p class="text-sm text-muted-foreground">{tr('comments_none')}</p>
					{/if}
				</Section>
				<Section title={tr('sec_entry')} collapsible>
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
						<dt class="text-muted-foreground">{tr('f_sourceEntryStatus')}</dt>
						<dd>
							{protein.sourceEntryStatus ? enumLabel('status', protein.sourceEntryStatus) : '—'}
						</dd>
						<dt class="text-muted-foreground">{tr('f_annotationScore')}</dt>
						<dd>{protein.annotationScore ?? '—'}/5</dd>
						<dt class="text-muted-foreground">{tr('f_entryVersion')}</dt>
						<dd>{protein.entryVersion ?? '—'}</dd>
						<dt class="text-muted-foreground">{tr('f_sequenceVersion')}</dt>
						<dd>{protein.sequenceVersion ?? '—'}</dd>
						<dt class="text-muted-foreground">{tr('f_sourceCreatedAt')}</dt>
						<dd>
							{protein.sourceCreatedAt != null ? fmtTime(protein.sourceCreatedAt, true) : '—'}
						</dd>
						<dt class="text-muted-foreground">{tr('f_sourceUpdatedAt')}</dt>
						<dd>
							{protein.sourceUpdatedAt != null ? fmtTime(protein.sourceUpdatedAt, true) : '—'}
						</dd>
						<dt class="text-muted-foreground">{tr('f_sourceSequenceUpdatedAt')}</dt>
						<dd>
							{protein.sourceSequenceUpdatedAt != null
								? fmtTime(protein.sourceSequenceUpdatedAt, true)
								: '—'}
						</dd>
						<dt class="text-muted-foreground">{tr('f_sequenceCrc64')}</dt>
						<dd class="font-mono text-xs">{protein.sequenceCrc64 ?? '—'}</dd>
						<dt class="text-muted-foreground">{tr('f_massDalton')}</dt>
						<dd>
							{protein.massDalton != null
								? `${protein.massDalton.toFixed(1)} Da`
								: tr('mass_source_none')}
						</dd>
						<dt class="text-muted-foreground">{tr('f_license')}</dt>
						<dd>{protein.license}</dd>
						<dt class="text-muted-foreground">{tr('f_createdAt')}</dt>
						<dd>{fmtTime(protein.createdAt, true)}</dd>
						<dt class="text-muted-foreground">{tr('f_updatedAt')}</dt>
						<dd>{fmtTime(protein.updatedAt, true)}</dd>
					</dl>
				</Section>
			</div>
			<div class="grid gap-4 lg:grid-cols-2">
				<ExternalIdentifiersPanel entityType="protein" entityId={protein.id} />
				<RelationsPanel entityType="protein" entityId={protein.id} />
			</div>
			{#if boundSequence}
				<MutationMap data={mutationMapData} loading={boundLoading} sequenceId={boundSequence.id} />
			{/if}
			<Section title={tr('evidence_chain_title')} hint={tr('evidence_chain_hint')}>
				<EvidenceChain nodes={chainNodes} />
			</Section>
		{:else if tab === 'features'}
			<Section title={tr('tab_features')}>
				{#snippet actions()}
					<div class="flex flex-wrap items-center gap-1">
						{#if session.canWrite && canonicalSeqText}
							<Button size="xs" variant="outline" onclick={() => (showFeature = true)}
								>{tr('protein_add_feature')}</Button
							>
						{/if}
						<Button
							size="xs"
							variant={aaTheme === 'aa_family' ? 'secondary' : 'ghost'}
							onclick={() => (aaTheme = 'aa_family')}>{tr('aa_theme_family')}</Button
						>
						<Button
							size="xs"
							variant={aaTheme === 'aa_chem' ? 'secondary' : 'ghost'}
							onclick={() => (aaTheme = 'aa_chem')}>{tr('aa_theme_chem')}</Button
						>
					</div>
				{/snippet}
				{#if !session.canWrite}
					<p class="mb-2 text-xs text-muted-foreground">{tr('feature_write_requires_researcher')}</p>
				{/if}
				{#if canonicalSeqText}
					<div class="gene-view" style="height: 420px;">
						<DnaViewer
							dnaSeq={canonicalSeqText}
							plasmidName={protein.preferredName}
							mode="protein"
							colorTheme={aaTheme}
							assertedMass={protein.massDalton ?? null}
							assertedCrc64={protein.sequenceCrc64 ?? null}
							restrictionSites={[]}
							geneFeatures={featureRows.features}
							parts={[]}
							primers={[]}
							bind:selectionStart={featStart}
							bind:selectionEnd={featEnd}
						/>
					</div>
					{#if featureRows.unplaced > 0}
						<p class="mt-1 text-xs text-muted-foreground">
							{tr('features_unplaced', { n: featureRows.unplaced })}
						</p>
					{/if}
				{:else}
					<p class="text-sm text-muted-foreground">{tr('features_no_sequence')}</p>
				{/if}
				{#if annotations.length === 0}
					<p class="mt-2 text-sm text-muted-foreground">{tr('features_none')}</p>
				{:else}
					<div class="mt-2 overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b text-left text-xs text-muted-foreground">
									<th class="py-1 pr-2">{tr('ft_col_type')}</th><th class="pr-2"
										>{tr('col_range')}</th
									><th class="pr-2">{tr('ft_col_description')}</th>
								</tr>
							</thead>
							<tbody>
								{#each annotations as a (a.id)}
									<tr
										class="cursor-pointer border-b last:border-0 hover:bg-accent/40 {a.startPosition !=
											null &&
										a.startPosition === featStart &&
										a.endPosition === featEnd
											? 'bg-primary/10'
											: ''}"
										onclick={() => selectFeature(a)}
									>
										<td class="py-1 pr-2">
											<span class="inline-flex items-center gap-1.5">
												<span
													class="inline-block size-2.5 rounded-none"
													style="background: {FEATURE_TYPE_COLORS[a.featureType] ??
														FEATURE_DEFAULT_COLOR}"
												></span>
												<code class="text-xs">{enumLabel('ft', a.featureType)}</code>
											</span>
										</td>
										<td class="pr-2 font-mono text-xs"
											>{a.startPosition ?? '?'}..{a.endPosition ?? '?'}</td
										>
										<td class="pr-2"
											>{a.description || '—'}{#if a.residue}<span
													class="text-xs text-muted-foreground"
												>
													({a.residue})</span
												>{/if}</td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="mt-1 text-xs text-muted-foreground">{tr('features_click_hint')}</p>
				{/if}
			</Section>
		{:else if tab === 'sequences'}
			<Section title={tr('nav_sequences')}>
				{#snippet actions()}
					{#if session.signedIn}<Button size="xs" variant="outline" onclick={() => (showAdd = true)}
							>{tr('protein_add_sequence')}</Button
						>{/if}
				{/snippet}
				{#if seqRows.length === 0}
					<p class="text-sm text-muted-foreground">{tr('protein_no_sequences')}</p>
				{:else}
					<DataTable rows={seqRows} columns={seqColumns} hrefFor={(r) => `/sequences/${r.id}`} />
				{/if}
			</Section>
		{:else if tab === 'structures'}
			<!-- Sequence-bound observed fold: the primary exact-match PDB entry.
			     The engine stability domain belongs to that sequence version and
			     is shown on /sequences/{id}; predicted folds follow. -->
			<Section title={tr('protein_observed_structure')}>
				{#if boundLoading}
					<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
				{:else if observedStructures?.primaryStructure}
					{@const primary = observedStructures.primaryStructure}
					<div class="space-y-2 text-sm">
						<div class="flex flex-wrap items-center gap-2">
							<a class="font-mono text-base underline" href={`/pdb-entries/${primary.entry.id}`}>
								{primary.entry.pdbId}
							</a>
							{#if primary.entry.resolutionAngstrom != null}
								<span>{primary.entry.resolutionAngstrom} Å</span>
							{/if}
							<span>{primary.entry.experimentalMethod}</span>
						</div>
						<p>{primary.entry.title}</p>
						<p class="text-xs text-muted-foreground">
							{primary.entity.description}
							{#if primary.entity.chainNames.length}
								· {tr('protein_observed_chains')} {primary.entity.chainNames.join(', ')}
							{/if}
						</p>
						{#if !primary.hasCoordinates}
							<p class="text-xs text-amber-700 dark:text-amber-400">
								{tr('protein_observed_no_coordinates')}
							</p>
						{/if}
						{#if observedStructures.structures.length > 1}
							<div class="pt-2">
								<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									{tr('protein_observed_alternatives')}
								</p>
								<ul class="mt-1 space-y-1">
									{#each observedStructures.structures.slice(1) as alt (alt.entry.id)}
										<li class="flex flex-wrap items-center gap-2 text-xs">
											<a class="font-mono underline" href={`/pdb-entries/${alt.entry.id}`}
												>{alt.entry.pdbId}</a
											>
											{#if alt.entry.resolutionAngstrom != null}<span class="text-muted-foreground"
													>{alt.entry.resolutionAngstrom} Å</span
												>{/if}
											<span class="text-muted-foreground">{alt.entry.experimentalMethod}</span>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				{:else if previewCandidate}
					{@const candidate = previewCandidate}
					<div class="space-y-2 text-sm">
						<div class="flex flex-wrap items-center gap-2">
							<a
								class="font-mono text-base underline"
								href={`/pdb-entries/${candidate.pdbEntryId || candidate.pdbId}`}
							>
								{candidate.pdbId}
							</a>
							<Badge tone={candidate.decision === 'confirmed' ? 'warn' : 'muted'}>
								{candidate.decision === 'confirmed'
									? tr('protein_candidate_badge')
									: tr('protein_candidate_pending_badge')}
							</Badge>
							{#if candidate.resolutionAngstrom != null}
								<span>{Number(candidate.resolutionAngstrom).toFixed(2)} Å</span>
							{/if}
							{#if candidate.experimentalMethod}
								<span>{candidate.experimentalMethod}</span>
							{/if}
						</div>
						{#if candidate.title}<p>{candidate.title}</p>{/if}
						<p class="text-xs text-muted-foreground">
							{#if candidate.description}{candidate.description}{/if}
							{#if candidate.chainNames.length}
								· {tr('protein_observed_chains')} {candidate.chainNames.join(', ')}
							{/if}
							{#if candidate.coverage != null}
								· {tr('protein_candidate_coverage')} {pctText(candidate.coverage)}
							{/if}
						</p>
						<p class="text-xs text-amber-700 dark:text-amber-400">
							{candidate.decision === 'confirmed'
								? tr('protein_candidate_primary_hint')
								: tr('protein_candidate_pending_hint')}
						</p>
						{#if !candidate.hasCoordinates}
							<p class="text-xs text-amber-700 dark:text-amber-400">
								{tr('protein_observed_no_coordinates')}
							</p>
						{/if}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">{tr('protein_observed_none')}</p>
				{/if}
			</Section>

			{#if observedStructures?.primaryStructure?.hasCoordinates && observedStructures.primaryStructure.entry.coordinatesArtifactId}
				<Section title={tr('protein_observed_structure')}>
					<MolViewer
						artifacts={[
							{
								id: observedStructures.primaryStructure.entry.coordinatesArtifactId,
								kind: 'full_structure_bincif',
								mediaType: 'chemical/bincif',
								status: 'completed'
							}
						]}
						sequence={boundSequence?.normalizedSequence || boundSequence?.sequence}
						height={420}
					/>
				</Section>
			{:else if previewCandidate?.hasCoordinates && previewCandidate.coordinatesArtifactId}
				<Section title={tr('protein_candidate_viewer_title')}>
					<div class="mb-2 flex flex-wrap items-center gap-2 text-xs">
						<Badge tone={previewCandidate.decision === 'confirmed' ? 'warn' : 'muted'}>
							{previewCandidate.decision === 'confirmed'
								? tr('protein_candidate_badge')
								: tr('protein_candidate_pending_badge')}
						</Badge>
						<a
							class="font-mono underline"
							href={`/pdb-entries/${previewCandidate.pdbEntryId || previewCandidate.pdbId}`}
						>
							{previewCandidate.pdbId}
						</a>
						<span class="text-muted-foreground">
							{previewCandidate.decision === 'confirmed'
								? tr('protein_candidate_primary_hint')
								: tr('protein_candidate_pending_hint')}
						</span>
					</div>
					<MolViewer
						artifacts={[
							{
								id: previewCandidate.coordinatesArtifactId,
								kind: 'full_structure_bincif',
								mediaType: 'chemical/bincif',
								status: 'completed'
							}
						]}
						sequence={boundSequence?.normalizedSequence || boundSequence?.sequence}
						height={420}
					/>
				</Section>
			{/if}

			{#if boundSequence}
				<StructureCandidates
					sequenceId={boundSequence.id}
					bind:data={structureCandidates}
					loading={candidatesLoading}
				/>
			{/if}

			<!-- environment explorer + inline 3D preview, the rcsb-style centerpiece -->
			<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span>{tr('env_explorer_stat_total')} {expStats.total}</span>
				<span>{tr('env_explorer_stat_shown')} {expStats.shown}</span>
				<span>{tr('env_explorer_stat_mutants')} {expStats.mutants}</span>
				{#if expLoading}<span>{tr('env_explorer_loading')} {expDone}/{expTotal}</span>{/if}
				<Button
					size="xs"
					variant="ghost"
					onclick={loadExplorer}
					disabled={expLoading || seqRows.length === 0}>⟳ {tr('env_explorer_load')}</Button
				>
			</div>

			<div class="grid gap-4 sm:grid-cols-3">
				<RangeSlider
					label="pH"
					min={0}
					max={14}
					step={0.1}
					bind:value={rPh}
					format={(n) => n.toFixed(1)}
				/>
				<RangeSlider
					label={tr('env_explorer_axis_temp')}
					min={K_MIN}
					max={K_MAX}
					step={1}
					bind:value={rTemp}
					format={(k) => `${(k - 273.15).toFixed(0)}°C`}
				/>
				<RangeSlider
					label={tr('env_explorer_axis_ion')}
					min={0}
					max={2}
					step={0.01}
					bind:value={rIon}
					format={(n) => n.toFixed(2)}
				/>
			</div>
			{#if expError}
				<p
					class="rounded-none bg-amber-50 dark:bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300"
				>
					{expError}
				</p>
			{/if}

			{#if expFolds.length === 0 && !expLoading}
				<p class="text-sm text-muted-foreground">
					{seqRows.length === 0 ? tr('protein_no_sequences') : tr('env_explorer_none')}
				</p>
			{:else if shownFolds.length === 0 && !expLoading}
				<p class="text-sm text-muted-foreground">{tr('env_explorer_empty')}</p>
			{:else}
				<div class="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
					<Section title={tr('protein_fold_list')}>
						<div class="max-h-64 overflow-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b text-left text-xs text-muted-foreground">
										<th class="py-1 pr-2">{tr('col_id')}</th><th class="pr-2">pH</th><th
											class="pr-2">T</th
										><th class="pr-2">I</th><th class="pr-2">{tr('f_confidence')}</th><th
											>{tr('f_verificationLevel')}</th
										>
									</tr>
								</thead>
								<tbody>
									{#each shownFolds as f (f.foldId)}
										<tr
											class="cursor-pointer border-b last:border-0 hover:bg-accent/40 {f.foldId ===
											selFoldId
												? 'bg-primary/10'
												: ''}"
											onclick={() => selectFold(f.foldId)}
										>
											<td class="py-1 pr-2 font-mono text-xs">{shortPublicId(f.foldId)}</td>
											<td class="pr-2"
												>{colC(f.environmentId ? expEnvs[f.environmentId]?.ph : null)}</td
											>
											<td class="pr-2"
												>{kToC(f.environmentId ? expEnvs[f.environmentId]?.temperatureK : null)}</td
											>
											<td class="pr-2"
												>{colC(
													f.environmentId ? expEnvs[f.environmentId]?.ionicStrengthM : null
												)}</td
											>
											<td class="pr-2">{colC(f.confidence)}</td>
											<td>{f.verificationLevel ?? '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Section>
					<Section title={tr('protein_preview_title')}>
						{#if selLoading}
							<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
						{:else if selFold}
							<div class="mb-2 flex flex-wrap items-center gap-2 text-xs">
								<code class="font-mono">{shortPublicId(selFold.id)}</code>
								{#if selFold.verificationLevel}<Badge tone="muted"
										>{selFold.verificationLevel}</Badge
									>{/if}
								{#if expFolds.find((f) => f.foldId === selFoldId)?.confidence != null}
									<Badge tone="info"
										>pLDDT {colC(expFolds.find((f) => f.foldId === selFoldId)?.confidence)}</Badge
									>
								{/if}
								<a class="underline" href="/folds/{selFold.id}">{tr('protein_open_fold')}</a>
							</div>
							<MolViewer
								prediction={(selFold.prediction as Record<string, unknown> | undefined) ?? null}
								sequence={selSeq?.normalizedSequence || selSeq?.sequence}
								artifacts={selArts}
							/>
							{#if selFold.environmentId}<p class="mt-2 text-xs text-muted-foreground">
									{tr('f_environmentId')}: <IdLink
										id={String(selFold.environmentId)}
										kind="environment"
									/>
								</p>{/if}
						{:else}
							<p class="text-sm text-muted-foreground">{tr('protein_preview_pick')}</p>
						{/if}
					</Section>
				</div>
			{/if}
		{:else if tab === 'evidence'}
			<Section
				title={tr('protein_tab_evidence')}
				hint={tr('protein_evidence_hint', { n: evidenceWindow })}
			>
				{#if evidenceLoading}
					<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
				{:else if evidence.length === 0}
					<p class="text-sm text-muted-foreground">{tr('protein_evidence_none')}</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b text-left text-xs text-muted-foreground">
									<th class="py-1 pr-2">{tr('protein_evidence_kind')}</th><th class="pr-2"
										>{tr('protein_evidence_fold')}</th
									><th class="pr-2">{tr('f_method')}</th><th class="pr-2">{tr('f_status')}</th><th
										>{tr('f_createdAt')}</th
									>
								</tr>
							</thead>
							<tbody>
								{#each evidence as ev (ev.kind + ev.id)}
									<tr class="border-b last:border-0">
										<td class="py-1 pr-2"
											><Badge tone={ev.kind === 'validation' ? 'ok' : 'muted'}
												>{ev.kind === 'validation'
													? tr('et_wet_lab_validation')
													: tr('protein_evidence_observed')}</Badge
											></td
										>
										<td class="pr-2"
											><a class="font-mono text-xs underline" href="/folds/{ev.foldId}"
												>{shortPublicId(ev.foldId)}</a
											></td
										>
										<td class="pr-2">{ev.method ?? '—'}</td>
										<td class="pr-2">{ev.status ?? '—'}</td>
										<td>{ev.createdAt != null ? fmtTime(ev.createdAt) : '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Section>
		{:else if tab === 'related'}
			{#if relatedError}
				<p
					class="rounded-none bg-amber-50 dark:bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300"
				>
					{relatedError}
				</p>
			{/if}
			<div class="grid gap-4 lg:grid-cols-2">
				<Section title={tr('protein_related_enzymes')}>
					{#if enzymeRows.length === 0}
						<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
					{:else}
						<ul class="divide-y text-sm">
							{#each enzymeRows as r (r.id)}
								<li class="flex flex-wrap items-center gap-2 py-1.5">
									<a class="underline" href="/enzymes/{r.id}">{r.name || shortPublicId(r.id)}</a>
									{#if r.ecNumber}<span>{r.ecNumber}</span>{/if}
									{#if r.enzymeClass}<span>{enumLabel('ec', r.enzymeClass)}</span>{/if}
									{#if r.sourceOrganism}<span class="text-xs text-muted-foreground"
											>{r.sourceOrganism}</span
										>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Section>
				<Section title={tr('protein_related_restriction_enzymes')}>
					{#if restrictionRows.length === 0}
						<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
					{:else}
						<ul class="divide-y text-sm">
							{#each restrictionRows as r (r.id)}
								<li class="flex flex-wrap items-center gap-2 py-1.5">
									<a class="underline" href="/restriction-enzymes/{r.id}"
										>{r.name || shortPublicId(r.id)}</a
									>
									{#if r.recognitionSite}<code class="text-[10px]"
											>{r.recognitionSite}{r.cutPosition ? ' · ' + r.cutPosition : ''}</code
										>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Section>
				<Section title={tr('gene_related_cds')}>
					{#if cdsRows.length === 0}
						<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
					{:else}
						<ul class="divide-y text-sm">
							{#each cdsRows as r (r.id)}
								<li class="flex flex-wrap items-center gap-2 py-1.5">
									<a class="underline" href="/genes/{r.geneId}">{shortPublicId(r.geneId)}</a>
									<Badge tone="muted">{enumLabel('grt', r.regionType)}</Badge>
									{#if r.startPosition != null && r.endPosition != null}
										<code class="text-[10px]">{r.startPosition}..{r.endPosition}</code>
									{/if}
									<span class="text-xs text-muted-foreground">{r.description}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</Section>
				<Section title={tr('protein_related_interactions')} hint={tr('protein_related_hint')}>
					{#if interRows.length === 0}
						<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
					{:else}
						<ul class="divide-y text-sm">
							{#each interRows as r (r.id)}
								<li class="flex flex-wrap items-center gap-2 py-1.5">
									<a class="underline" href="/interactions/{r.id}">{shortPublicId(r.id)}</a>
									<Badge tone="muted">{r.interactionType}</Badge>
									{#if r.affinityKd != null}<span class="text-xs text-muted-foreground"
											>Kd {r.affinityKd}</span
										>{/if}
									<span class="text-xs text-muted-foreground"
										>{shortPublicId(String(r.foldAId))} × {shortPublicId(String(r.foldBId))}</span
									>
								</li>
							{/each}
						</ul>
					{/if}
				</Section>
				<Section title={tr('protein_related_comparisons')}>
					{#if compRows.length === 0}
						<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
					{:else}
						<ul class="divide-y text-sm">
							{#each compRows as r (r.id)}
								<li class="flex flex-wrap items-center gap-2 py-1.5">
									<a class="underline" href="/comparisons/{r.id}">{shortPublicId(r.id)}</a>
									<span class="text-xs">{r.method} · {r.referenceKind}</span>
									<code class="text-[10px] text-muted-foreground"
										>{shortPublicId(String(r.referenceId))}</code
									>
									{#if r.metric && r.metric.rmsd != null}<Badge tone="info"
											>RMSD {r.metric.rmsd.toFixed(2)}</Badge
										>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Section>
			</div>
		{:else if tab === 'community'}
			<Section title={tr('protein_community_ledger')}>
				{#if ledgerLoading}
					<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
				{:else if ledger.length === 0}
					<p class="text-sm text-muted-foreground">{tr('protein_ledger_none')}</p>
				{:else}
					<ul class="divide-y text-sm">
						{#each ledger as l (`${l.kind}:${l.id}`)}
							<li class="flex flex-wrap items-center gap-2 py-1.5">
								<Badge
									tone={l.kind === 'contribution'
										? 'info'
										: l.kind === 'correction'
											? 'warn'
											: 'bad'}>{tr(`et_${l.kind}`)}</Badge
								>
								{#if l.id.startsWith('spd:')}<IdLink id={l.id} />{:else}<code class="text-xs"
										>{l.id.slice(0, 12)}</code
									>{/if}
								<span class="min-w-0 flex-1 truncate text-xs">{l.summary}</span>
								{#if l.status}<Badge tone="muted">{l.status}</Badge>{/if}
								<span class="text-xs text-muted-foreground"
									>{l.createdAt != null ? fmtTime(l.createdAt) : ''}</span
								>
								<a class="text-xs underline" href={`${routeByKind[l.kind]}`}
									>{tr('protein_ledger_all', { kind: tr(`et_${l.kind}`) })}</a
								>
							</li>
						{/each}
					</ul>
				{/if}
			</Section>
			<div class="grid gap-4 lg:grid-cols-2">
				<WikiPanel entityType="protein" entityId={protein.id} collapsible />
				<ReferencesPanel entityType="protein" entityId={protein.id} collapsible />
				<ProvenancePanel entityType="protein" entityId={protein.id} collapsible />
			</div>
		{/if}
	</div>

	<Dialog bind:open={showAdd} title={tr('protein_add_sequence')}>
		<div class="space-y-3">
			{#if formError}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">
					{formError}
				</p>{/if}
			<FormFields fields={FIELDS} bind:values />
			<div class="flex justify-end gap-2">
				<Button variant="ghost" onclick={() => (showAdd = false)}>{tr('common_cancel')}</Button>
				<Button onclick={addSequence} disabled={saving}>{tr('common_create')}</Button>
			</div>
		</div>
	</Dialog>

	<Dialog bind:open={showFeature} title={tr('protein_add_feature')} hint={tr('protein_feature_hint')}>
		<div class="space-y-3">
			{#if !canonicalSeqText}
				<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">
					{tr('features_no_sequence')}
				</p>
			{/if}
			{#if featureError}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">
					{featureError}
				</p>{/if}
			<FormFields fields={FEATURE_FIELDS} bind:values={featureValues} />
			<div class="flex justify-end gap-2">
				<Button variant="ghost" onclick={() => (showFeature = false)}>{tr('common_cancel')}</Button>
				<Button onclick={addFeature} disabled={savingFeature || !canonicalSeqText}
					>{tr('common_create')}</Button
				>
			</div>
		</div>
	</Dialog>
{/if}

<svelte:head><title>{protein?.preferredName ?? 'SPD'} · SPD</title></svelte:head>
