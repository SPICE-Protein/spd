<script lang="ts">
	import { page } from '$app/state';
	import {
		admin,
		validations,
		measurements,
		materialLinks,
		firstArray,
		pick
	} from '$lib/api/client';
	import { SpdApiError } from '$lib/api/base';
	import type {
		ValidationRecord,
		ReviewRecord,
		ScreeningEventRecord,
		RevisionRecord,
		CommentRecord,
		AdminCommentRow,
		MeasurementRow,
		ReviewSummary,
		EditorialDecisionRecordLite,
		EditorialMessageRecord,
		PeerAssignmentItem,
		StaffReviewRecord
	} from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { mine } from '$lib/state/mine.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime, REVIEW_DECISIONS, REVIEW_RATINGS, MEASUREMENT_TYPES } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Button from '$lib/components/Button.svelte';
	import IdLink from '$lib/components/IdLink.svelte';
	import DataView from '$lib/components/DataView.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import ProvenancePanel from '$lib/components/ProvenancePanel.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import RecordContextBar from '$lib/components/RecordContextBar.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';
	import Input from '$lib/components/Input.svelte';
	import Textarea from '$lib/components/Textarea.svelte';
	import AttachmentList from '$lib/components/AttachmentList.svelte';
	import ValidationForm from '$lib/components/ValidationForm.svelte';

	const id = $derived(page.params.id ?? '');

	let val = $state<ValidationRecord | null>(null);
	let screeningEvents = $state<ScreeningEventRecord[]>([]);
	let reviews = $state<ReviewRecord[]>([]);
	let summary = $state<ReviewSummary | null>(null);
	let revisions = $state<RevisionRecord[]>([]);
	let comments = $state<CommentRecord[]>([]);
	let measures = $state<MeasurementRow[]>([]);
	let links = $state<unknown[]>([]);
	let loading = $state(true);
	let error = $state('');
	// deep-linkable tab (?tab=ledger lands the author straight on their decision
	// letter; /my action rows send needs_revision there).
	const TAB_KEYS = [
		'report',
		'reviews',
		'editorial',
		'ledger',
		'screening',
		'discussion',
		'revisions',
		'comments',
		'measurements'
	];
	const initialTab = page.url.searchParams.get('tab');
	let tab = $state(initialTab && TAB_KEYS.includes(initialTab) ? initialTab : 'report');

	// ---- 0032 editorial ledger / rounds / discussion -------------------------
	// The detail GET carries the ledger (letters only when the viewer is
	// submitter or staff — the server decides by stripping the key).
	let decisions = $state<EditorialDecisionRecordLite[]>([]);
	let currentRound = $state(1);
	// derived exactly like the protocol page's latestDecisionAtRound: a
	// decision row at the live round closes it. The GET detail envelope does
	// not carry roundClosed, so the workspace reads truth from the ledger.
	const roundClosed = $derived(decisions.some((d) => (d.round ?? 1) === currentRound));
	let messages = $state<EditorialMessageRecord[]>([]);
	let dispatches = $state<PeerAssignmentItem[]>([]);
	let presets = $state<Array<{ decision: string; letter: string }>>([]);
	// staff = the editorial desk itself (curator|admin, matching the BE gate)
	const isDesk = $derived(session.isCurator || session.isAdmin);
	const latestDecision = $derived(decisions.length ? decisions[decisions.length - 1] : null);
	const openLetters = $state<Record<string, boolean>>({});
	const reviewByRound = $derived(
		reviews.reduce<Record<number, ReviewRecord[]>>((acc, r) => {
			const rd = r.round ?? 1;
			(acc[rd] ??= []).push(r);
			return acc;
		}, {})
	);
	const roundNumbers = $derived(
		Object.keys(reviewByRound)
			.map(Number)
			.sort((a, b) => b - a)
	);

	async function loadLedgerExtras() {
		// messages need the participant gate (submitter/staff) — an author
		// without a seat gets a silent 403 we must not surface as a red toast
		// on every page load; the tab simply shows nothing.
		const [m, d, p] = await Promise.allSettled([
			validations.messages.list(id),
			isDesk
				? admin.peerDispatches({ entityType: 'wet_lab_validation', entityId: id })
				: Promise.resolve(null),
			isDesk && !presets.length ? validations.decisionPresets() : Promise.resolve(null)
		]);
		messages = m.status === 'fulfilled' ? (m.value.messages ?? []) : [];
		dispatches =
			d.status === 'fulfilled' && d.value
				? (d.value.items ?? []).filter((i) => i.round === currentRound)
				: [];
		if (p.status === 'fulfilled' && p.value) presets = p.value.decisions ?? [];
	}
	function dueText(i: PeerAssignmentItem): { label: string; late: boolean } {
		if (i.dueAt == null) return { label: '', late: false };
		const days = Math.ceil((i.dueAt * 1000 - Date.now()) / 86_400_000);
		return days >= 0
			? { label: tr('ed_due_in', { n: days }), late: false }
			: { label: tr('ed_due_over', { n: -days }), late: true };
	}
	const deskStatusTone: Record<string, string> = {
		open: 'warn',
		fulfilled: 'ok',
		expired: 'muted',
		cancelled: 'muted',
		declined: 'bad'
	};

	// the bench writes method | result | units lines — show them as a table,
	// fall back to raw JSON only for exotic shapes
	const obsTable = $derived(
		Array.isArray(val?.observations)
			? (val.observations as Record<string, unknown>[]).filter(
					(o) => o && typeof o === 'object' && ('method' in o || 'result' in o || 'units' in o)
				)
			: []
	);

	async function load() {
		loading = true;
		error = '';
		const vid = id;
		// Every related read below needs only the route id. They used to run
		// one after another, six round trips deep; now they race the record
		// read and each other, and a single failing panel no longer blanks
		// the whole page.
		const resP = validations.get(vid);
		const rvP = validations.reviews.list(vid);
		const revP = validations.revisions.list(vid);
		const cmP = validations.comments.list(vid);
		const msP = validations.measurements(vid);
		const lkP = materialLinks.byTarget('validation', vid);
		try {
			const res = await resP;
			val = res.validation ?? null;
			decisions = res.decisions ?? [];
			currentRound = res.currentRound ?? 1;
			screeningEvents = firstArray<ScreeningEventRecord>(res.screeningEvents);
		} catch (e) {
			error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
			val = null;
			loading = false;
			return;
		}
		const [rv, rev, cm, ms, lk] = await Promise.allSettled([rvP, revP, cmP, msP, lkP]);
		if (rv.status === 'fulfilled') {
			reviews = rv.value.reviews ?? [];
			summary = (rv.value.summary as ReviewSummary) ?? null;
		}
		if (rev.status === 'fulfilled') revisions = rev.value.revisions ?? [];
		if (cm.status === 'fulfilled') comments = cm.value.comments ?? [];
		if (ms.status === 'fulfilled') measures = firstArray<MeasurementRow>(ms.value);
		if (lk.status === 'fulfilled') links = firstArray(lk.value);
		// staff see what moderation hid (no-op for others)
		void loadHiddenComments();
		// ledger extras (messages / current-round roster / presets) ride
		// on the same load — after `currentRound` is set above
		void loadLedgerExtras();
		loading = false;
	}
	$effect(() => void load());

	// ------------------------------------------------------------------ forms ----

	let dialog = $state<
		'' | 'screen' | 'review' | 'revision' | 'comment' | 'measurement' | 'link' | 'decide'
	>('');
	let values = $state<Record<string, string>>({});
	let formError = $state('');
	let saving = $state(false);

	// decision composer state (0032): the letter starts as the curated preset
	// for the chosen verdict and stays fully editable — the stored text is
	// what the author receives, verbatim.
	let decChoice = $state('minor_revision');
	let decLetter = $state('');
	// editorial discussion composer (submitter + desk; internal is desk-only)
	let msgBody = $state('');
	let msgVisibility = $state<'with_author' | 'internal'>('with_author');

	const SCREEN_FIELDS: FormField[] = [
		{
			name: 'decision',
			kind: 'select',
			required: true,
			options: ['screened', 'needs_revision', 'rejected_with_reason'],
			ns: 'sc'
		},
		{ name: 'reason', kind: 'textarea', required: true, rows: 3 }
	];
	const REVIEW_FIELDS: FormField[] = [
		{ name: 'decision', kind: 'select', required: true, options: [...REVIEW_DECISIONS], ns: 'rd' },
		{ name: 'rating', kind: 'select', required: true, options: [...REVIEW_RATINGS], ns: 'rr' },
		{ name: 'confidence', kind: 'number', hint: tr('form_hint_0_1') },
		{ name: 'criteria', kind: 'json' },
		{ name: 'comment', kind: 'textarea', required: true, rows: 4 },
		// 0032: the confidential lane — "comments for the editor only". The
		// public review record never carries this key; staff reads only.
		{
			name: 'confidentialComment',
			kind: 'textarea',
			rows: 2,
			hint: tr('review_confidential_hint')
		},
		{ name: 'conflictDeclared', kind: 'checkbox', label: tr('review_conflict') }
	];
	// Prefill the revision form from the current report so the author edits
	// what they filed rather than retyping it. Shapes vary (assay/env may be
	// objects or strings), so every read is guarded.
	const reviseInitial = $derived.by(() => {
		if (!val) return {};
		const g = (o: unknown, k: string): string =>
			o && typeof o === 'object' ? String((o as Record<string, unknown>)[k] ?? '') : '';
		const obs = Array.isArray(val.observations)
			? (val.observations as Array<Record<string, unknown>>)
			: [];
		const out: Record<string, string> = {
			validationType: String(val.validationType ?? 'fold_stability'),
			targetSequenceId: String(val.targetSequenceId ?? ''),
			assay_method: g(val.assay, 'method'),
			assay_details: g(val.assay, 'details'),
			env_ph: g(val.targetEnvironment, 'ph'),
			env_temperatureK: g(val.targetEnvironment, 'temperatureK'),
			env_pressureBar: g(val.targetEnvironment, 'pressureBar'),
			env_ionicStrengthM: g(val.targetEnvironment, 'ionicStrengthM'),
			env_description: g(val.targetEnvironment, 'description'),
			observationsLines: obs
				.map((o) => `${o.method ?? ''} | ${o.result ?? ''} | ${o.units ?? ''}`)
				.join('\n'),
			relationshipToPrediction: g(val.interpretation, 'relationshipToPrediction'),
			environmentMatched: g(val.interpretation, 'environmentMatched') || 'exact',
			confidence: g(val.interpretation, 'confidence'),
			notes: g(val.interpretation, 'notes'),
			artifactIds: Array.isArray(val.artifactIds) ? (val.artifactIds as string[]).join(', ') : '',
			license: String(val.license ?? 'CC-BY-4.0')
		};
		return out;
	});
	function onRevisionDone() {
		dialog = '';
		void load();
	}
	const MEASUREMENT_FIELDS: FormField[] = [
		{
			name: 'measurementType',
			kind: 'select',
			required: true,
			options: [...MEASUREMENT_TYPES],
			ns: 'mt',
			label: tr('f_measurementType')
		},
		{
			name: 'sequenceId',
			required: true,
			picker: 'sequence',
			hint: tr('measurement_hint_sequence')
		},
		{ name: 'constructId', picker: 'construct', hint: tr('measurement_hint_construct') },
		{ name: 'value', kind: 'json', required: true, hint: tr('measurement_hint_value') },
		{ name: 'ligand', kind: 'json' },
		{ name: 'conditions', kind: 'json' },
		{ name: 'notes' }
	];
	const LINK_FIELDS = $derived<FormField[]>([
		{
			name: 'materialType',
			kind: 'select',
			required: true,
			options: ['strain', 'cell_line'],
			ns: 'et'
		},
		{
			name: 'materialId',
			required: true,
			// the two material tables became searchable precisely so this box
			// stops demanding an uuid from clipboard memory; the picker follows
			// the type just chosen above
			picker: values.materialType === 'cell_line' ? 'cell-line' : 'strain'
		}
		// targetId used to sit here as a required input — and submit then
		// discarded it for `id` (this page's own record). A form that makes
		// you retype the id you are already looking at is paste friction
		// wearing a label.
	]);

	function openDialog(kind: typeof dialog) {
		dialog = kind;
		formError = '';
		values =
			kind === 'review'
				? { conflictDeclared: 'false' }
				: kind === 'measurement'
					? { sequenceId: String(val?.targetSequenceId ?? '') }
					: {};
	}

	// switching the material type invalidates a material picked under the old
	// one — and only then (the first open seeds nothing)
	let lastMaterialType = $state('');
	$effect(() => {
		const t = dialog === 'link' ? String(values.materialType ?? '') : '';
		if (lastMaterialType && t && t !== lastMaterialType) values.materialId = '';
		lastMaterialType = t;
	});

	async function submitDialog() {
		formError = '';
		saving = true;
		try {
			switch (dialog) {
				case 'screen': {
					const b = buildSafe(values, SCREEN_FIELDS);
					if (b.error || !b.body) throw new Error(b.error ?? tr('form_required_missing'));
					await validations.screen(id, b.body as never);
					break;
				}
				case 'review': {
					const b = buildSafe(values, REVIEW_FIELDS);
					if (b.error || !b.body) throw new Error(b.error ?? tr('form_required_missing'));
					await validations.reviews.create(id, b.body as never);
					break;
				}
				case 'comment': {
					if (!values.body?.trim()) throw new Error(tr('form_required_missing'));
					await validations.comments.create(id, {
						body: values.body,
						parent_comment_id: values.parent_comment_id || null
					});
					break;
				}
				case 'measurement': {
					const b = buildSafe(values, MEASUREMENT_FIELDS);
					if (b.error || !b.body) throw new Error(b.error ?? tr('form_required_missing'));
					// validationId is not a question — this dialog lives ON the
					// validation, and the ledger requires the link. It used to
					// be absent from the body entirely (a guaranteed 400); the
					// page knows the answer, so nobody else should type it.
					await measurements.create({ ...b.body, validationId: id } as never);
					break;
				}
				case 'link': {
					const b = buildSafe(values, LINK_FIELDS);
					if (b.error || !b.body) throw new Error(b.error ?? tr('form_required_missing'));
					await materialLinks.create({
						materialType: b.body.materialType as never,
						materialId: String(b.body.materialId),
						targetType: 'validation',
						targetId: id
					});
					break;
				}
			}
			toastOk(tr('validation_action_done'));
			dialog = '';
			await load();
		} catch (e) {
			formError = e instanceof Error ? e.message : String(e);
			toastErr(e);
		} finally {
			saving = false;
		}
	}

	// Staff refused prompt() for moderation too: real dialogs with a
	// mandatory reason field, one for invalidate/restore, one for editing
	// the review's own words (admin-only; status is untouched).
	let moderTarget = $state<ReviewRecord | null>(null);
	let moderAct = $state<'invalidate' | 'restore'>('invalidate');
	let moderWhy = $state('');
	function openModerate(r: ReviewRecord, action: 'invalidate' | 'restore') {
		moderTarget = r;
		moderAct = action;
		moderWhy = '';
	}
	async function doModerate() {
		if (!moderTarget || !moderWhy.trim()) return;
		try {
			await validations.moderateReview(moderTarget.id, {
				action: moderAct,
				reason: moderWhy.trim()
			});
			toastOk(tr('validation_action_done'));
			moderTarget = null;
			await load();
		} catch (e) {
			toastErr(e);
		}
	}

	let rvEditTarget = $state<ReviewRecord | null>(null);
	let rvEditComment = $state('');
	let rvEditReason = $state('');
	function openReviewEdit(r: ReviewRecord) {
		rvEditTarget = r;
		rvEditComment = r.comment ?? '';
		rvEditReason = '';
	}
	async function doReviewEdit() {
		if (!rvEditTarget || !rvEditComment.trim() || !rvEditReason.trim()) return;
		try {
			await validations.editReview(rvEditTarget.id, {
				comment: rvEditComment,
				reason: rvEditReason.trim()
			});
			toastOk(tr('validation_action_done'));
			rvEditTarget = null;
			await load();
		} catch (e) {
			toastErr(e);
		}
	}

	// comment moderation (admin): edit, hide; moderated comments are listed
	// again through the admin-only endpoint so a hide can be undone
	let cmEdit = $state<{ id: string; body: string; reason: string } | null>(null);
	let cmModer = $state<{ id: string; mode: 'hide' | 'restore'; reason: string } | null>(null);
	let hiddenComments = $state<AdminCommentRow[]>([]);
	async function loadHiddenComments() {
		if (!session.isAdmin) {
			hiddenComments = [];
			return;
		}
		try {
			// comments store their target with the hyphenated wire spelling
			const d = await admin.comments({ entityType: 'wet-lab-validation', entityId: id });
			hiddenComments = (d.items ?? []).filter((c) => c.status === 'moderated');
		} catch {
			hiddenComments = [];
		}
	}
	async function doCommentEdit() {
		if (!cmEdit || !cmEdit.body.trim() || !cmEdit.reason.trim()) return;
		try {
			await admin.editComment(cmEdit.id, { body: cmEdit.body, reason: cmEdit.reason.trim() });
			toastOk(tr('validation_action_done'));
			cmEdit = null;
			await load();
			void loadHiddenComments();
		} catch (e) {
			toastErr(e);
		}
	}
	async function doCommentModerate() {
		if (!cmModer || !cmModer.reason.trim()) return;
		try {
			if (cmModer.mode === 'hide') await admin.hideComment(cmModer.id, cmModer.reason.trim());
			else await admin.restoreComment(cmModer.id, cmModer.reason.trim());
			toastOk(cmModer.mode === 'hide' ? tr('admin_comment_hidden') : tr('admin_comment_restored'));
			cmModer = null;
			await load();
			void loadHiddenComments();
		} catch (e) {
			toastErr(e);
		}
	}

	const artifactIdList = $derived(
		Array.isArray(val?.artifactIds) ? (val?.artifactIds as unknown[]).map(String) : []
	);
	// Supplementary files become public with the accepted record. The author
	// and the editorial desk can always download their own material.
	const canDownloadAttachments = $derived(
		isDesk || mine.is(id) || latestDecision?.decision === 'accept'
	);

	async function postComment(bodyText: string) {
		if (!bodyText.trim()) return;
		try {
			await validations.comments.create(id, { body: bodyText, parent_comment_id: null });
			toastOk(tr('validation_action_done'));
			await load();
		} catch (e) {
			toastErr(e);
		}
	}

	// The backend restricts revision creation to submitter/curator/admin.
	// Showing the button to everyone else was a 403 trap — ownership comes
	// from the shared activity feed (see $lib/state/mine.svelte).
	$effect(() => mine.ensure());
	const canRevise = $derived(session.canWrite && (session.isCurator || mine.is(id)));
	// Reviews still demanding an answer from the author, in filing order.
	const actionableReviews = $derived(
		reviews.filter(
			(r) =>
				r.status === 'published' && (r.decision === 'request_revision' || r.decision === 'critical')
		)
	);
	// A revision payload may carry the point-by-point response; render it as
	// numbered remarks instead of making people open a JSON block.
	function responsesOf(rev: RevisionRecord): Array<Record<string, unknown>> {
		const arr = (rev.payload as Record<string, unknown> | null)?.responseToReviewers;
		return Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : [];
	}

	const canScreen = $derived(
		session.isCurator &&
			val &&
			(val.status === 'pending_screening' || val.status === 'needs_revision')
	);
	const canReview = $derived(session.isResearcher && val?.status === 'screened');

	// ---- decision composer + discussion (0032) ------------------------------
	const canDecide = $derived(isDesk && val?.status === 'screened' && !roundClosed);
	const reviewsThisRound = $derived(
		reviews.filter((r) => (r.round ?? 1) === currentRound && r.status === 'published')
	);
	// distinct reviewers in the current round — the server's accept gate,
	// mirrored so the composer can say why accept is still locked.
	const distinctRoundReviewers = $derived(new Set(reviewsThisRound.map((r) => r.reviewerId)).size);

	function openDecide() {
		dialog = 'decide';
		formError = '';
		decChoice = 'minor_revision';
		decLetter = presets.find((p) => p.decision === decChoice)?.letter ?? '';
	}
	// switching verdict swaps in that verdict's preset letter (an edited
	// letter is kept only if the editor has typed into it)
	let decLetterTouched = $state(false);
	$effect(() => {
		if (dialog === 'decide' && !decLetterTouched) {
			decLetter = presets.find((p) => p.decision === decChoice)?.letter ?? '';
		}
	});
	// "import this round's reviews" drafts the citations the desk answers to —
	// public review text only (confidential notes never leak into the letter).
	function importRoundReviews() {
		const cited = reviewsThisRound
			.map((r, i) => `${i + 1}. ${enumLabel('rd', r.decision)} — ${r.comment}`)
			.join('\n\n');
		decLetter = decLetter.trim() ? `${decLetter}\n\n${cited}` : cited;
		decLetterTouched = true;
	}
	async function submitDecide() {
		formError = '';
		saving = true;
		try {
			const res = await validations.decide(id, {
				decision: decChoice,
				letter: decLetter.trim() || undefined
			});
			toastOk(tr('ed_decided', { decision: enumLabel('ed', res.decision), round: res.round }));
			dialog = '';
			decLetterTouched = false;
			await load();
		} catch (e) {
			formError = e instanceof Error ? e.message : String(e);
			toastErr(e);
		} finally {
			saving = false;
		}
	}

	async function sendMessage() {
		if (!msgBody.trim()) return;
		try {
			await validations.messages.create(id, { body: msgBody.trim(), visibility: msgVisibility });
			msgBody = '';
			const m = await validations.messages.list(id);
			messages = m.messages ?? [];
			toastOk(tr('ed_message_sent'));
		} catch (e) {
			toastErr(e);
		}
	}
	const fieldsets = $derived({
		screen: SCREEN_FIELDS,
		review: REVIEW_FIELDS,
		measurement: MEASUREMENT_FIELDS,
		link: LINK_FIELDS
	});
	const activeFields = $derived(
		dialog in fieldsets ? fieldsets[dialog as keyof typeof fieldsets] : []
	);
