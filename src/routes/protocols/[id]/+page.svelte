<script lang="ts">
	import { page } from '$app/state';
	import { protocols, validations, admin, firstArray } from '$lib/api/client';
	import { SpdApiError } from '$lib/api/base';
	import { session } from '$lib/state/session.svelte';
	import { mine } from '$lib/state/mine.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import Input from '$lib/components/Input.svelte';
	import Select from '$lib/components/Select.svelte';
	import Checkbox from '$lib/components/Checkbox.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import Textarea from '$lib/components/Textarea.svelte';
	import type {
		EditorialDecisionRecordLite,
		EditorialMessageRecord,
		PeerAssignmentItem
	} from '$lib/api/types';

	const id = $derived(page.params.id ?? '');

	let row = $state<Record<string, unknown> | null>(null);
	let reviews = $state<Record<string, unknown>[]>([]);
	let error = $state('');
	// 0032 editorial layer: the ledger, the live round (= revision), the
	// discussion thread, and the current-round dispatch roster (desk only).
	let decisions = $state<EditorialDecisionRecordLite[]>([]);
	let messages = $state<EditorialMessageRecord[]>([]);
	let dispatches = $state<PeerAssignmentItem[]>([]);
	let presets = $state<Array<{ decision: string; letter: string }>>([]);
	const isDesk = $derived(session.isCurator || session.isAdmin);
	const currentRound = $derived(Number(row?.currentRound ?? 1) || 1);
	const latestDecision = $derived(decisions.length ? decisions[decisions.length - 1] : null);
	const openLetters = $state<Record<string, boolean>>({});
	// reviews of the live revision only — the distinct-reviewer gate counts
	// them (older revisions' reviews stay listed but stop counting).
	const currentPublishedReviewers = $derived(Number(row?.currentPublishedReviewers ?? 0) || 0);

	async function load() {
		const pid = id;
		// The thread read needs only the route id, so it races the record
		// read instead of queueing behind it.
		const messagesP = protocols.messages.list(pid).catch(() => ({ messages: [] }));
		try {
			row = await protocols.get(pid);
			reviews = firstArray(row.reviews);
			decisions = firstArray<EditorialDecisionRecordLite>(row.decisions);
			error = '';
			const m = await messagesP;
			messages = m.messages ?? [];
			await loadDeskExtras(pid);
		} catch (e) {
			error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
		}
	}
	async function loadDeskExtras(protoId: string) {
		if (!isDesk) return;
		// Roster and presets are independent reads; both were serialised
		// behind the thread before.
		const [d, p] = await Promise.allSettled([
			admin.peerDispatches({ entityType: 'protocol', entityId: protoId }),
			presets.length ? Promise.resolve({ decisions: presets }) : validations.decisionPresets()
		]);
		dispatches =
			d.status === 'fulfilled' ? (d.value.items ?? []).filter((i) => i.round === currentRound) : [];
		// decision presets are shared with validations (same four verdicts)
		if (p.status === 'fulfilled') presets = p.value.decisions ?? [];
	}
	// the workspace fetches itself — no initial load() call ever meant the
	// detail page only worked after an action (lost in the round-8 rewrite)
	$effect(() => void load());

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
	$effect(() => mine.ensure());

	// review form
	let decision = $state('approved');
	let comments = $state('');
	let confidential = $state('');
	let conflict = $state(false);
	let saving = $state(false);

	async function review() {
		saving = true;
		try {
			await protocols.reviews.create(id, {
				decision: decision as never,
				comments: comments || undefined,
				confidentialComment: confidential.trim() || undefined,
				conflictDeclared: conflict
			});
			toastOk(tr('protocol_reviewed'));
			comments = '';
			confidential = '';
			await load();
		} catch (e) {
			toastErr(e);
		} finally {
			saving = false;
		}
	}

	// staff moderation without prompt(): a dialog with the mandatory reason;
	// the edit door changes the review's words, never its status
	let moderTarget = $state<Record<string, unknown> | null>(null);
	let moderAct = $state<'invalidate' | 'restore'>('invalidate');
	let moderWhy = $state('');
	function openModerate(r: Record<string, unknown>) {
		moderTarget = r;
		moderAct = String(r.status) === 'published' ? 'invalidate' : 'restore';
		moderWhy = '';
	}
	async function doModerate() {
		if (!moderTarget || !moderWhy.trim()) return;
		try {
			await protocols.moderate(id, String(moderTarget.id), {
				action: moderAct,
				reason: moderWhy.trim()
			});
			toastOk(tr('protocol_action_done'));
			moderTarget = null;
			await load();
		} catch (e) {
			toastErr(e);
		}
	}

	let rvEditTarget = $state<Record<string, unknown> | null>(null);
	let rvEditComments = $state('');
	let rvEditReason = $state('');
	function openReviewEdit(r: Record<string, unknown>) {
		rvEditTarget = r;
		rvEditComments = String(r.comments ?? '');
		rvEditReason = '';
	}
	async function doReviewEdit() {
		if (!rvEditTarget || !rvEditComments.trim() || !rvEditReason.trim()) return;
		try {
			await protocols.editReview(id, String(rvEditTarget.id), {
				comments: rvEditComments,
				reason: rvEditReason.trim()
			});
			toastOk(tr('protocol_action_done'));
			rvEditTarget = null;
			await load();
		} catch (e) {
			toastErr(e);
		}
	}

	// ---- decision composer + discussion (0032) ------------------------------
	let decideOpen = $state(false);
	let decChoice = $state('accept');
	let decLetter = $state('');
	let decLetterTouched = $state(false);
	let msgBody = $state('');
	let msgVisibility = $state<'with_author' | 'internal'>('with_author');
	const canDecide = $derived(
		isDesk && row?.status !== 'archived' && !latestDecisionAtRound(currentRound)
	);
	function latestDecisionAtRound(round: number): EditorialDecisionRecordLite | null {
		return decisions.find((d) => d.round === round) ?? null;
	}
	$effect(() => {
		if (decideOpen && !decLetterTouched) {
			decLetter = presets.find((p) => p.decision === decChoice)?.letter ?? '';
		}
	});
	function openDecide() {
		decideOpen = true;
		decChoice = 'accept';
		decLetterTouched = false;
		decLetter = presets.find((p) => p.decision === decChoice)?.letter ?? '';
	}
	function importRoundReviews() {
		const cited = reviews
			.filter(
				(r) => r.status === 'published' && Number(r.round ?? r.revisionNumber ?? 0) === currentRound
			)
			.map(
				(r, i) =>
					`${i + 1}. ${enumLabel('pr', String(r.decision ?? ''))} — ${String(r.comments ?? '')}`
			)
			.join('\n\n');
		decLetter = decLetter.trim() ? `${decLetter}\n\n${cited}` : cited;
		decLetterTouched = true;
	}
	async function submitDecide() {
		saving = true;
		try {
			const res = await protocols.decide(String(row?.id ?? id), {
				decision: decChoice,
				letter: decLetter.trim() || undefined
			});
			toastOk(tr('ed_decided', { decision: enumLabel('ed', res.decision), round: res.round }));
			decideOpen = false;
			decLetterTouched = false;
			await load();
		} catch (e) {
			toastErr(e);
		} finally {
			saving = false;
		}
	}
	async function sendMessage() {
		if (!msgBody.trim()) return;
		try {
			await protocols.messages.create(String(row?.id ?? id), {
				body: msgBody.trim(),
				visibility: msgVisibility
			});
			msgBody = '';
			const m = await protocols.messages.list(String(row?.id ?? id));
			messages = m.messages ?? [];
			toastOk(tr('ed_message_sent'));
		} catch (e) {
			toastErr(e);
		}
	}

	async function archive() {
		if (!confirm(tr('protocol_archive_confirm'))) return;
		try {
			await protocols.remove(id);
			toastOk(tr('protocol_archived'));
			location.href = '/protocols';
		} catch (e) {
			toastErr(e);
		}
	}

	const steps = $derived(Array.isArray(row?.steps) ? (row.steps as unknown[]) : []);
	const reagentsList = $derived(
		Array.isArray(row?.reagents) ? (row.reagents as Record<string, unknown>[]) : []
	);
	const tags = $derived(Array.isArray(row?.tags) ? (row.tags as unknown[]).map(String) : []);
	const canReview = $derived(session.isResearcher && row?.status !== 'archived');
	const distinctReviewers = $derived(
		new Set(reviews.filter((r) => r.status === 'published').map((r) => r.reviewerId)).size
	);
