<script lang="ts">
	import { page } from '$app/state';
	import { folds, sequences, artifacts as artifactApi, firstArray } from '$lib/api/client';
	import { SpdApiError } from '$lib/api/base';
	import type {
		FoldRecord,
		SequenceRecord,
		FoldArtifactsData,
		FoldHistoryData,
		CanonicalAssessmentRecord,
		ValidationDigest,
		MdVerificationRecord,
		StabilityScanRecord,
		PocketAnalysisRecord,
		ObservedStructureRecord
	} from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import {
		fmtTime,
		shortPublicId,
		ASSESSMENT_STATUSES,
		INTERACTION_TYPES,
		REFERENCE_KINDS,
		LICENSES
	} from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import IdLink from '$lib/components/IdLink.svelte';
	import DataView from '$lib/components/DataView.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';
	import MolViewer from '$lib/components/mol/MolViewer.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import ProvenancePanel from '$lib/components/ProvenancePanel.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import ValidationForm from '$lib/components/ValidationForm.svelte';
	import UploadPicker from '$lib/components/UploadPicker.svelte';

	const id = $derived(page.params.id ?? '');

	let fold = $state<FoldRecord | null>(null);
	let seq = $state<SequenceRecord | null>(null);
	let artData = $state<FoldArtifactsData | null>(null);
	let history = $state<FoldHistoryData | null>(null);
	let assessment = $state<{
		current: CanonicalAssessmentRecord | null;
		assessments: CanonicalAssessmentRecord[];
	} | null>(null);
	let loading = $state(true);
	let error = $state('');
	let tab = $state('viewer');

	async function load() {
		loading = true;
		error = '';
		const fid = id;
		// Artifacts, history and assessment are keyed by the route id; only
		// the sequence read needs the fold payload. They race the record.
		const aux = Promise.allSettled([
			folds.artifacts(fid),
			folds.history(fid),
			folds.assessment(fid)
		]);
		try {
			fold = await folds.get(fid);
		} catch (e) {
			error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
			fold = null;
			loading = false;
			return;
		}
		loading = false;
		void aux.then(([a, h, as]) => {
			if (fold?.id !== fid) return;
			artData = a.status === 'fulfilled' ? a.value : null;
			history = h.status === 'fulfilled' ? h.value : null;
			assessment = as.status === 'fulfilled' ? as.value : null;
		});
		if (fold.sequenceId) {
			void sequences
				.get(fold.sequenceId)
				.then((s) => {
					if (fold?.id === fid) seq = s as SequenceRecord;
				})
				.catch(() => {
					if (fold?.id === fid) seq = null;
				});
		}
	}
	$effect(() => void load());

	const artifactRows = $derived(artData?.artifacts ?? []);
	let appendIds = $state('');
	let appending = $state(false);

	async function appendArtifacts() {
		const ids = appendIds
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		if (ids.length === 0) return;
		appending = true;
		try {
			artData = await folds.appendArtifacts(id, ids);
			appendIds = '';
			toastOk(tr('fold_artifacts_appended'));
		} catch (e) {
			toastErr(e);
		} finally {
			appending = false;
		}
	}

	// ---------------------------------------------------------------- forms ----

	let dialog = $state<
		| ''
		| 'md'
		| 'scan'
		| 'pocket'
		| 'observed'
		| 'interaction'
		| 'comparison'
		| 'assessment'
		| 'validation'
	>('');
	let values = $state<Record<string, string>>({});
	let formError = $state('');
	let saving = $state(false);

	const MD_FIELDS: FormField[] = [
		{ name: 'engine', kind: 'json', hint: tr('fold_hint_engine') },
		{ name: 'request', kind: 'json' },
		{ name: 'result', kind: 'json', hint: tr('fold_hint_result') },
		{
			name: 'artifact_ids',
			kind: 'multiPick',
			hint: tr('form_hint_multi_pick'),
			pickKinds: ['md_trajectory', 'energy_history'],
			uploadDefaultKind: 'md_trajectory'
		},
		{ name: 'license', kind: 'select', options: [...LICENSES] }
	];
	const SCAN_FIELDS: FormField[] = [
		{ name: 'grid', kind: 'json', hint: tr('fold_hint_grid') },
		{ name: 'points', kind: 'objectList', hint: tr('fold_hint_points') },
		{ name: 'summary', kind: 'json' },
		{ name: 'license', kind: 'select', options: [...LICENSES] }
	];
	const POCKET_FIELDS: FormField[] = [
		{ name: 'method', kind: 'json' },
		{ name: 'features', kind: 'objectList', hint: tr('fold_hint_features') },
		{
			name: 'artifact_ids',
			kind: 'multiPick',
			hint: tr('form_hint_multi_pick'),
			pickKinds: ['pocket_geometry'],
			uploadDefaultKind: 'pocket_geometry'
		},
		{ name: 'license', kind: 'select', options: [...LICENSES] }
	];
	const OBSERVED_FIELDS: FormField[] = [
		{ name: 'method', required: true },
		{
			name: 'coordinates_artifact_id',
			kind: 'artifactPick',
			required: true,
			hint: tr('fold_hint_artifact_id'),
			pickKinds: ['full_structure_bincif', 'c_alpha_coordinates'],
			uploadDefaultKind: 'full_structure_bincif'
		},
		{ name: 'quality', kind: 'json' },
		{ name: 'environment', kind: 'json' },
		{ name: 'comparison', kind: 'json' },
		// Round 9 (0036): three declared scalars. The observer states them;
		// SPD never recomputes a resolution, coverage or an RMSD.
		{ name: 'resolution_angstrom', kind: 'number', hint: tr('fold_declared_hint') },
		{ name: 'coverage', kind: 'number', hint: tr('fold_declared_hint') },
		{ name: 'rmsd_to_reference', kind: 'number', hint: tr('fold_declared_hint') }
	];
	const INTERACTION_FIELDS: FormField[] = [
		{ name: 'foldBId', required: true, picker: 'fold', hint: tr('fold_hint_other_fold') },
		{
			name: 'interactionType',
			kind: 'select',
			required: true,
			options: [...INTERACTION_TYPES],
			ns: 'it'
		},
		{ name: 'affinityKd', kind: 'number' },
		{ name: 'bindingSites', kind: 'json' },
		{ name: 'notes' }
	];
	const COMPARISON_FIELDS: FormField[] = [
		{
			name: 'referenceKind',
			kind: 'select',
			required: true,
			options: [...REFERENCE_KINDS],
			ns: 'rk'
		},
		{ name: 'referenceId', required: true },
		{ name: 'metric', kind: 'json', required: true, hint: tr('fold_hint_metric') },
		{ name: 'method', required: true },
		{ name: 'methodVersion' },
		{ name: 'notes' }
	];
	const ASSESSMENT_FIELDS = $derived<FormField[]>([
		{
			name: 'status',
			kind: 'select',
			required: true,
			options: [...ASSESSMENT_STATUSES],
			ns: 'ast'
		},
		{ name: 'fold_state' },
		{ name: 'confidence', kind: 'number', hint: tr('form_hint_0_1') },
		{ name: 'evidence', kind: 'json' },
		{ name: 'interpretation', kind: 'textarea', required: true, rows: 3 },
		{
			name: 'supersedes_id',
			kind: 'select',
			hint: tr('fold_hint_supersedes'),
			// the versions already on screen are exactly the candidates — the
			// contributor points at one instead of retyping its uuid
			options: (assessment?.assessments ?? []).map((a) => ({
				value: a.id,
				label: `${enumLabel('ast', a.status)} · ${fmtTime(a.generatedAt, true)} · ${shortPublicId(a.id, 8)}`
			}))
		}
	]);

	const fieldsets = $derived({
		md: MD_FIELDS,
		scan: SCAN_FIELDS,
		pocket: POCKET_FIELDS,
		observed: OBSERVED_FIELDS,
		interaction: INTERACTION_FIELDS,
		comparison: COMPARISON_FIELDS,
		assessment: ASSESSMENT_FIELDS
	});

	function openDialog(kind: keyof typeof fieldsets | 'validation') {
		dialog = kind;
		formError = '';
		values = { license: 'CC-BY-4.0' };
	}

	async function submitDialog() {
		if (!fold || dialog === '' || dialog === 'validation') return;
		formError = '';
		const fields = fieldsets[dialog];
		const { body, error: parseErr } = buildSafe(values, fields);
		if (parseErr || !body) return (formError = parseErr ?? tr('form_required_missing'));
		saving = true;
		try {
			let receipt: { id?: string };
			switch (dialog) {
				case 'md':
					receipt = await folds.mdVerifications(fold.id, body);
					break;
				case 'scan':
					receipt = await folds.stabilityScans(fold.id, body);
					break;
				case 'pocket':
					receipt = await folds.pocketAnalyses(fold.id, body);
					break;
				case 'observed':
					receipt = await folds.observedStructures(fold.id, body as never);
					break;
				case 'interaction': {
					const { foldBId, interactionType, affinityKd, bindingSites, notes } = body as Record<
						string,
						unknown
					>;
					receipt = await (
						await import('$lib/api/client')
					).interactions.create({
						foldAId: fold.id,
						foldBId: String(foldBId),
						interactionType: String(interactionType),
						affinityKd: affinityKd as number | undefined,
						bindingSites,
						notes: notes as string | undefined
					});
					break;
				}
				case 'comparison': {
					const c = (await import('$lib/api/client')).comparisons;
					receipt = await c.create({ ...body, foldId: fold.id } as never);
					break;
				}
				case 'assessment': {
					receipt = await folds.postAssessment(fold.id, body as never);
					break;
				}
				default:
					throw new Error('unknown dialog');
			}
			toastOk(
				receipt?.id
					? `${tr('fold_analysis_saved')} · ${String(receipt.id).slice(0, 14)}`
					: tr('fold_analysis_saved')
			);
			dialog = '';
			await load();
		} catch (e) {
			formError = e instanceof Error ? e.message : String(e);
			toastErr(e);
		} finally {
			saving = false;
		}
	}

	async function recalculate() {
		if (!fold) return;
		try {
			await folds.recalculate(fold.id);
			toastOk(tr('fold_recalculated'));
			await load();
		} catch (e) {
			toastErr(e);
		}
	}

	const mdItems = $derived(firstArray<MdVerificationRecord>(history?.mdVerifications ?? []));
	const scanItems = $derived(firstArray<StabilityScanRecord>(history?.stabilityScans ?? []));
	const pocketItems = $derived(firstArray<PocketAnalysisRecord>(history?.pocketAnalyses ?? []));
	const validationItems = $derived(firstArray<ValidationDigest>(history?.validations ?? []));
	const observedItems = $derived(
		firstArray<ObservedStructureRecord>(history?.observedStructures ?? [])
	);