</script>

{#if loading}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{:else if !val}
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
				<h1 class="text-xl font-bold">{tr('validation_title')}</h1>
				<div class="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
					<StatusBadge status={val.status} ns="vs" />
					<Badge tone="muted">{enumLabel('vt', val.validationType)}</Badge>
					<Badge tone="muted">{tr('validation_revision')} {val.revisionNumber}</Badge>
					<Badge tone={roundClosed ? 'muted' : 'info'}
						>{tr('ed_round_n', { n: currentRound })}</Badge
					>
					{#if latestDecision}<StatusBadge status={latestDecision.decision} ns="ed" />{/if}
				</div>
				<p class="mt-1.5 text-xs text-muted-foreground">
					<code class="font-mono break-all">{val.id}</code> · {tr('f_targetFoldId')}: <IdLink
						id={val.targetFoldId}
						kind="fold"
					/>
				</p>
			</div>
			<div class="flex flex-wrap items-center justify-end gap-2">
				<PageTools />
				{#if canScreen}<Button size="sm" onclick={() => openDialog('screen')}
						>{tr('validation_screen')}</Button
					>{/if}
				{#if canReview}<Button size="sm" variant="outline" onclick={() => openDialog('review')}
						>{tr('validation_review')}</Button
					>{/if}
				{#if session.signedIn}<Button
						size="sm"
						variant="ghost"
						onclick={() => openDialog('measurement')}>{tr('validation_add_measurement')}</Button
					>{/if}
				{#if session.signedIn}<Button size="sm" variant="ghost" onclick={() => openDialog('link')}
						>{tr('validation_link_material')}</Button
					>{/if}
				<IssuePanel
					entityType="validation"
					entityId={val.id}
					size="sm"
					onrevise={canRevise ? () => openDialog('revision') : undefined}
				/>
			</div>
		</div>

		<RecordContextBar entityType="validation" entityId={val.id} name="" />

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'report', label: tr('validation_tab_report') },
				{ key: 'reviews', label: tr('validation_tab_reviews'), badge: reviews.length },
				// 0032: the desk gets its working tab; the author (and only the
				// author + desk) can hold a discussion thread — the backend
				// 403s outsiders, so we do not even render the tab for them.
				...(isDesk ? [{ key: 'editorial', label: tr('ed_tab'), badge: decisions.length }] : []),
				...(decisions.length && !isDesk && mine.is(id)
					? [{ key: 'ledger', label: tr('ed_ledger_tab'), badge: decisions.length }]
					: []),
				{ key: 'screening', label: tr('validation_tab_screening'), badge: screeningEvents.length },
				...(isDesk || mine.is(id)
					? [{ key: 'discussion', label: tr('ed_discussion_tab'), badge: messages.length }]
					: []),
				{ key: 'revisions', label: tr('wiki_history'), badge: revisions.length },
				{ key: 'comments', label: tr('validation_tab_comments'), badge: comments.length },
				{ key: 'measurements', label: tr('browse_measurements'), badge: measures.length }
			]}
		/>

		{#if tab === 'report'}
			<div class="grid gap-4 lg:grid-cols-2">
				<Section title={tr('validation_observations')}>
					{#if obsTable.length}
						<table class="w-full text-sm">
							<thead>
								<tr class="text-left text-xs text-muted-foreground">
									<th class="py-1 pr-3 font-medium">{tr('obs_method')}</th>
									<th class="py-1 pr-3 font-medium">{tr('obs_result')}</th>
									<th class="py-1 font-medium">{tr('obs_units')}</th>
								</tr>
							</thead>
							<tbody>
								{#each obsTable as o, i (i)}
									<tr class="border-t">
										<td class="py-1.5 pr-3">{String(o.method ?? '—')}</td>
										<td class="py-1.5 pr-3"
											>{o.result != null && typeof o.result === 'object'
												? JSON.stringify(o.result)
												: String(o.result ?? '—')}</td
										>
										<td class="py-1.5">{String(o.units ?? '—')}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{:else}
						<DataView label={tr('f_observations')} value={val.observations} />
					{/if}
					{#if val.assay}<DataView class="mt-2" label={tr('f_assay')} value={val.assay} />{/if}
					{#if val.targetEnvironment}<DataView
							class="mt-2"
							label={tr('f_targetEnvironment')}
							value={val.targetEnvironment}
						/>{/if}
				</Section>
				<Section title={tr('validation_interpretation')}>
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
						<dt class="text-muted-foreground">{tr('validation_field_relationship')}</dt>
						<dd>
							<StatusBadge
								status={String(pick(val.interpretation ?? {}, 'relationshipToPrediction') ?? '')}
								ns="rel"
							/>
						</dd>
						<dt class="text-muted-foreground">{tr('validation_field_envMatch')}</dt>
						<dd>
							{enumLabel('em', String(pick(val.interpretation ?? {}, 'environmentMatched') ?? ''))}
						</dd>
						<dt class="text-muted-foreground">{tr('f_confidence')}</dt>
						<dd>{pick(val.interpretation ?? {}, 'confidence') ?? '—'}</dd>
					</dl>
					{#if artifactIdList.length}
						<div class="mt-3">
							<p class="mb-1 text-xs font-medium text-muted-foreground">
								{tr('supplementary_materials')}
							</p>
							<AttachmentList ids={artifactIdList} canDownload={canDownloadAttachments} />
						</div>
					{/if}
					<div class="mt-2 text-xs text-muted-foreground">
						{tr('et_sequence')}: <IdLink id={val.targetSequenceId} kind="sequence" /> · {fmtTime(
							val.createdAt,
							true
						)}
					</div>
				</Section>
			</div>
		{:else if tab === 'reviews'}
			{#if summary}
				<div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
					<Badge
						tone={summary.consensus === 'supportive'
							? 'ok'
							: summary.consensus === 'critical'
								? 'bad'
								: 'warn'}
					>
						{tr('review_consensus')}: {enumLabel('rd', summary.consensus ?? '')}
					</Badge>
					{#each [['supportiveCount', 'ok'], ['criticalCount', 'bad'], ['inconclusiveCount', 'muted'], ['requestRevisionCount', 'warn'], ['reviewCount', 'info']] as [k, tone] (k)}
						<Badge {tone}
							>{(summary as unknown as Record<string, number>)[k] ?? 0}
							{enumLabel('rd', k.replace('Count', ''))}</Badge
						>
					{/each}
				</div>
			{/if}
			{#if reviews.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}
				<!-- 0032: reviews group by round. Round-1 reviews stay public
				     after a major revision but stop counting toward the gate. -->
				{#each roundNumbers as rd (rd)}
					{@const group = reviewByRound[rd] ?? []}
					<div class="mb-4">
						<div class="mb-2 flex items-center gap-2">
							<Badge tone={rd === currentRound ? 'info' : 'muted'}
								>{tr('ed_round_n', { n: rd })}</Badge
							>
							{#if rd === currentRound && !roundClosed}<span class="text-xs text-muted-foreground"
									>{tr('ed_round_open')}</span
								>
							{:else if rd < currentRound}<span class="text-xs text-muted-foreground"
									>{tr('ed_round_archived')}</span
								>{/if}
						</div>
						<ul class="space-y-3">
							{#each group as r (r.id)}
								<li class="rounded-none border p-3 text-sm">
									<div class="flex flex-wrap items-center gap-2 text-xs">
										<StatusBadge status={r.decision} ns="rd" />
										<Badge tone="muted">{enumLabel('rr', r.rating)}</Badge>
										<StatusBadge status={r.status} ns="rv" />
										{#if r.conflictDeclared}<Badge tone="warn">{tr('review_conflict')}</Badge>{/if}
										<span class="text-muted-foreground"
											>{tr('f_reviewerId')}: <IdLink id={r.reviewerId} /></span
										>
										<span class="ml-auto">{fmtTime(r.createdAt, true)}</span>
									</div>
									<p class="mt-2 whitespace-pre-line">{r.comment}</p>
									{#if isDesk && (r as StaffReviewRecord).confidentialComment}
										<!-- the editor-only lane: never part of the public record -->
										<div
											class="mt-2 rounded-none border-l-2 border-amber-400 bg-amber-50 p-2 text-xs dark:bg-amber-500/10"
										>
											<span class="font-medium text-amber-800 dark:text-amber-300"
												>{tr('review_confidential')} ·
											</span>
											<span class="whitespace-pre-line"
												>{(r as StaffReviewRecord).confidentialComment}</span
											>
										</div>
									{/if}
									{#if r.invalidationReason}<p class="mt-1 text-xs text-destructive">
											{r.invalidationReason}
										</p>{/if}
									<div class="mt-1 flex flex-wrap gap-1.5">
										{#if session.isAdmin && r.status === 'published'}
											<Button
												size="xs"
												variant="ghost"
												onclick={() => openModerate(r, 'invalidate')}
												>{tr('review_invalidate')}</Button
											>
											<Button size="xs" variant="outline" onclick={() => openReviewEdit(r)}
												>{tr('admin_review_edit')}</Button
											>
										{:else if session.isAdmin && r.status === 'invalidated'}
											<Button size="xs" variant="ghost" onclick={() => openModerate(r, 'restore')}
												>{tr('review_restore')}</Button
											>
											<Button size="xs" variant="outline" onclick={() => openReviewEdit(r)}
												>{tr('admin_review_edit')}</Button
											>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			{/if}
		{:else if tab === 'screening'}
			{#if screeningEvents.length === 0}<p class="text-sm text-muted-foreground">
					{tr('common_empty')}
				</p>
			{:else}
				<ul class="divide-y text-sm">
					{#each screeningEvents as ev (ev.id)}
						<li class="py-2">
							<div class="flex flex-wrap items-center gap-2 text-xs">
								<StatusBadge status={ev.decision} ns="sc" />
								<span class="text-muted-foreground"
									>{tr('f_screenerId')}: <IdLink id={ev.screenerId} /></span
								>
								<span class="ml-auto">{fmtTime(ev.createdAt, true)}</span>
							</div>
							<p class="mt-1 whitespace-pre-line text-xs">{ev.reason}</p>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'ledger'}
			<!-- read-only decision ledger (0032): the conclusion is public, the
			     letter rides along only for the author + desk. Non-staff users
			     get this tab (it replaces the editorial workspace above). -->
			{#if decisions.length === 0}
				<p class="text-sm text-muted-foreground">{tr('ed_ledger_empty')}</p>
			{:else}
				<ul class="divide-y text-sm">
					{#each decisions as d (d.id)}
						<li class="py-2">
							<div class="flex flex-wrap items-center gap-2 text-xs">
								<Badge tone="muted">{tr('ed_round_n', { n: d.round })}</Badge>
								<StatusBadge status={d.decision} ns="ed" />
								{#if d.system}<Badge tone="info">{tr('ed_system_decision')}</Badge>{/if}
								<span class="text-muted-foreground"
									>{tr('ed_editor')}: {d.editorDisplayName ?? ''}</span
								>
								<span class="ml-auto">{fmtTime(d.createdAt, true)}</span>
							</div>
							{#if d.letter}
								<button
									class="mt-1 text-xs underline text-muted-foreground"
									onclick={() => (openLetters[d.id] = !openLetters[d.id])}
									>{openLetters[d.id] ? tr('ed_letter_hide') : tr('ed_letter_show')}</button
								>
								{#if openLetters[d.id]}
									<pre
										class="mt-1 whitespace-pre-wrap rounded-none border bg-muted/30 p-2 font-mono text-xs">{d.letter}</pre>
								{/if}
							{:else}
								<p class="mt-1 text-xs text-muted-foreground">{tr('ed_letter_public')}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'editorial'}
			<!-- 0032 editorial desk: round status, the decision composer, the
			     current-round roster and the full ledger in one working view. -->
			<div class="space-y-4">
				<Section title={tr('ed_round_status')}>
					<div class="flex flex-wrap items-center gap-2 text-sm">
						<Badge tone={roundClosed ? 'muted' : 'info'}
							>{tr('ed_round_n', { n: currentRound })}</Badge
						>
						{#if roundClosed}
							<span class="text-muted-foreground">{tr('ed_round_closed_note')}</span>
						{:else}
							<span class="text-muted-foreground">
								{tr('ed_round_reviews_in', { n: distinctRoundReviewers, need: 2 })}
							</span>
						{/if}
						{#if canDecide}
							<Button size="sm" class="ml-auto" onclick={openDecide}
								>{tr('ed_decide_button')}</Button
							>
						{/if}
					</div>
					{#if !roundClosed && distinctRoundReviewers >= 2}
						<p
							class="mt-2 rounded-none border-l-2 border-sky-500 bg-sky-50 p-2 text-xs text-sky-900 dark:bg-sky-500/10 dark:text-sky-200"
						>
							{tr('ed_nudge_hint')}
						</p>
					{/if}
				</Section>

				<Section title={tr('ed_ledger')}>
					{#if decisions.length === 0}
						<p class="text-sm text-muted-foreground">{tr('ed_ledger_empty')}</p>
					{:else}
						<ul class="divide-y text-sm">
							{#each decisions as d (d.id)}
								<li class="py-2">
									<div class="flex flex-wrap items-center gap-2 text-xs">
										<Badge tone="muted">{tr('ed_round_n', { n: d.round })}</Badge>
										<StatusBadge status={d.decision} ns="ed" />
										{#if d.system}<Badge tone="info">{tr('ed_system_decision')}</Badge>{/if}
										{#if d.editorDisplayName || d.editorId}
											<span class="text-muted-foreground">
												{tr('ed_editor')}: {d.editorDisplayName ?? ''}
												{#if d.editorId}<IdLink id={d.editorId} />{/if}
											</span>
										{/if}
										<span class="ml-auto">{fmtTime(d.createdAt, true)}</span>
									</div>
									{#if d.letter}
										<button
											class="mt-1 text-xs underline text-muted-foreground"
											onclick={() => (openLetters[d.id] = !openLetters[d.id])}
											>{openLetters[d.id] ? tr('ed_letter_hide') : tr('ed_letter_show')}</button
										>
										{#if openLetters[d.id]}
											<pre
												class="mt-1 whitespace-pre-wrap rounded-none border bg-muted/30 p-2 font-mono text-xs">{d.letter}</pre>
										{/if}
									{:else}
										<p class="mt-1 text-xs text-muted-foreground">{tr('ed_letter_public')}</p>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Section>

				<Section title={tr('ed_roster_title')}>
					<p class="mb-2 text-xs text-muted-foreground">
						{tr('ed_roster_hint', { n: currentRound })}
					</p>
					{#if dispatches.length === 0}
						<p class="text-sm text-muted-foreground">{tr('ed_roster_empty')}</p>
					{:else}
						<table class="w-full text-sm">
							<thead>
								<tr class="text-left text-xs text-muted-foreground">
									<th class="py-1 pr-3 font-medium">{tr('dispatch_col_reviewer')}</th>
									<th class="py-1 pr-3 font-medium">{tr('f_status')}</th>
									<th class="py-1 pr-3 font-medium">{tr('ed_col_due')}</th>
									<th class="py-1 font-medium">{tr('dispatch_col_assigned')}</th>
								</tr>
							</thead>
							<tbody>
								{#each dispatches as i (i.id)}
									{@const due = dueText(i)}
									<tr class="border-t">
										<td class="py-1.5 pr-3"><IdLink id={i.reviewerUserId} /></td>
										<td class="py-1.5 pr-3">
											<Badge tone={deskStatusTone[i.status] ?? 'muted'}
												>{enumLabel('pds', i.status)}</Badge
											>
											{#if i.declineReason}<span class="ml-1 text-xs text-muted-foreground"
													>{i.declineReason}</span
												>{/if}
										</td>
										<td class="py-1.5 pr-3 {due.late ? 'text-destructive' : ''}"
											>{due.label || '—'}</td
										>
										<td class="py-1.5 text-xs text-muted-foreground">{fmtTime(i.createdAt)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</Section>
			</div>
		{:else if tab === 'discussion'}
			<!-- editorial discussion (0032): the desk talks to the author, or to
			     itself when visibility=internal; the filter is server-side. -->
			<div class="space-y-3">
				{#if session.signedIn}
					<div class="rounded-none border p-3">
						<Textarea
							name="msg_body"
							rows={3}
							bind:value={msgBody}
							placeholder={tr('ed_message_placeholder')}
						/>
						<div class="mt-2 flex flex-wrap items-center gap-2">
							{#if isDesk}
								<select
									class="h-8 rounded-none border bg-background px-2 text-xs"
									bind:value={msgVisibility}
								>
									<option value="with_author">{tr('ed_visibility_author')}</option>
									<option value="internal">{tr('ed_visibility_internal')}</option>
								</select>
							{:else}
								<Badge tone="muted">{tr('ed_visibility_author')}</Badge>
							{/if}
							<Button size="sm" class="ml-auto" disabled={!msgBody.trim()} onclick={sendMessage}
								>{tr('ed_message_send')}</Button
							>
						</div>
					</div>
				{/if}
				{#if messages.length === 0}
					<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
				{:else}
					<ul class="space-y-2">
						{#each messages as msg (msg.id)}
							<li class="rounded-none border p-2 text-sm">
								<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
									{#if msg.authorDisplayName}<span class="font-medium text-foreground"
											>{msg.authorDisplayName}</span
										>{/if}
									<IdLink id={msg.authorUserId} />
									{#if msg.visibility === 'internal'}<Badge tone="warn"
											>{tr('ed_visibility_internal')}</Badge
										>{/if}
									<span class="ml-auto">{fmtTime(msg.createdAt, true)}</span>
								</div>
								<p class="mt-1 whitespace-pre-line">{msg.body}</p>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else if tab === 'revisions'}
			{#if revisions.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}
				<ul class="divide-y text-sm">
					{#each revisions as rev (rev.id)}
						<li class="py-2">
							<div class="flex items-center gap-2 text-xs">
								<Badge tone="info">r{rev.revisionNumber}</Badge>
								<span>{rev.changeSummary}</span>
								<span class="ml-auto text-muted-foreground">{fmtTime(rev.createdAt, true)}</span>
							</div>
							{#if responsesOf(rev).length}
								<ol class="mt-2 space-y-2">
									{#each responsesOf(rev) as a, i (String(a.reviewId ?? i))}
										<li class="rounded-none border p-2">
											<div class="flex flex-wrap items-center gap-2 text-xs">
												<Badge tone="info">{String(a.marker ?? `A${i + 1}`)}</Badge>
												{#if a.decision}<StatusBadge status={String(a.decision)} ns="rd" />{/if}
											</div>
											<blockquote
												class="mt-1 border-l-2 border-muted pl-2 text-xs whitespace-pre-line"
											>
												{String(a.quote ?? '')}
											</blockquote>
											<p class="mt-1 text-sm whitespace-pre-line">
												<span class="text-xs font-medium text-muted-foreground">RESPONSE ·</span>
												{String(a.response ?? '')}
											</p>
										</li>
									{/each}
								</ol>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'comments'}
			{#if session.signedIn}
				<form
					class="mb-3 flex gap-2"
					onsubmit={(e) => {
						e.preventDefault();
						const el = e.currentTarget.querySelector('input[name=body]') as HTMLInputElement;
						void postComment(el.value);
						el.value = '';
					}}
				>
					<Input name="body" class="h-8 flex-1" placeholder={tr('comment_placeholder')} />
					<Button size="sm" type="submit">{tr('common_submit')}</Button>
				</form>
			{/if}
			{#if comments.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}
				<ul class="space-y-2">
					{#each comments as c (c.id)}
						<li class="rounded-none border p-2 text-sm">
							<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
								<IdLink id={c.createdBy} />
								{fmtTime(c.createdAt, true)}
								{#if c.status === 'edited'}<StatusBadge status="edited" ns="st" />{/if}
								{#if session.isAdmin}
									<span class="ml-auto flex gap-1.5">
										<Button
											size="xs"
											variant="outline"
											onclick={() => (cmEdit = { id: c.id, body: c.body, reason: '' })}
											>{tr('admin_comment_edit')}</Button
										>
										<Button
											size="xs"
											variant="ghost"
											onclick={() => (cmModer = { id: c.id, mode: 'hide', reason: '' })}
											>{tr('admin_comment_hide')}</Button
										>
									</span>
								{/if}
							</div>
							<p class="mt-1 whitespace-pre-line">{c.body}</p>
						</li>
					{/each}
				</ul>
			{/if}
			{#if hiddenComments.length}
				<p class="mt-3 text-xs font-medium text-muted-foreground">{tr('admin_hidden_comments')}</p>
				<ul class="mt-1 space-y-1.5">
					{#each hiddenComments as c (c.id)}
						<li class="rounded-none border border-dashed p-2 text-xs text-muted-foreground">
							<div class="flex flex-wrap items-center gap-2">
								<StatusBadge status="moderated" ns="st" />
								<IdLink id={c.createdBy} />
								{fmtTime(c.createdAt, true)}
								<span class="line-through break-all">{String(c.body).slice(0, 120)}</span>
								<Button
									size="xs"
									variant="outline"
									class="ml-auto"
									onclick={() => (cmModer = { id: c.id, mode: 'restore', reason: '' })}
									>{tr('admin_comment_restore')}</Button
								>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'measurements'}
			{#if measures.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}
				<ul class="divide-y text-sm">
					{#each measures as m (m.id)}
						<li class="flex flex-wrap items-center gap-2 py-2">
							<Badge tone="muted">{enumLabel('mt', m.measurementType)}</Badge>
							<span class="font-mono text-xs">{m.value?.value ?? '—'} {m.value?.unit ?? ''}</span>
							<IdLink id={m.id} />
							<span class="text-xs text-muted-foreground"
								>{tr('et_sequence')}: <IdLink id={m.sequenceId} kind="sequence" /></span
							>
							{#if m.notes}<span class="text-xs text-muted-foreground">{m.notes}</span>{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}

		{#if links.length > 0}
			<Section title={tr('validation_materials')}>
				<ul class="flex flex-wrap gap-2 text-xs">
					{#each links as l, i (i)}
						{@const link = l as Record<string, unknown>}
						<li class="flex items-center gap-1.5 rounded-none border px-2 py-1">
							{#if link.materialType}
								<Badge tone="muted">{enumLabel('ct', String(link.materialType))}</Badge>
							{/if}
							<IdLink id={String(link.materialId ?? link.targetId ?? '')} />
						</li>
					{/each}
				</ul>
			</Section>
		{/if}

		<div class="grid gap-4 lg:grid-cols-2">
			<WikiPanel entityType="wet_lab_validation" entityId={val.id} />
			<ReferencesPanel entityType="wet_lab_validation" entityId={val.id} />

			<ProvenancePanel entityType="validation" entityId={val.id} />
		</div>
	</div>

	<Dialog
		open={dialog !== '' && dialog !== 'comment' && dialog !== 'decide'}
		onclose={() => (dialog = '')}
		title={dialog === 'revision' ? tr('validation_revise') : tr('common_create')}
		width="max-w-2xl"
	>
		<div class="space-y-3">
			{#if dialog === 'revision'}
				<!-- the revision reuses the structured validation fields — never a
				     raw JSON payload — and carries a change summary -->
				<ValidationForm
					mode="revise"
					validationId={id}
					initial={reviseInitial}
					reviews={actionableReviews}
					ondone={onRevisionDone}
				/>
			{:else}
				{#if formError}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">
						{formError}
					</p>{/if}
				{#if activeFields.length}
					<FormFields fields={activeFields} bind:values columns={2} />
				{/if}
				<div class="flex justify-end gap-2">
					<Button variant="ghost" onclick={() => (dialog = '')}>{tr('common_cancel')}</Button>
					<Button onclick={submitDialog} disabled={saving}>{tr('common_submit')}</Button>
				</div>
			{/if}
		</div>
	</Dialog>

	<Dialog
		open={dialog === 'decide'}
		onclose={() => (dialog = '')}
		title={tr('ed_decide_title')}
		width="max-w-2xl"
	>
		<div class="space-y-3">
			{#if formError}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">
					{formError}
				</p>{/if}
			<p class="text-xs text-muted-foreground">{tr('ed_decide_hint', { n: currentRound })}</p>
			<div class="flex flex-wrap gap-2">
				{#each ['accept', 'minor_revision', 'major_revision', 'decline'] as d (d)}
					<Button
						size="sm"
						variant={decChoice === d ? 'primary' : 'outline'}
						onclick={() => {
							decChoice = d;
							decLetterTouched = false;
						}}>{enumLabel('ed', d)}</Button
					>
				{/each}
			</div>
			{#if decChoice === 'accept' && distinctRoundReviewers < 2}
				<p
					class="rounded-none border-l-2 border-amber-400 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
				>
					{tr('ed_accept_needs_two', { n: distinctRoundReviewers })}
				</p>
			{/if}
			<label class="block">
				<div class="mb-1 flex items-center justify-between">
					<span class="text-xs text-muted-foreground">{tr('ed_letter_title')}</span>
					<Button size="xs" variant="ghost" onclick={importRoundReviews}
						>{tr('ed_import_reviews')}</Button
					>
				</div>
				<Textarea
					name="dec_letter"
					rows={10}
					bind:value={decLetter}
					oninput={() => (decLetterTouched = true)}
				/>
			</label>
			<div class="flex justify-end gap-2">
				<Button variant="ghost" onclick={() => (dialog = '')}>{tr('common_cancel')}</Button>
				<Button disabled={saving} onclick={submitDecide}>{tr('ed_decide_submit')}</Button>
			</div>
		</div>
	</Dialog>

	<Dialog
		open={!!moderTarget}
		onclose={() => (moderTarget = null)}
		title={moderAct === 'invalidate' ? tr('review_invalidate') : tr('review_restore')}
	>
		<div class="space-y-3">
			<p class="text-xs text-muted-foreground">{tr('moderate_dialog_hint')}</p>
			<label class="block">
				<span class="text-xs text-muted-foreground"
					>{tr('field_reason')} <span class="text-destructive">*</span></span
				>
				<Textarea name="rv_moder_reason" rows={3} bind:value={moderWhy} />
			</label>
			<div class="flex justify-end gap-2">
				<Button variant="ghost" onclick={() => (moderTarget = null)}>{tr('common_cancel')}</Button>
				<Button
					variant={moderAct === 'invalidate' ? 'danger' : 'primary'}
					disabled={!moderWhy.trim()}
					onclick={doModerate}>{tr('common_submit')}</Button
				>
			</div>
		</div>
	</Dialog>

	<Dialog
		open={!!rvEditTarget}
		onclose={() => (rvEditTarget = null)}
		title={tr('admin_review_edit')}
		hint={tr('admin_review_edit_hint')}
	>
		<div class="space-y-3">
			<label class="block">
				<span class="text-xs text-muted-foreground">{tr('review_comment')}</span>
				<Textarea name="rv_edit_comment" rows={5} bind:value={rvEditComment} />
			</label>
			<label class="block">
				<span class="text-xs text-muted-foreground"
					>{tr('field_reason')} <span class="text-destructive">*</span></span
				>
				<Input
					name="rv_edit_reason"
					class="h-8 w-full"
					placeholder={tr('admin_audit_reason_ph')}
					bind:value={rvEditReason}
				/>
			</label>
			<div class="flex justify-end gap-2">
				<Button variant="ghost" onclick={() => (rvEditTarget = null)}>{tr('common_cancel')}</Button>
				<Button disabled={!rvEditComment.trim() || !rvEditReason.trim()} onclick={doReviewEdit}
					>{tr('common_save')}</Button
				>
			</div>
		</div>
	</Dialog>

	<Dialog open={!!cmEdit} onclose={() => (cmEdit = null)} title={tr('admin_comment_edit')}>
		{#if cmEdit}
			<div class="space-y-3">
				<label class="block">
					<span class="text-xs text-muted-foreground">{tr('comment_body')}</span>
					<Textarea name="cm_edit_body" rows={4} bind:value={cmEdit.body} />
				</label>
				<label class="block">
					<span class="text-xs text-muted-foreground"
						>{tr('field_reason')} <span class="text-destructive">*</span></span
					>
					<Input
						name="cm_edit_reason"
						class="h-8 w-full"
						placeholder={tr('admin_audit_reason_ph')}
						bind:value={cmEdit.reason}
					/>
				</label>
				<div class="flex justify-end gap-2">
					<Button variant="ghost" onclick={() => (cmEdit = null)}>{tr('common_cancel')}</Button>
					<Button disabled={!cmEdit.body.trim() || !cmEdit.reason.trim()} onclick={doCommentEdit}
						>{tr('common_save')}</Button
					>
				</div>
			</div>
		{/if}
	</Dialog>

	<Dialog
		open={!!cmModer}
		onclose={() => (cmModer = null)}
		title={cmModer?.mode === 'restore' ? tr('admin_comment_restore') : tr('admin_comment_hide')}
	>
		{#if cmModer}
			<div class="space-y-3">
				<p class="text-xs text-muted-foreground">
					{cmModer.mode === 'restore' ? tr('admin_restore_hint') : tr('admin_hide_hint')}
				</p>
				<label class="block">
					<span class="text-xs text-muted-foreground"
						>{tr('field_reason')} <span class="text-destructive">*</span></span
					>
					<Input name="cm_moder_reason" class="h-8 w-full" bind:value={cmModer.reason} />
				</label>
				<div class="flex justify-end gap-2">
					<Button variant="ghost" onclick={() => (cmModer = null)}>{tr('common_cancel')}</Button>
					<Button
						variant={cmModer.mode === 'hide' ? 'danger' : 'primary'}
						disabled={!cmModer.reason.trim()}
						onclick={doCommentModerate}>{tr('common_submit')}</Button
					>
				</div>
			</div>
		{/if}
	</Dialog>
{/if}

<svelte:head><title>{tr('validation_title')} · SPD</title></svelte:head>
