<script lang="ts">
	import { validations } from '$lib/api/client';
	import type { ValidationInput, ReviewRecord } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { toastOk } from '$lib/state/toast.svelte';
	import { VALIDATION_TYPES, RELATIONSHIPS, ENVIRONMENT_MATCHES, LICENSES } from '$lib/format';
	import Button from './Button.svelte';
	import Badge from './Badge.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import IdLink from './IdLink.svelte';
	import Textarea from './Textarea.svelte';
	import FormFields from './FormFields.svelte';
	import type { FormField } from './form';
	import { buildSafe } from './form-values';
	import { draft } from '$lib/state/drafts.svelte';
	import DraftNote from './DraftNote.svelte';

	// Doubles as the new-validation form (submit mode) and the revision form
	// (revise mode) so a peer-review bounce-back is answered with the same
	// plain fields, never a raw JSON payload textarea.
	let {
		foldId = '',
		ondone = undefined,
		mode = 'submit',
		validationId = '',
		initial = undefined,
		reviews = []
	}: {
		foldId?: string;
		ondone?: () => void;
		mode?: 'submit' | 'revise';
		validationId?: string;
		initial?: Record<string, string>;
		reviews?: ReviewRecord[];
	} = $props();

	const isRevise = $derived(mode === 'revise');

	// Wet-lab people describe measurements, not JSON. The flat fields below
	// compile to the wire shapes (assay / targetEnvironment / observations);
	// raw-JSON overrides stay available under the advanced disclosure.
	const MAIN_FIELDS: FormField[] = [
		{
			name: 'validationType',
			kind: 'select',
			required: true,
			options: [...VALIDATION_TYPES],
			ns: 'vt'
		},
		{ name: 'targetSequenceId', picker: 'sequence', hint: tr('validation_hint_target_sequence') },
		{
			name: 'assay_method',
			required: true,
			label: tr('validation_field_assay_method'),
			hint: tr('validation_hint_assay_method')
		},
		{
			name: 'assay_details',
			kind: 'textarea',
			rows: 2,
			label: tr('validation_field_assay_details')
		},
		{ name: 'env_ph', kind: 'number', label: 'pH' },
		{
			name: 'env_temperatureK',
			kind: 'number',
			label: tr('validation_field_temp'),
			hint: tr('fold_hint_temp_kelvin')
		},
		{ name: 'env_pressureBar', kind: 'number', label: tr('validation_field_pressure') },
		{ name: 'env_ionicStrengthM', kind: 'number', label: tr('validation_field_ion') },
		{ name: 'env_description', label: tr('validation_field_env_desc') },
		{
			name: 'observationsLines',
			kind: 'textarea',
			rows: 4,
			required: true,
			label: tr('validation_field_observations'),
			hint: tr('validation_hint_obs_lines')
		},
		{
			name: 'relationshipToPrediction',
			kind: 'select',
			required: true,
			options: [...RELATIONSHIPS],
			ns: 'rel',
			label: tr('validation_field_relationship')
		},
		{
			name: 'environmentMatched',
			kind: 'select',
			required: true,
			options: [...ENVIRONMENT_MATCHES],
			ns: 'em',
			label: tr('validation_field_envMatch')
		},
		{ name: 'confidence', kind: 'number', hint: tr('form_hint_0_1') },
		{ name: 'notes', kind: 'textarea', rows: 3, label: tr('validation_field_notes') },
		{
			name: 'artifactIds',
			kind: 'multiPick',
			label: tr('supplementary_materials'),
			hint: tr('supplementary_zip_hint'),
			pickKinds: ['supplementary_zip'],
			uploadDefaultKind: 'supplementary_zip'
		},
		{ name: 'license', kind: 'select', required: true, options: [...LICENSES] }
	];
	const ADV_FIELDS: FormField[] = [
		{ name: 'assay', kind: 'json', hint: tr('validation_hint_assay') },
		{ name: 'targetEnvironment', kind: 'json', hint: tr('validation_hint_env') }
	];
	// a revision must say what changed — the ledger needs a human sentence
	const REVISE_FIELDS: FormField[] = [
		{
			name: 'changeSummary',
			required: true,
			label: tr('revision_change_summary'),
			hint: tr('revision_change_summary_hint')
		}
	];

	// seed once from `initial` (a prefill snapshot) — later changes to the prop
	// are intentionally not tracked
	// svelte-ignore state_referenced_locally
	const BLANK: Record<string, string> = {
		license: 'CC-BY-4.0',
		environmentMatched: 'exact',
		validationType: 'fold_stability',
		...(initial ?? {})
	};
	let values = $state<Record<string, string>>({ ...BLANK });
	// A wet-lab report is the longest form in SPD. The slot is per record, so a
	// half-written revision of validation X can never surface on Y.
	// svelte-ignore state_referenced_locally
	const draftKey = isRevise ? `validation-revise/${validationId}` : `validation/${foldId}`;
	let error = $state('');
	let saving = $state(false);
	let done = $state<string | null>(null);

	// `method | result | units` per line — e.g. "DSF | Tm = 58.2 | °C".
	const parsedObs = $derived.by(() => {
		const lines = (values.observationsLines ?? '')
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);
		const items: Array<Record<string, string>> = [];
		for (const l of lines) {
			const parts = l.split('|').map((p) => p.trim());
			if (!parts[0] || !parts[1]) return { error: l, items: [] };
			items.push({ method: parts[0], result: parts[1], units: parts[2] ?? '' });
		}
		return { error: '', items };
	});

	// Reviews that ask the author for something: a published request_revision
	// or a critical verdict. Journal convention (JMIR and friends) makes the
	// point-by-point response mandatory alongside the revised manuscript —
	// an editor should never have to guess which remark was ignored.
	const actionable = $derived(
		(reviews ?? []).filter(
			(r) =>
				r.status === 'published' && (r.decision === 'request_revision' || r.decision === 'critical')
		)
	);
	let responses = $state<Record<string, string>>({});
	// Seed every reply slot before the textareas mount: `bind:value={undefined}`
	// against a prop with a fallback is a hard Svelte error, which would take
	// the whole revision dialog down.
	$effect.pre(() => {
		for (const r of actionable) {
			if (responses[r.id] === undefined) responses[r.id] = '';
		}
	});
	const answeredCount = $derived(actionable.filter((r) => (responses[r.id] ?? '').trim()).length);

	function num(v: unknown): number | undefined {
		const t = typeof v === 'string' ? v.trim() : String(v ?? '').trim();
		if (!t) return undefined;
		const n = Number(t);
		return Number.isFinite(n) ? n : undefined;
	}

	async function submit() {
		error = '';
		done = null;
		const { body, error: parseErr } = buildSafe(values, MAIN_FIELDS);
		if (parseErr || !body) return (error = parseErr ?? tr('form_required_missing'));
		if (parsedObs.error) return (error = `${tr('validation_obs_bad_line')}: ${parsedObs.error}`);
		if (!parsedObs.items.length) return (error = tr('validation_obs_bad_line'));

		let assay: unknown = {
			method: body.assay_method,
			details: body.assay_details ? String(body.assay_details) : undefined
		};
		let targetEnvironment: unknown = (() => {
			const e: Record<string, unknown> = {};
			const ph = num(body.env_ph);
			const temp = num(body.env_temperatureK);
			const p = num(body.env_pressureBar);
			const ionic = num(body.env_ionicStrengthM);
			if (ph !== undefined) e.ph = ph;
			if (temp !== undefined) e.temperatureK = temp;
			if (p !== undefined) e.pressureBar = p;
			if (ionic !== undefined) e.ionicStrengthM = ionic;
			if (body.env_description) e.description = String(body.env_description);
			return e;
		})();
		// advanced JSON overrides, when present
		try {
			if (values.assay?.trim()) assay = JSON.parse(values.assay);
			if (values.targetEnvironment?.trim())
				targetEnvironment = JSON.parse(values.targetEnvironment);
		} catch {
			return (error = tr('validation_adv_json_error'));
		}

		const payload: Record<string, unknown> = {
			targetSequenceId: body.targetSequenceId,
			targetEnvironment,
			validationType: body.validationType,
			assay,
			observations: parsedObs.items,
			interpretation: {
				relationshipToPrediction: body.relationshipToPrediction,
				environmentMatched: body.environmentMatched,
				confidence: body.confidence,
				notes: body.notes
			},
			artifactIds: body.artifactIds,
			provenance: { license: body.license }
		};
		saving = true;
		try {
			if (isRevise) {
				const summary = (values.changeSummary ?? '').trim();
				if (!summary) {
					error = tr('revision_change_summary_required');
					return;
				}
				// Every open reviewer remark must be answered by number.
				if (actionable.length && actionable.some((r) => !(responses[r.id] ?? '').trim())) {
					error = tr('revision_responses_missing');
					return;
				}
				if (actionable.length) {
					payload.responseToReviewers = actionable.map((r, i) => ({
						reviewId: r.id,
						marker: `A${i + 1}`,
						decision: r.decision,
						reviewerId: r.reviewerId,
						quote: r.comment,
						response: (responses[r.id] ?? '').trim()
					}));
				}
				await validations.revisions.create(validationId, { payload, changeSummary: summary });
				draft(draftKey).clear();
				toastOk(tr('revision_created'));
				done = validationId;
				if (ondone) ondone();
			} else {
				const receipt = await validations.submit(foldId, payload as unknown as ValidationInput);
				draft(draftKey).clear();
				toastOk(tr('validation_submitted'));
				done = receipt.validationId;
				if (ondone) ondone();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}
</script>

<div class="space-y-3">
	<p class="text-xs text-muted-foreground">
		{isRevise ? tr('revision_intro') : tr('validation_intro')}
	</p>
	<DraftNote k={draftKey} {values} blank={BLANK} disabled={done !== null || saving} />
	{#if error}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">{error}</p>{/if}
	{#if done}
		<p
			class="rounded-none bg-emerald-50 dark:bg-emerald-500/10 p-2 text-xs text-emerald-800 dark:text-emerald-300"
		>
			{isRevise ? tr('revision_created') : tr('validation_created')}
			<a class="underline font-mono" href="/validations/{done}">{done.slice(0, 12)}…</a>
		</p>
	{:else}
		{#if isRevise}<FormFields fields={REVISE_FIELDS} bind:values />{/if}
		{#if isRevise && actionable.length}
			<!-- point-by-point response: quote first, then the answer —
			     the same contract journals impose on revised submissions -->
			<div
				class="rounded-none border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3"
			>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h3 class="text-sm font-semibold">{tr('revision_responses_title')}</h3>
					<Badge tone={answeredCount === actionable.length ? 'ok' : 'warn'}>
						{tr('revision_responses_progress', { done: answeredCount, total: actionable.length })}
					</Badge>
				</div>
				<p class="mt-1 text-xs text-muted-foreground">{tr('revision_responses_intro')}</p>
				<ol class="mt-2 space-y-3">
					{#each actionable as r, i (r.id)}
						<li class="border-t pt-2">
							<div class="flex flex-wrap items-center gap-2 text-xs">
								<Badge tone="info">A{i + 1}</Badge>
								<StatusBadge status={r.decision} ns="rd" />
								<span class="text-muted-foreground"
									>{tr('f_reviewerId')}: <IdLink id={r.reviewerId} /></span
								>
							</div>
							<blockquote
								class="mt-1.5 border-l-2 border-amber-300 dark:border-amber-500/40 pl-2 text-sm whitespace-pre-line"
							>
								{r.comment}
							</blockquote>
							<label class="mt-1.5 block">
								<span class="text-xs text-muted-foreground">
									{tr('revision_response_label', { n: i + 1 })}
									<span class="text-destructive">*</span>
								</span>
								<Textarea
									name={`resp_${r.id}`}
									rows={3}
									bind:value={responses[r.id]}
									placeholder={tr('revision_response_placeholder')}
								/>
							</label>
						</li>
					{/each}
				</ol>
			</div>
		{/if}
		<FormFields fields={MAIN_FIELDS} bind:values columns={2} />
		{#if parsedObs.items.length}
			<p class="text-xs text-emerald-700 dark:text-emerald-300">
				{tr('validation_obs_count', { n: parsedObs.items.length })}
			</p>
		{:else if parsedObs.error}
			<p class="text-xs text-amber-700 dark:text-amber-300">
				{tr('validation_obs_bad_line')}: {parsedObs.error}
			</p>
		{/if}
		<!-- the upload disclosure moved inside UploadPicker (the artifactIds
		     field), so a fresh upload lands as a chip in the same place a
		     stored file is picked -->
		<details class="mt-1">
			<summary class="cursor-pointer text-xs text-muted-foreground">{tr('submit_advanced')}</summary
			>
			<div class="mt-2"><FormFields fields={ADV_FIELDS} bind:values /></div>
		</details>
		<div class="flex justify-end">
			{#if session.signedIn}
				<Button onclick={submit} disabled={saving}
					>{isRevise ? tr('revision_submit') : tr('common_submit')}</Button
				>
			{:else}
				<Button onclick={() => session.signIn()}>{tr('nav_login')}</Button>
			{/if}
		</div>
	{/if}
</div>