</script>

{#if error}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		{error}
	</div>
{:else if row}
	<div class="mx-auto max-w-4xl space-y-4">
		<div class="flex flex-wrap items-start justify-between gap-2">
			<div>
				<h1 class="text-xl font-bold">{String(row.title ?? '')}</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<code class="font-mono break-all">{String(row.id)}</code>
					<StatusBadge status={String(row.status ?? '')} ns="pstat" />
					<Badge tone="muted">{tr('wiki_revision')} {String(row.revisionNumber ?? 1)}</Badge>
					<Badge tone={distinctReviewers >= 2 ? 'ok' : 'muted'}
						>{distinctReviewers} {tr('protocol_distinct_reviewers')}</Badge
					>
					<Badge tone="muted">{tr('ed_round_n', { n: currentRound })}</Badge>
					{#if latestDecision}<StatusBadge status={latestDecision.decision} ns="ed" />{/if}
					{#if canDecide}
						<Button size="sm" onclick={openDecide}>{tr('ed_decide_button')}</Button>
					{/if}
				</div>
				{#if row.summary}<p class="mt-1 text-sm text-muted-foreground">
						{String(row.summary)}
					</p>{/if}
			</div>
			<PageTools />
			<IssuePanel entityType="protocol" entityId={String(row.id)} />
			{#if session.canWrite && (session.isAdmin || row.createdBy === session.user?.id)}
				<Button size="sm" variant="ghost" onclick={archive}>{tr('protocol_archive')}</Button>
			{/if}
		</div>

		{#if tags.length}
			<div class="flex flex-wrap gap-1">
				{#each tags as t, i (i)}<Badge tone="muted">{t}</Badge>{/each}
			</div>
		{/if}

		{#if steps.length}
			<Section title={tr('protocol_steps')}>
				<ol class="list-decimal space-y-1 pl-6 text-sm">
					{#each steps as s, i (i)}
						<li>{typeof s === 'string' ? s : JSON.stringify(s)}</li>
					{/each}
				</ol>
			</Section>
		{/if}

		<Section title={tr('protocol_body')}>
			<Markdown source={String(row.bodyMarkdown ?? '')} />
		</Section>

		{#if reagentsList.length}
			<Section title={tr('protocol_reagents')}>
				<ul class="flex flex-wrap gap-2 text-sm">
					{#each reagentsList as r, i (i)}
						<li>
							<a class="underline font-mono text-xs" href={`/reagents/${r.id ?? r}`}
								>{String(r.id ?? JSON.stringify(r)).slice(0, 18)}</a
							>
						</li>
					{/each}
				</ul>
			</Section>
		{/if}

		<Section title={tr('validation_tab_reviews')}>
			<p class="mb-2 text-xs text-muted-foreground">{tr('protocol_publication_rule')}</p>
			{#if reviews.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}
				<ul class="divide-y text-sm">
					{#each reviews as r, i (i)}
						{@const rd = Number(r.round ?? r.revisionNumber ?? 0)}
						<li class="flex flex-wrap items-center gap-2 py-2">
							<Badge tone={r.decision === 'approved' ? 'ok' : 'warn'}
								>{enumLabel('pr', String(r.decision ?? ''))}</Badge
							>
							<Badge tone={rd === currentRound ? 'info' : 'muted'}
								>{tr('ed_round_n', { n: rd })}</Badge
							>
							<span class="text-xs"
								>{String(r.reviewerName ?? '')}
								<code class="font-mono text-[10px]">{String(r.orcidId ?? r.reviewerId ?? '')}</code
								></span
							>
							{#if r.status === 'invalidated'}<Badge tone="bad">{tr('review_invalidated')}</Badge
								>{/if}
							<span class="ml-auto text-xs text-muted-foreground"
								>{fmtTime(Number(r.createdAt ?? 0), true)}</span
							>
							{#if session.isAdmin}
								<Button size="xs" variant="ghost" onclick={() => openModerate(r)}
									>{r.status === 'published'
										? tr('review_invalidate')
										: tr('review_restore')}</Button
								>
								<Button size="xs" variant="outline" onclick={() => openReviewEdit(r)}
									>{tr('admin_review_edit')}</Button
								>
							{/if}
							{#if r.comments}<p class="w-full text-xs text-muted-foreground">
									{String(r.comments)}
								</p>{/if}
							{#if isDesk && r.confidentialComment}
								<p
									class="w-full rounded-none border-l-2 border-amber-400 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
								>
									<span class="font-medium">{tr('review_confidential')} · </span>{String(
										r.confidentialComment
									)}
								</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if canReview}
				<div class="mt-3 space-y-2">
					<div class="flex flex-wrap items-center gap-2 text-sm">
						<Select
							name="proto_decision"
							class="h-8 w-44"
							bind:value={decision}
							options={[
								{ value: 'approved', label: tr('protocol_approve') },
								{ value: 'request_changes', label: tr('protocol_request_changes') }
							]}
						/>
						<Input
							name="proto_comments"
							class="h-8 min-w-40 flex-1"
							placeholder={tr('protocol_review_comments')}
							bind:value={comments}
						/>
						<label class="flex items-center gap-1.5 text-xs"
							><Checkbox name="proto_conflict" bind:checked={conflict} />
							{tr('review_conflict')}</label
						>
						<Button size="sm" onclick={review} disabled={saving}>{tr('validation_review')}</Button>
					</div>
					<!-- confidential lane: editor-only, never public (0032) -->
					<Textarea
						name="proto_confidential"
						rows={2}
						bind:value={confidential}
						placeholder={tr('review_confidential_hint')}
					/>
				</div>
			{:else if !session.signedIn}
				<p class="mt-2 text-xs text-muted-foreground">{tr('protocol_review_login')}</p>
			{/if}
		</Section>

		<!-- 0032 editorial workspace: decision ledger, current-round roster and
		     the author/desk discussion thread. -->
		{#if decisions.length || isDesk || mine.is(String(row.id ?? id))}
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
									<span class="text-muted-foreground"
										>{tr('ed_editor')}: {d.editorDisplayName ?? ''}</span
									>
									<span class="ml-auto">{fmtTime(d.createdAt, true)}</span>
								</div>
								{#if d.letter}
									<button
										class="mt-1 text-xs underline text-muted-foreground"
										onclick={() => (openLetters[d.id] = !openLetters[d.id])}
									>
										{openLetters[d.id] ? tr('ed_letter_hide') : tr('ed_letter_show')}
									</button>
									{#if openLetters[d.id]}<pre
											class="mt-1 whitespace-pre-wrap rounded-none border bg-muted/30 p-2 font-mono text-xs">{d.letter}</pre>{/if}
								{:else}
									<p class="mt-1 text-xs text-muted-foreground">{tr('ed_letter_public')}</p>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</Section>

			{#if currentPublishedReviewers >= 2 && !latestDecisionAtRound(currentRound)}
				<p
					class="rounded-none border-l-2 border-sky-500 bg-sky-50 p-2 text-xs text-sky-900 dark:bg-sky-500/10 dark:text-sky-200"
				>
					{tr('ed_nudge_hint')}
				</p>
			{/if}

			{#if isDesk}
				<Section title={tr('ed_roster_title')}>
					<p class="mb-2 text-xs text-muted-foreground">
						{tr('ed_roster_hint', { n: currentRound })}
					</p>
					{#if dispatches.length === 0}<p class="text-sm text-muted-foreground">
							{tr('ed_roster_empty')}
						</p>
					{:else}
						<ul class="divide-y text-sm">
							{#each dispatches as i (i.id)}
								{@const due = dueText(i)}
								<li class="flex flex-wrap items-center gap-2 py-1.5">
									<Badge tone={deskStatusTone[i.status] ?? 'muted'}
										>{enumLabel('pds', i.status)}</Badge
									>
									<code class="font-mono text-[10px]">{i.reviewerUserId.slice(0, 12)}</code>
									{#if due.label}<span class:text-destructive={due.late}>{due.label}</span>{/if}
									{#if i.declineReason}<span class="text-xs text-muted-foreground"
											>{i.declineReason}</span
										>{/if}
									<span class="ml-auto text-xs text-muted-foreground">{fmtTime(i.createdAt)}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</Section>
			{/if}

			{#if session.signedIn && (isDesk || mine.is(String(row.id ?? id)))}
				<Section title={tr('ed_discussion_tab')}>
					<div class="rounded-none border p-3">
						<Textarea
							name="proto_msg_body"
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
					{#if messages.length === 0}<p class="mt-2 text-sm text-muted-foreground">
							{tr('common_empty')}
						</p>
					{:else}
						<ul class="mt-2 space-y-2">
							{#each messages as msg (msg.id)}
								<li class="rounded-none border p-2 text-sm">
									<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
										{#if msg.authorDisplayName}<span class="font-medium text-foreground"
												>{msg.authorDisplayName}</span
											>{/if}
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
				</Section>
			{/if}
		{/if}

		<div class="grid gap-4 lg:grid-cols-2">
			<WikiPanel entityType="protocol" entityId={String(row.id ?? id)} />
			<ReferencesPanel entityType="protocol" entityId={String(row.id ?? id)} />
		</div>
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{/if}

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
			<Textarea name="pr_moder_reason" rows={3} bind:value={moderWhy} />
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

<Dialog open={!!rvEditTarget} onclose={() => (rvEditTarget = null)} title={tr('admin_review_edit')}>
	<div class="space-y-3">
		<p class="text-xs text-muted-foreground">{tr('admin_review_edit_hint')}</p>
		<label class="block">
			<span class="text-xs text-muted-foreground">{tr('protocol_review_comments')}</span>
			<Textarea name="pr_edit_comments" rows={4} bind:value={rvEditComments} />
		</label>
		<label class="block">
			<span class="text-xs text-muted-foreground"
				>{tr('field_reason')} <span class="text-destructive">*</span></span
			>
			<Input
				name="pr_edit_reason"
				class="h-8 w-full"
				placeholder={tr('admin_audit_reason_ph')}
				bind:value={rvEditReason}
			/>
		</label>
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (rvEditTarget = null)}>{tr('common_cancel')}</Button>
			<Button disabled={!rvEditComments.trim() || !rvEditReason.trim()} onclick={doReviewEdit}
				>{tr('common_save')}</Button
			>
		</div>
	</div>
</Dialog>

<Dialog bind:open={decideOpen} title={tr('ed_decide_title')} width="max-w-2xl">
	<div class="space-y-3">
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
		{#if decChoice === 'accept' && currentPublishedReviewers < 2}
			<p
				class="rounded-none border-l-2 border-amber-400 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
			>
				{tr('ed_accept_needs_two', { n: currentPublishedReviewers })}
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
				name="proto_dec_letter"
				rows={10}
				bind:value={decLetter}
				oninput={() => (decLetterTouched = true)}
			/>
		</label>
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (decideOpen = false)}>{tr('common_cancel')}</Button>
			<Button disabled={saving} onclick={submitDecide}>{tr('ed_decide_submit')}</Button>
		</div>
	</div>
</Dialog>

<svelte:head><title>{tr('nav_protocols')} · SPD</title></svelte:head>