</script>

{#if loading}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{:else if !fold}
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
					{tr('fold_title')}
					<code class="font-mono text-sm">{fold.id.split(':').pop()?.slice(0, 12)}</code>
				</h1>
				<div class="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
					<StatusBadge status={fold.verificationLevel} ns="vl" />
					<StatusBadge status={fold.validationStatus} ns="vs" />
					{#if fold.canonicalEvidenceStatus}<StatusBadge status={fold.canonicalEvidenceStatus} ns="ast" />{/if}
				</div>
				<p class="mt-1.5 text-xs text-muted-foreground">
					{tr('et_sequence')}: <IdLink id={fold.sequenceId} kind="sequence" /> ·
					{tr('f_environmentId')}: <IdLink id={fold.environmentId} /> ·
					{tr('f_modelId')}: <IdLink id={fold.modelId} />
				</p>
			</div>
			<PageTools />
			<IssuePanel entityType="fold" entityId={fold.id} />
			<div class="flex flex-wrap items-center gap-2">
				{#if session.signedIn}
					<Button size="sm" onclick={() => openDialog('validation')}
						>{tr('fold_add_validation')}</Button
					>
					<Button size="sm" variant="outline" onclick={recalculate}>{tr('fold_recalculate')}</Button
					>
				{/if}
			</div>
		</div>

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'viewer', label: tr('mol_3d_view') },
				{ key: 'identity', label: tr('fold_tab_identity') },
				{
					key: 'analyses',
					label: tr('fold_tab_analyses'),
					badge: mdItems.length + scanItems.length + pocketItems.length
				},
				{
					key: 'evidence',
					label: tr('fold_tab_evidence'),
					badge: validationItems.length + observedItems.length
				},
				{
					key: 'assessment',
					label: tr('fold_tab_assessment'),
					badge: assessment?.assessments?.length ?? 0
				},
				{ key: 'artifacts', label: tr('f_artifactIds'), badge: artifactRows.length }
			]}
		/>

		{#if tab === 'viewer'}
			<MolViewer
				prediction={(fold.prediction as Record<string, unknown> | undefined) ?? null}
				sequence={seq?.normalizedSequence || seq?.sequence}
				artifacts={artifactRows}
			/>
			{#if fold.prediction}
				<DataView class="mt-3" label={tr('fold_prediction_json')} value={fold.prediction} />
			{/if}
		{:else if tab === 'identity'}
			<div class="grid gap-4 lg:grid-cols-2">
				<Section title={tr('fold_tab_identity')}>
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
						<dt class="text-muted-foreground">{tr('f_inferenceProtocolVersion')}</dt>
						<dd>{fold.inferenceProtocolVersion ?? '—'}</dd>
						<dt class="text-muted-foreground">{tr('f_sequenceSha256')}</dt>
						<dd class="break-all font-mono text-xs">{fold.sequenceSha256}</dd>
						<dt class="text-muted-foreground">{tr('f_environmentSha256')}</dt>
						<dd class="break-all font-mono text-xs">{fold.environmentSha256}</dd>
						<dt class="text-muted-foreground">{tr('f_modelIdentitySha256')}</dt>
						<dd class="break-all font-mono text-xs">{fold.modelIdentitySha256}</dd>
						<dt class="text-muted-foreground">{tr('f_foldIdentityHash')}</dt>
						<dd class="break-all font-mono text-xs">{fold.foldIdentityHash}</dd>
						<dt class="text-muted-foreground">{tr('f_createdAt')}</dt>
						<dd>{fmtTime(fold.createdAt, true)}</dd>
					</dl>
				</Section>
				<Section title={tr('fold_metrics')}>
					{#if fold.derivedMetrics}<DataView
							label={tr('f_derivedMetrics')}
							value={fold.derivedMetrics}
						/>{:else}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>{/if}
				</Section>
			</div>
		{:else if tab === 'analyses'}
			<div class="mb-3 flex gap-2">
				{#if session.signedIn}
					<Button size="xs" variant="outline" onclick={() => openDialog('md')}
						>{tr('fold_add_md')}</Button
					>
					<Button size="xs" variant="outline" onclick={() => openDialog('scan')}
						>{tr('fold_add_scan')}</Button
					>
					<Button size="xs" variant="outline" onclick={() => openDialog('pocket')}
						>{tr('fold_add_pocket')}</Button
					>
				{/if}
			</div>
			<div class="space-y-4">
				<Section title={tr('fold_md_list')}>
					{#if mdItems.length === 0}<p class="text-sm text-muted-foreground">
							{tr('common_empty')}
						</p>
					{:else}
						<ul class="space-y-2">
							{#each mdItems as m (m.id)}
								<li class="rounded-none border p-2">
									<div class="flex items-center gap-2 text-xs">
										<IdLink id={m.id} /><StatusBadge status={m.verificationLevel} ns="vl" />
										{#each m.qualityLabels ?? [] as l}<Badge tone="muted">{l}</Badge>{/each}
										<span class="ml-auto">{fmtTime(m.createdAt)}</span>
									</div>
									{#if m.result}<DataView
											class="mt-1"
											label={tr('f_result')}
											value={m.result}
										/>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Section>
				<Section title={tr('fold_scan_list')}>
					{#if scanItems.length === 0}<p class="text-sm text-muted-foreground">
							{tr('common_empty')}
						</p>
					{:else}
						<ul class="space-y-2">
							{#each scanItems as s (s.id)}
								<li class="rounded-none border p-2 text-xs">
									<IdLink id={s.id} /> · {tr('fold_scan_points')}
									{firstArray(s.points ?? []).length}
									{#if s.summary}<DataView
											class="mt-1"
											label={tr('f_summary')}
											value={s.summary}
										/>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Section>
				<Section title={tr('fold_pocket_list')}>
					{#if pocketItems.length === 0}<p class="text-sm text-muted-foreground">
							{tr('common_empty')}
						</p>
					{:else}
						<ul class="space-y-2">
							{#each pocketItems as p (p.id)}
								<li class="rounded-none border p-2 text-xs">
									<IdLink id={p.id} /> · {fmtTime(p.createdAt)}
									{#if p.features}<DataView
											class="mt-1"
											label={tr('f_features')}
											value={p.features}
										/>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Section>
			</div>
		{:else if tab === 'evidence'}
			<div class="mb-3 flex flex-wrap gap-2">
				{#if session.signedIn}
					<Button size="xs" variant="outline" onclick={() => openDialog('validation')}
						>{tr('fold_add_validation')}</Button
					>
					<Button size="xs" variant="outline" onclick={() => openDialog('observed')}
						>{tr('fold_add_observed')}</Button
					>
					<Button size="xs" variant="outline" onclick={() => openDialog('interaction')}
						>{tr('fold_add_interaction')}</Button
					>
					<Button size="xs" variant="outline" onclick={() => openDialog('comparison')}
						>{tr('fold_add_comparison')}</Button
					>
				{/if}
			</div>
			<div class="space-y-4">
				<Section title={tr('fold_validation_list')}>
					{#if validationItems.length === 0}<p class="text-sm text-muted-foreground">
							{tr('common_empty')}
						</p>
					{:else}
						<ul class="divide-y">
							{#each validationItems as v (v.id)}
								<li class="flex items-center justify-between gap-2 py-1.5 text-sm">
									<a class="font-mono text-xs underline" href={`/validations/${v.id}`}
										>{String(v.id).slice(0, 12)}…</a
									>
									<StatusBadge status={v.status} ns="vs" />
									<span class="text-xs text-muted-foreground"
										>{enumLabel('vt', v.validationType)}</span
									>
									<span class="ml-auto text-xs text-muted-foreground">{fmtTime(v.createdAt)}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</Section>
				<Section title={tr('fold_observed_list')}>
					{#if observedItems.length === 0}<p class="text-sm text-muted-foreground">
							{tr('common_empty')}
						</p>
					{:else}
						<ul class="divide-y text-sm">
							{#each observedItems as o (o.id)}
								<li class="flex flex-wrap items-center gap-2 py-1.5">
									<IdLink id={o.id} /><span>{o.method}</span>
									<span class="text-xs text-muted-foreground"
										>{tr('f_coordinatesArtifactId')}: <IdLink id={o.coordinatesArtifactId} /></span
									>
									{#if o.resolutionAngstrom != null}<span title={tr('f_resolutionAngstrom')}
											>{Number(o.resolutionAngstrom).toFixed(2)} Å {tr('declared_badge')}</span
										>{/if}
									{#if o.coverage != null}<span title={tr('f_coverage')}
											>{(Number(o.coverage) * 100).toFixed(0)}% {tr('declared_badge')}</span
										>{/if}
									{#if o.rmsdToReference != null}<span title={tr('f_rmsdToReference')}
											>{Number(o.rmsdToReference).toFixed(2)} Å {tr('declared_badge')}</span
										>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Section>
			</div>
		{:else if tab === 'assessment'}
			<div class="mb-3 flex gap-2">
				{#if session.signedIn}<Button
						size="xs"
						variant="outline"
						onclick={() => openDialog('assessment')}>{tr('fold_add_assessment')}</Button
					>{/if}
				{#if session.signedIn}<Button size="xs" variant="ghost" onclick={recalculate}
						>{tr('fold_recalculate')}</Button
					>{/if}
			</div>
			<Section title={tr('fold_assessment_list')}>
				{#if !assessment?.assessments?.length}<p class="text-sm text-muted-foreground">
						{tr('common_empty')}
					</p>
				{:else}
					<ol class="space-y-3">
						{#each assessment.assessments as a (a.id)}
							<li class="rounded-none border p-3">
								<div class="flex flex-wrap items-center gap-2 text-xs">
									<StatusBadge status={a.status} ns="ast" />
									<span>{tr('fold_confidence_model')}: {a.confidenceModel}</span>
									<span>{tr('f_confidence')}: {a.confidence ?? '—'}</span>
									<span class="ml-auto">{fmtTime(a.generatedAt, true)}</span>
								</div>
								<p class="mt-2 text-sm">{a.interpretation}</p>
								{#if a.foldState}<p class="mt-1 text-xs text-muted-foreground">
										{tr('f_foldState')}: {a.foldState}
									</p>{/if}
								{#if a.evidence}<DataView
										class="mt-1"
										label={tr('f_evidence')}
										value={a.evidence}
									/>{/if}
							</li>
						{/each}
					</ol>
				{/if}
			</Section>
		{:else if tab === 'artifacts'}
			<Section title={tr('fold_artifact_list')}>
				{#if (artData?.missingArtifactIds ?? []).length}
					<p
						class="mb-2 rounded-none bg-amber-50 dark:bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300"
					>
						{tr('fold_missing_artifacts')}: {(artData?.missingArtifactIds ?? []).join(', ')}
					</p>
				{/if}
				{#if artifactRows.length === 0}<p class="text-sm text-muted-foreground">
						{tr('common_empty')}
					</p>
				{:else}
					<ul class="divide-y">
						{#each artifactRows as a (a.id)}
							<li class="flex flex-wrap items-center gap-3 py-2 text-sm">
								<a class="font-mono text-xs underline" href={`/artifacts/${a.id}`}
									>{a.id.split(':').pop()?.slice(0, 12)}…</a
								>
								<Badge tone="muted">{enumLabel('ak', a.kind)}</Badge>
								<span class="text-xs text-muted-foreground">{a.mediaType} · {a.byteLength} B</span>
								<StatusBadge status={a.status} ns="ast" />
								{#if a.status === 'completed'}
									<a
										class="ml-auto text-xs font-medium text-primary underline"
										href={artifactApi.downloadUrl(a.id)}
										title={tr('artifact_download_hint')}>⬇ {tr('artifact_download')}</a
									>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
				<p class="mt-3 text-xs text-muted-foreground">{tr('fold_artifacts_immutable')}</p>
				{#if session.signedIn}
					<div class="mt-3 space-y-2 border-t pt-3">
						<UploadPicker multiple bind:value={appendIds} />
						<div class="flex items-center gap-1">
							<Button size="sm" disabled={!appendIds || appending} onclick={appendArtifacts}>
								{tr('fold_artifacts_append')}
							</Button>
							<InfoTip
								text={tr('fold_artifacts_append_hint')}
								label={`${tr('fold_artifacts_append')} — ${tr('common_more_info')}`}
							/>
						</div>
					</div>
				{/if}
			</Section>
		{/if}

		<div class="grid gap-4 lg:grid-cols-2">
			<WikiPanel entityType="fold" entityId={fold.id} />
			<ReferencesPanel entityType="fold" entityId={fold.id} />

			<ProvenancePanel entityType="fold" entityId={fold.id} />
		</div>
	</div>

	<Dialog
		open={dialog !== '' && dialog !== 'validation'}
		onclose={() => (dialog = '')}
		title={tr('common_create')}
		width="max-w-3xl"
	>
		<div class="space-y-3">
			{#if formError}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">
					{formError}
				</p>{/if}
			{#if dialog !== '' && dialog !== 'validation'}
				<FormFields fields={fieldsets[dialog]} bind:values columns={2} />
			{/if}
			<div class="flex justify-end gap-2">
				<Button variant="ghost" onclick={() => (dialog = '')}>{tr('common_cancel')}</Button>
				<Button onclick={submitDialog} disabled={saving}>{tr('common_submit')}</Button>
			</div>
		</div>
	</Dialog>

	<Dialog open={dialog === 'validation'} onclose={() => (dialog = '')} title={tr('fold_add_validation')} width="max-w-3xl">
		<ValidationForm
			foldId={fold.id}
			ondone={() => {
				dialog = '';
				void load();
			}}
		/>
	</Dialog>
{/if}

<svelte:head><title>{tr('fold_title')} · SPD</title></svelte:head>
