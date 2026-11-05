<script lang="ts">
	import { page } from '$app/state';
	import { environments, models, folds, proteins, sequences } from '$lib/api/client';
	import type { SearchHit } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { BIOMOLECULE_CHARS } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';
	import TargetPicker from '$lib/components/TargetPicker.svelte';
	import SequenceText from '$lib/components/SequenceText.svelte';

	// The whole prediction chain in one pass — protein → sequence → fold —
	// mirroring the GUI's single publish action instead of three wizards that
	// hand-carry ids between them.
	type Source = 'new' | 'protein' | 'sequence';
	let source = $state<Source>(page.url.searchParams.get('sequenceId') ? 'sequence' : 'new');

	const PROTEIN_FIELDS: FormField[] = [
		{ name: 'preferredName', required: true },
		{ name: 'geneName' },
		{ name: 'organism_taxId', kind: 'organism', companion: 'organism_scientificName', label: tr('submit_organism_name'), hint: tr('organism_hint_pair') },
		{ name: 'tags', kind: 'list', hint: tr('form_hint_comma_list') },
		{ name: 'license', kind: 'select', options: ['CC-BY-4.0'] }
	];
	const SEQ_FIELDS: FormField[] = [
		{ name: 'sequence', kind: 'textarea', required: true, rows: 6, hint: tr('sequence_hint_letters') },
		{ name: 'parentSequenceId', picker: 'sequence', hint: tr('sequence_hint_parent') },
		{ name: 'mutationLines', kind: 'textarea', rows: 2, hint: tr('sequence_hint_mutation_lines') },
		{ name: 'tags', kind: 'list', hint: tr('form_hint_comma_list') },
		{ name: 'license', kind: 'select', options: ['CC-BY-4.0'] }
	];

	const ENV_MAIN: FormField[] = [
		{ name: 'ph', kind: 'number', required: true },
		{ name: 'temperatureK', kind: 'number', required: true, hint: tr('fold_hint_temp_kelvin') },
		{ name: 'pressureBar', kind: 'number', required: true },
		{ name: 'ionicStrengthM', kind: 'number', required: true },
		{ name: 'protonationModel' }
	];
	const ENV_ADV: FormField[] = [
		{ name: 'solvent', kind: 'json', hint: tr('form_hint_json_object') },
		{ name: 'customProtonation', kind: 'json' },
		{ name: 'normalization', kind: 'json', hint: tr('fold_hint_normalization') }
	];
	const ENV_FIELDS = [...ENV_MAIN, ...ENV_ADV];

	const MODEL_MAIN: FormField[] = [
		{ name: 'modelName', required: true },
		{ name: 'modelVersion', required: true },
		{ name: 'checkpointSha256', required: true, hint: tr('fold_hint_checkpoint_sha') },
		{ name: 'inputProtocolVersion', required: true },
		{ name: 'checkpointName' },
		{ name: 'trainedHeads', kind: 'list', hint: tr('form_hint_comma_list') }
	];
	const MODEL_ADV: FormField[] = [
		{ name: 'inferenceRuntime' },
		{ name: 'inferenceCodeVersion' },
		{ name: 'metadata', kind: 'json' }
	];
	const MODEL_FIELDS = [...MODEL_MAIN, ...MODEL_ADV];

	const FOLD_MAIN: FormField[] = [
		{ name: 'inferenceProtocolVersion', required: true },
		{ name: 'prediction', kind: 'json', required: true, rows: 10, hint: tr('fold_hint_prediction') },
		{
			name: 'artifactIds',
			kind: 'multiPick',
			hint: tr('form_hint_multi_pick'),
			pickKinds: ['full_structure_bincif', 'c_alpha_coordinates', 'md_trajectory'],
			uploadDefaultKind: 'full_structure_bincif'
		}
	];
	const FOLD_ADV: FormField[] = [
		{ name: 'derivedMetrics', kind: 'json' },
		{ name: 'runtimeMetadata', kind: 'json' },
		{ name: 'provenance', kind: 'json' }
	];
	const FOLD_FIELDS = [...FOLD_MAIN, ...FOLD_ADV];

	let protValues = $state<Record<string, string>>({ license: 'CC-BY-4.0' });
	let seqValues = $state<Record<string, string>>({ license: 'CC-BY-4.0' });
	let pickedProtein = $state<SearchHit | null>(null);
	let seqId = $state(String(page.url.searchParams.get('sequenceId') ?? ''));
	let seqPreview = $state<string>('');
	let envValues = $state<Record<string, string>>({ ph: '7.4', temperatureK: '310', pressureBar: '1', ionicStrengthM: '0.15', protonationModel: 'default' });
	let modelValues = $state<Record<string, string>>({});
	let foldValues = $state<Record<string, string>>({
		prediction: '{\n  "coordinates": [[0.0, 0.0, 0.0]]\n}',
		// ?artifactId= still honored for links from elsewhere
		artifactIds: String(page.url.searchParams.get('artifactId') ?? '')
	});

	const newSeqNormalized = $derived((seqValues.sequence ?? '').replace(/\s+/g, '').toUpperCase());
	const newSeqBadChars = $derived([...newSeqNormalized].filter((c) => !BIOMOLECULE_CHARS.includes(c)));

	// Plain-language point substitutions ("A45G" per line) → wire mutations.
	const MUT_RE = /^([A-Za-z])(\d+)([A-Za-z])$/;
	const parsedMutations = $derived.by(() => {
		const toks = (seqValues.mutationLines ?? '').split(/[,\s]+/).filter(Boolean);
		const out: Array<Record<string, unknown>> = [];
		for (const t of toks) {
			const m = MUT_RE.exec(t);
			if (!m) return { error: t, items: [] as Array<Record<string, unknown>> };
			out.push({ from: m[1].toUpperCase(), position: Number(m[2]), to: m[3].toUpperCase() });
		}
		return { error: '', items: out };
	});

	// prediction is almost never typed — it is the JSON a SPICE run exports.
	let predictionFile = $state<HTMLInputElement | null>(null);
	async function readPrediction() {
		const f = predictionFile?.files?.[0];
		if (!f) return;
		foldValues.prediction = await f.text();
		if (!foldValues.inferenceProtocolVersion) foldValues.inferenceProtocolVersion = 'spice-gui-fold-v1';
	}

	// the artifact id used to land here from a lone upload disclosure;
	// UploadPicker (the artifactIds field) now embeds that upload, chips and
	// all — the copy-paste ritual was retired with the second UI

	let error = $state('');
	let saving = $state(false);
	let receipts = $state<{
		protein?: { id: string; created: boolean };
		sequence?: { id: string; created: boolean; deduplicated?: boolean };
		env?: unknown;
		model?: unknown;
		fold?: { id: string; created: boolean; deduplicated?: boolean };
	}>({});

	async function previewSeq() {
		seqPreview = '';
		if (!seqId.trim()) return;
		try {
			const s = await sequences.get(seqId.trim());
			seqPreview = `${s.id} · ${s.length} aa · ${tr('et_protein')}: ${s.proteinId ?? '—'}`;
		} catch (e) {
			seqPreview = e instanceof Error ? e.message : String(e);
		}
	}

	// a ?sequenceId= deep link arrives already-picked; resolve its label once
	let seqPreviewed = $state(false);
	$effect(() => {
		if (!seqPreviewed && seqId.trim()) {
			seqPreviewed = true;
			void previewSeq();
		}
	});

	async function submitAll() {
		error = '';
		receipts = {};
		saving = true;
		try {
			// ---- 1. resolve the sequence the fold hangs off ----
			let sid = '';
			if (source === 'sequence') {
				if (!seqId.trim()) throw new Error(tr('form_required_missing'));
				sid = seqId.trim();
			} else {
				let proteinId = '';
				if (source === 'new') {
					const pb = buildSafe(protValues, PROTEIN_FIELDS);
					if (pb.error || !pb.body) throw new Error(pb.error ?? tr('form_required_missing'));
					const pbody = { ...pb.body } as Record<string, unknown>;
					if (pbody.organism_scientificName || pbody.organism_taxId) {
						pbody.organism = { scientificName: pbody.organism_scientificName ?? null, taxId: pbody.organism_taxId ?? null };
					}
					delete pbody.organism_scientificName;
					delete pbody.organism_taxId;
					if (!pbody.preferredName) throw new Error(tr('form_required_missing'));
					const pr = await proteins.create(pbody as never);
					proteinId = String(pr.protein.id);
					receipts.protein = { id: proteinId, created: !!pr.created };
				} else {
					if (!pickedProtein) throw new Error(tr('form_required_missing'));
					proteinId = pickedProtein.id;
				}
				const sb = buildSafe(seqValues, SEQ_FIELDS);
				if (sb.error || !sb.body) throw new Error(sb.error ?? tr('form_required_missing'));
				if (newSeqBadChars.length) throw new Error(`${tr('sequence_bad_chars')}: ${[...new Set(newSeqBadChars)].join(' ')}`);
				if (parsedMutations.error) throw new Error(`${tr('sequence_mutation_bad_token')}: ${parsedMutations.error}`);
				if (!newSeqNormalized) throw new Error(tr('form_required_missing'));
				const sbody: Record<string, unknown> = { proteinId, sequence: newSeqNormalized };
				if (sb.body.license) sbody.license = sb.body.license;
				if (sb.body.tags) sbody.tags = sb.body.tags;
				if (sb.body.parentSequenceId) sbody.parentSequenceId = sb.body.parentSequenceId;
				if (parsedMutations.items.length) sbody.mutations = parsedMutations.items;
				const sr = await sequences.create(sbody as never);
				sid = String(sr.sequence?.id ?? '');
				receipts.sequence = { id: sid, created: !!sr.created, deduplicated: sr.deduplicated };
			}

			// ---- 2. environment + model + fold (single submission, embedded) ----
			const env = buildSafe(envValues, ENV_FIELDS);
			const model = buildSafe(modelValues, MODEL_FIELDS);
			const fold = buildSafe(foldValues, FOLD_FIELDS);
			if (env.error || model.error || fold.error) throw new Error(env.error ?? model.error ?? fold.error ?? '');
			const envBody = env.body as Record<string, unknown>;
			const modelBody = model.body as Record<string, unknown>;
			const foldBody = fold.body as Record<string, unknown>;
			if (envBody.ph === undefined || envBody.temperatureK === undefined || envBody.pressureBar === undefined || envBody.ionicStrengthM === undefined) {
				throw new Error(tr('form_required_missing'));
			}
			if (!modelBody.modelName || !modelBody.modelVersion || !modelBody.checkpointSha256 || !modelBody.inputProtocolVersion) {
				throw new Error(tr('form_required_missing'));
			}
			if (!foldBody.prediction || !foldBody.inferenceProtocolVersion) throw new Error(tr('form_required_missing'));
			receipts.env = await environments.create(envBody as never);
			receipts.model = await models.create(modelBody as never);
			const r = await folds.create({
				sequenceId: sid,
				environment: envBody,
				model: modelBody,
				inferenceProtocolVersion: foldBody.inferenceProtocolVersion,
				prediction: foldBody.prediction,
				artifactIds: foldBody.artifactIds,
				derivedMetrics: foldBody.derivedMetrics,
				runtimeMetadata: foldBody.runtimeMetadata,
				provenance: foldBody.provenance
			} as never);
			receipts.fold = { id: String((r.fold as { id?: string })?.id ?? ''), created: !!r.created, deduplicated: r.deduplicated };
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<h1 class="text-2xl font-bold">{tr('submit_fold')}</h1>
	<p class="text-sm text-muted-foreground">{tr('fold_wizard_intro')}</p>

	{#if error}
		<p class="rounded-none bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
	{:else if receipts.fold}
		<div class="rounded-none bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-200">
			<p class="mb-1 font-semibold">{tr('chain_receipt')}</p>
			<ul class="space-y-0.5">
				{#if receipts.protein}<li>· <a class="underline font-mono" href="/proteins/{receipts.protein.id}">{receipts.protein.id}</a> {tr('et_protein')}{receipts.protein.created ? '' : ` · ${tr('submit_existed')}`}</li>{/if}
				{#if receipts.sequence}<li>· <a class="underline font-mono" href="/sequences/{receipts.sequence.id}">{receipts.sequence.id}</a> {tr('et_sequence')}{receipts.sequence.deduplicated || !receipts.sequence.created ? ` · ${tr('sequence_deduplicated')}` : ''}</li>{/if}
				{#if receipts.fold}<li>· <a class="underline font-mono" href="/folds/{receipts.fold.id}">{receipts.fold.id}</a> {tr('et_predicted_fold')}{receipts.fold.deduplicated || !receipts.fold.created ? ` · ${tr('fold_deduplicated')}` : ''}</li>{/if}
			</ul>
		</div>
		<div class="flex gap-2">
			<Button size="sm" href="/folds/{receipts.fold.id}">{tr('submit_go_fold')}</Button>
		</div>
	{/if}

	{#if session.signedIn}
		<Section title={tr('fold_source_title')}>
			<div class="flex flex-wrap gap-1">
				{#each ['new', 'protein', 'sequence'] as s (s)}
					<Button size="sm" variant={source === s ? 'primary' : 'secondary'} onclick={() => (source = s as Source)}>{tr(`fold_src_${s}`)}</Button>
				{/each}
			</div>

			{#if source === 'new'}
				<div class="mt-3">
					<FormFields fields={PROTEIN_FIELDS} bind:values={protValues} columns={2} />
				</div>
			{:else if source === 'protein'}
				<p class="mt-3 text-xs text-muted-foreground">{tr('fold_pick_protein')}</p>
				<div class="mt-1">
					<TargetPicker entityType="protein" onpick={(h) => (pickedProtein = h)} />
				</div>
			{/if}

			{#if source !== 'sequence'}
				<div class="mt-3 border-t pt-3">
					<FormFields fields={SEQ_FIELDS} bind:values={seqValues} />
					{#if newSeqNormalized}
						<p class="mt-2 text-xs text-muted-foreground">{tr('sequence_normalized_preview')} ({newSeqNormalized.length})</p>
						<SequenceText sequence={newSeqNormalized} />
					{/if}
					{#if parsedMutations.items.length}
						<p class="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
							{tr('sequence_mutation_preview', { n: parsedMutations.items.length })} ·
							{parsedMutations.items.map((m) => `${m.from}${m.position}${m.to}`).join('  ')}
						</p>
					{:else if parsedMutations.error}
						<p class="mt-2 text-xs text-amber-700 dark:text-amber-300">{tr('sequence_mutation_bad_token')}: {parsedMutations.error}</p>
					{/if}
				</div>
			{:else}
				<div class="mt-3">
					<TargetPicker
						entityType="sequence"
						initial={seqId ? { id: seqId } : undefined}
						onpick={(h) => { seqId = h?.id ?? ''; seqPreview = ''; if (seqId) void previewSeq(); }}
					/>
				</div>
				{#if seqPreview}<p class="mt-2 font-mono text-xs text-muted-foreground">{seqPreview}</p>{/if}
			{/if}
		</Section>

		<Section title={tr('fold_step_environment')}>
			<FormFields fields={ENV_MAIN} bind:values={envValues} columns={2} />
			<details class="mt-3">
				<summary class="cursor-pointer text-xs text-muted-foreground">{tr('submit_advanced')}</summary>
				<div class="mt-2"><FormFields fields={ENV_ADV} bind:values={envValues} columns={2} /></div>
			</details>
			{#if receipts.env}<p class="mt-2 text-xs text-muted-foreground">environmentSha256: <code>{String((receipts.env as { environmentSha256?: string })?.environmentSha256 ?? (receipts.env as { id?: string })?.id ?? '')}</code>{(receipts.env as { deduplicated?: boolean })?.deduplicated ? ` · ${tr('fold_dedup_env')}` : ''}</p>{/if}
		</Section>

		<Section title={tr('fold_step_model')}>
			<FormFields fields={MODEL_MAIN} bind:values={modelValues} columns={2} />
			<details class="mt-3">
				<summary class="cursor-pointer text-xs text-muted-foreground">{tr('submit_advanced')}</summary>
				<div class="mt-2"><FormFields fields={MODEL_ADV} bind:values={modelValues} columns={2} /></div>
			</details>
			{#if receipts.model}<p class="mt-2 text-xs text-muted-foreground">identitySha256: <code>{String((receipts.model as { identitySha256?: string })?.identitySha256 ?? '')}</code></p>{/if}
		</Section>

		<Section title={tr('fold_step_prediction')}>
			<div class="mb-2 flex flex-wrap gap-2">
				<Button size="xs" variant="outline" onclick={() => predictionFile?.click()}>{tr('fold_load_prediction_file')}</Button>
				<input bind:this={predictionFile} type="file" accept=".json,application/json" class="hidden" onchange={readPrediction} />
			</div>
			<FormFields fields={FOLD_MAIN} bind:values={foldValues} />
			<details class="mt-3">
				<summary class="cursor-pointer text-xs text-muted-foreground">{tr('submit_advanced')}</summary>
				<div class="mt-2"><FormFields fields={FOLD_ADV} bind:values={foldValues} /></div>
			</details>
		</Section>

		<div class="flex justify-end">
			<Button onclick={submitAll} disabled={saving}>{tr('fold_submit_all')}</Button>
		</div>
	{:else}
		<div class="flex items-center gap-3 rounded-none border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
			{tr('submit_login_needed')}
			<Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		</div>
	{/if}
</div>

<svelte:head><title>{tr('submit_fold')} · SPD</title></svelte:head>
