<script lang="ts">
	import { page } from '$app/state';
	import { proteins, sequences, folds, firstArray } from '$lib/api/client';
	import { SpdApiError } from '$lib/api/base';
	import type {
		ProteinRecord,
		ProteinAnnotationRecord,
		SequenceRecord,
		SequenceLineageData,
		SequenceTreeData,
		SequenceStabilityDomainData,
		MutationEffectAggregate,
		FoldRecord
	} from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime, EFFECT_CLASSES } from '$lib/format';
	import { toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/components/table';
	import IdLink from '$lib/components/IdLink.svelte';
	import DataView from '$lib/components/DataView.svelte';
	import DnaViewer from '$lib/gene/DnaViewer.svelte';
	import { annotationsToViewerFeatures } from '$lib/gene/utils/proteinView';
	import MutationTree from '$lib/components/MutationTree.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import ProvenancePanel from '$lib/components/ProvenancePanel.svelte';
	import RelationsPanel from '$lib/components/RelationsPanel.svelte';
	import ExternalIdentifiersPanel from '$lib/components/ExternalIdentifiersPanel.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import ExportMenu from '$lib/components/ExportMenu.svelte';
	import RecordActions from '$lib/components/RecordActions.svelte';
	import RecordContextBar from '$lib/components/RecordContextBar.svelte';
	import { fileStem, toFasta } from '$lib/export/bio';

	const id = $derived(page.params.id ?? '');

	let seq = $state<SequenceRecord | null>(null);
	let lineage = $state<SequenceLineageData | null>(null);
	let tree = $state<SequenceTreeData | null>(null);
	let mutAgg = $state<MutationEffectAggregate[]>([]);
	let foldRows = $state<FoldRecord[]>([]);
	// The stability domain belongs to THIS sequence: each sequence version
	// (native, mutant, variant) has its own folds and its own engine scan.
	let stabilityDomain = $state<SequenceStabilityDomainData | null>(null);
	// Feature rows pinned to THIS sequence version (0034): non-canonical
	// variants honestly return an empty list, and the viewer draws bare.
	let annotationRows = $state<ProteinAnnotationRecord[]>([]);
	// Mass / CRC64 are source-asserted entry facts living on the protein
	// row; the viewer only quotes them (never derives them).
	let parentProtein = $state<ProteinRecord | null>(null);
	let aaTheme = $state<'aa_family' | 'aa_chem'>('aa_family');
	let loading = $state(true);
	let error = $state('');
	let tab = $state('overview');

	async function load() {
		loading = true;
		error = '';
		const sid = id;
		// The six panel reads are keyed by the route id, not by the sequence
		// payload — start them beside `get` instead of queueing behind it.
		const reads = Promise.allSettled([
			sequences.lineage(sid),
			sequences.tree(sid),
			sequences.mutationEffects(sid),
			folds.query({ sequenceId: sid, limit: 100 }),
			sequences.annotations(sid),
			sequences.stabilityDomain(sid)
		]);
		try {
			seq = await sequences.get(sid);
		} catch (e) {
			error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
			seq = null;
			loading = false;
			return;
		}
		loading = false;
		void reads.then(([lin, tr2, agg, fq, ann, stability]) => {
			if (seq?.id !== sid) return;
			lineage = lin.status === 'fulfilled' ? lin.value : null;
			tree = tr2.status === 'fulfilled' ? tr2.value : null;
			mutAgg = agg.status === 'fulfilled' ? (Array.isArray(agg.value) ? agg.value : []) : [];
			foldRows =
				fq.status === 'fulfilled' ? firstArray<FoldRecord>(fq.value, 'folds', 'items', 'rows') : [];
			annotationRows = ann.status === 'fulfilled' ? ann.value.annotations : [];
			stabilityDomain = stability.status === 'fulfilled' ? stability.value : null;
		});
		if (seq.proteinId) {
			void proteins
				.get(seq.proteinId)
				.then((p) => {
					if (seq?.id === sid) parentProtein = p;
				})
				.catch(() => {
					if (seq?.id === sid) parentProtein = null;
				});
		}
	}
	$effect(() => void load());

	const foldColumns: Column<FoldRecord>[] = [
		{ key: 'id', label: tr('col_id') },
		{ key: 'inferenceProtocolVersion', label: tr('f_inferenceProtocolVersion') },
		{ key: 'verificationLevel', label: tr('f_verificationLevel') },
		{ key: 'createdAt', label: tr('f_createdAt'), format: (r) => fmtTime(r.createdAt) }
	];

	const tagList = $derived(Array.isArray(seq?.tags) ? (seq?.tags as unknown[]) : []);
	const exportBase = $derived(fileStem(seq?.proteinId ?? 'sequence', id));
	const featureRows = $derived(
		annotationsToViewerFeatures(annotationRows, seq?.length ?? Infinity)
	);
	const relatedActions = $derived(
		seq?.proteinId
			? [
					{
						label: tr('action_new_mutant'),
						href: `/submit/sequence?parentSequenceId=${seq.id}&proteinId=${seq.proteinId}`
					}
				]
			: []
	);
</script>

{#if loading}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{:else if !seq}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		<p class="font-medium">{tr('page_not_found')}</p>
		<p class="mt-1">{error}</p>
	</div>
{:else}
	<div class="space-y-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-xl font-bold">
					{tr('sequence_title')}
					<code class="font-mono text-sm">{seq.id.split(':').pop()?.slice(0, 12)}</code>
				</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<span>{tr('sequence_length')} {seq.length}</span>
					<Badge tone={seq.isNative ? 'ok' : seq.sequenceRole === 'mutant' ? 'warn' : 'muted'}>
						{tr(`seq_role_${seq.sequenceRole ?? 'variant'}`)}
					</Badge>
					<span>{seq.sequenceType}</span>
					<span>{tr('et_protein')}: <IdLink id={seq.proteinId} kind="protein" /></span>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<PageTools />
				<RecordActions
					entityType="sequence"
					id={seq.id}
					name={parentProtein?.preferredName ?? seq.id}
					href={`/sequences/${seq.id}`}
					record={seq}
					related={relatedActions}
				/>
				<ExportMenu
					formats={[
						{
							key: 'fasta',
							label: 'FASTA',
							filename: `${exportBase}.fasta`,
							build: () =>
								toFasta({
									name: seq!.proteinId ?? seq!.id,
									description: `${seq!.sequenceType} ${seq!.sequenceRole}`,
									sequence: seq!.sequence,
									molecule: 'protein'
								})
						}
					]}
				/>
				<IssuePanel entityType="sequence" entityId={seq.id} />
			</div>
			{#if session.signedIn}
				<div class="flex gap-2">
					<Button size="sm" href={`/submit/fold?sequenceId=${seq.id}`} variant="outline"
						>{tr('sequence_predict_fold')}</Button
					>
					<Button
						size="sm"
						href={`/submit/sequence?parentSequenceId=${seq.id}&proteinId=${seq.proteinId}`}
						variant="ghost">{tr('sequence_mutate')}</Button
					>
				</div>
			{/if}
		</div>

		<RecordContextBar
			entityType="sequence"
			entityId={seq.id}
			name={parentProtein?.preferredName ?? seq.id}
		/>

		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="text-sm font-semibold">{tr('aa_chain_title')}</h2>
			<div class="flex gap-1">
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
		</div>
		<div class="gene-view" style="height: 480px;">
			<DnaViewer
				dnaSeq={seq.normalizedSequence || seq.sequence}
				plasmidName={parentProtein?.preferredName ?? ''}
				mode="protein"
				colorTheme={aaTheme}
				assertedMass={parentProtein?.massDalton ?? null}
				assertedCrc64={parentProtein?.sequenceCrc64 ?? null}
				restrictionSites={[]}
				geneFeatures={featureRows.features}
				parts={[]}
				primers={[]}
			/>
		</div>
		{#if featureRows.unplaced > 0}
			<p class="text-xs text-muted-foreground">
				{tr('features_unplaced', { n: featureRows.unplaced })}
			</p>
		{/if}

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'overview', label: tr('tab_overview') },
				{ key: 'lineage', label: tr('tab_lineage') },
				{ key: 'tree', label: tr('tab_tree') },
				{ key: 'effects', label: tr('tab_effects'), badge: mutAgg.length },
				{ key: 'folds', label: tr('nav_folds'), badge: foldRows.length }
			]}
		/>

		{#if tab === 'overview'}
			<div class="grid gap-4 lg:grid-cols-2">
				<Section title={tr('protein_details')}>
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
						<dt class="text-muted-foreground">{tr('f_sha256')}</dt>
						<dd class="break-all font-mono text-xs">{seq.sha256}</dd>
						<dt class="text-muted-foreground">{tr('f_parentSequenceId')}</dt>
						<dd><IdLink id={seq.parentSequenceId} kind="sequence" /></dd>
						<dt class="text-muted-foreground">{tr('f_createdAt')}</dt>
						<dd>{fmtTime(seq.createdAt, true)}</dd>
					</dl>
					{#if Array.isArray(seq.mutations) && (seq.mutations as unknown[]).length > 0}
						<div class="mt-2 flex flex-wrap gap-1">
							{#each seq.mutations as m (JSON.stringify(m))}
								{@const mm = m as { from?: string; position?: number | string; to?: string }}
								<span class="font-mono text-xs"
									>{mm.from ?? '?'}{String(mm.position ?? '?')}{mm.to ?? '?'}</span
								>
							{/each}
						</div>
					{:else if seq.mutations}<DataView
							class="mt-2"
							label={tr('f_mutations')}
							value={seq.mutations}
						/>{/if}
					{#if tagList.length}
						<p class="mt-2 break-words">{tagList.join(' · ')}</p>
					{/if}
				</Section>
				<Section title={tr('sequence_raw')}>
					<pre class="max-h-48 overflow-auto font-mono text-xs leading-5">{seq.sequence}</pre>
				</Section>
			</div>
			<div class="grid gap-4 lg:grid-cols-2">
				<ExternalIdentifiersPanel entityType="sequence" entityId={seq.id} />
				<RelationsPanel entityType="sequence" entityId={seq.id} />
			</div>
		{:else if tab === 'lineage'}
			<Section title={tr('tab_lineage')}><MutationTree {lineage} selected={seq.id} /></Section>
		{:else if tab === 'tree'}
			<Section title={tr('tab_tree')}><MutationTree {tree} selected={seq.id} /></Section>
		{:else if tab === 'effects'}
			<Section title={tr('tab_effects')}>
				{#if mutAgg.length === 0}
					<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead
								><tr class="border-b text-left text-xs text-muted-foreground">
									<th class="py-1">{tr('f_position')}</th><th>{tr('f_measuredCount')}</th><th
										>{tr('f_dominantEffect')}</th
									><th>{tr('f_avgDg')}</th>
								</tr></thead
							>
							<tbody>
								{#each mutAgg as a (a.position)}
									<tr class="border-b last:border-0">
										<td class="py-1 font-mono">{a.position}</td>
										<td>{a.measuredCount}</td>
										<td><Badge tone="muted">{enumLabel('ec', a.dominantEffect)}</Badge></td>
										<td>{a.avgDg?.toFixed(2) ?? '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div class="mt-2 flex flex-wrap gap-2 text-xs">
						{#each EFFECT_CLASSES as c (c)}<Badge tone="muted">{enumLabel('ec', c)}</Badge>{/each}
					</div>
				{/if}
			</Section>
		{:else if tab === 'folds'}
			<div class="space-y-4">
				<Section
					title={tr('sequence_stability_domain')}
					hint={tr('sequence_stability_domain_hint')}
				>
					{#if stabilityDomain?.stabilityDomain}
						<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
							{#if stabilityDomain.foldId}
								<a class="underline" href={`/folds/${stabilityDomain.foldId}`}
									>{tr('sequence_stability_open_fold')}</a
								>
							{/if}
							<Badge tone="muted">
								{tr('fold_scan_points')}
								{firstArray(stabilityDomain.stabilityDomain.points ?? []).length}
							</Badge>
						</div>
						{#if stabilityDomain.stabilityDomain.summary}
							<DataView
								class="mt-2"
								label={tr('f_summary')}
								value={stabilityDomain.stabilityDomain.summary}
							/>
						{/if}
					{:else}
						<p class="text-sm text-muted-foreground">{tr('sequence_stability_domain_none')}</p>
					{/if}
				</Section>
				<Section title={tr('nav_folds')}>
					{#if foldRows.length === 0}
						<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
					{:else}
						<DataTable rows={foldRows} columns={foldColumns} hrefFor={(r) => `/folds/${r.id}`} />
					{/if}
				</Section>
			</div>
		{/if}

		<div class="grid gap-4 lg:grid-cols-2">
			<WikiPanel entityType="sequence" entityId={seq.id} />
			<ReferencesPanel entityType="sequence" entityId={seq.id} />

			<ProvenancePanel entityType="sequence" entityId={seq.id} />
		</div>
	</div>
{/if}

<svelte:head><title>{tr('sequence_title')} · SPD</title></svelte:head>
