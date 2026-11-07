<script lang="ts">
	import { peers } from '$lib/api/client';
	import type { PeerAssignmentItem, PeerSeat } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import Textarea from '$lib/components/Textarea.svelte';

	/**
	 * Peer Review Portal — the reviewer's own workbench (§46). Seats and
	 * dispatches come from /peer-assignments with fulfilment derived live,
	 * so a finished review never lingers as open. 0032 adds the round each
	 * ask belongs to, its deadline (with a countdown), and a decline door:
	 * saying "no" is a recorded act, not a silent expiry. The portal links
	 * INTO the record pages; the review form itself lives there (same COI
	 * gates), which is why a decline here needs no navigation.
	 */
	let items = $state<PeerAssignmentItem[]>([]);
	let seats = $state<PeerSeat[]>([]);
	let target = $state(3);
	let error = $state('');
	let loaded = $state(false);
	// one decline dialog at a time; reason is optional but a blank is nudged
	let declineTarget = $state<PeerAssignmentItem | null>(null);
	let declineReason = $state('');
	let declining = $state(false);

	async function load() {
		if (!session.signedIn) return;
		error = '';
		try {
			const d = await peers.assignments();
			items = Array.isArray(d.items) ? d.items : [];
			seats = Array.isArray(d.seats) ? d.seats : [];
			target = d.target ?? 3;
			loaded = true;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}
	$effect(() => {
		if (session.signedIn) void load();
	});

	const openCount = $derived(items.filter((i) => i.status === 'open').length);
	// the reviewer's own past assignments (OJS "Add Reviewer" semantics):
	// completed = fulfilled dispatches, median days = real turnaround from
	// fulfilledAt, on-time = delivered before the deadline.
	const fulfilledItems = $derived(items.filter((i) => i.status === 'fulfilled'));
	const medianReviewDays = $derived.by(() => {
		const spans = fulfilledItems
			.filter((i) => i.fulfilledAt != null)
			.map((i) => (i.fulfilledAt as number) - i.createdAt)
			.sort((a, b) => a - b);
		if (!spans.length) return null;
		const mid = Math.floor(spans.length / 2);
		const secs = spans.length % 2 ? spans[mid] : Math.round((spans[mid - 1] + spans[mid]) / 2);
		return Math.max(0, Math.round(secs / 86_400));
	});
	const onTimeCount = $derived(
		fulfilledItems.filter((i) => i.fulfilledAt != null && (i.dueAt == null || i.fulfilledAt <= i.dueAt)).length
	);
	const declinedCount = $derived(items.filter((i) => i.status === 'declined').length);

	function recordHref(i: PeerAssignmentItem): string {
		return i.entityType === 'protocol' ? `/protocols/${i.entityId}` : `/validations/${i.entityId}`;
	}
	function entityLabel(i: PeerAssignmentItem): string {
		const kind = i.entityType === 'protocol' ? tr('et_protocol') : tr('et_wet_lab_validation');
		const rev = i.revisionNumber != null ? ` · r${i.revisionNumber}` : '';
		return `${kind}${rev} · ${i.entityId.slice(0, 18)}…`;
	}
	function dueInfo(i: PeerAssignmentItem): { label: string; late: boolean } | null {
		if (i.dueAt == null) return null;
		const days = Math.ceil((i.dueAt * 1000 - Date.now()) / 86_400_000);
		return days >= 0
			? { label: tr('ed_due_in', { n: days }), late: false }
			: { label: tr('ed_due_over', { n: -days }), late: true };
	}

	const statusTone: Record<string, string> = {
		open: 'warn',
		fulfilled: 'ok',
		expired: 'muted',
		cancelled: 'muted',
		declined: 'bad'
	};

	function openDecline(i: PeerAssignmentItem) {
		declineTarget = i;
		declineReason = '';
	}
	async function doDecline() {
		if (!declineTarget) return;
		declining = true;
		try {
			await peers.decline(declineTarget.id, declineReason.trim() || undefined);
			toastOk(tr('reviews_declined'));
			declineTarget = null;
			await load();
		} catch (e) {
			toastErr(e);
		} finally {
			declining = false;
		}
	}
</script>

<div class="mx-auto max-w-4xl space-y-4">
	<div>
		<h1 class="flex items-center gap-1.5 text-2xl font-bold">
			{tr('reviews_title')}
			<InfoTip text={tr('reviews_intro')} label={`${tr('reviews_title')} — ${tr('common_more_info')}`} class="mt-1" />
		</h1>
	</div>

	{#if !session.signedIn}
		<div class="flex items-center gap-3 rounded-none border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
			{tr('submit_login_needed')}
			<Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		</div>
	{:else if error}
		<p class="rounded-none bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
	{:else if !loaded}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else}
		<div class="grid gap-4 lg:grid-cols-2">
			<Section title={tr('reviews_seats_title')}>
				{#if seats.length === 0}
					<p class="text-sm text-muted-foreground">{tr('reviews_no_seats')}</p>
				{:else}
					<ul class="space-y-2 text-sm">
						{#each seats as s (s.id)}
							<li class="flex flex-wrap items-center gap-2">
								<a class="underline" href={`/organizations/${s.organizationId}`}>{s.organizationName}</a>
								<Badge tone={s.status === 'active' ? 'ok' : 'warn'}>{enumLabel('seat', s.status)}</Badge>
								{#if s.status === 'invited'}<span class="text-xs text-muted-foreground">{tr('reviews_invited_hint')}</span>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</Section>

			<!-- personal performance card: the desk's roster, from the reviewer's
			     own side. Only real numbers — nothing is invented when empty. -->
			<Section title={tr('reviews_perf_title')}>
				<div class="grid grid-cols-2 gap-3 text-sm">
					<div>
						<p class="text-2xl font-bold tabular-nums">{fulfilledItems.length}</p>
						<p class="text-xs text-muted-foreground">{tr('reviews_perf_done')}</p>
					</div>
					<div>
						<p class="text-2xl font-bold tabular-nums">{medianReviewDays == null ? '—' : `${medianReviewDays}d`}</p>
						<p class="text-xs text-muted-foreground">{tr('reviews_perf_median')}</p>
					</div>
					<div>
						<p class="text-2xl font-bold tabular-nums">
							{fulfilledItems.length ? `${Math.round((onTimeCount / fulfilledItems.length) * 100)}%` : '—'}
						</p>
						<p class="text-xs text-muted-foreground">{tr('reviews_perf_ontime')}</p>
					</div>
					<div>
						<p class="text-2xl font-bold tabular-nums">{declinedCount}</p>
						<p class="text-xs text-muted-foreground">{tr('reviews_perf_declined')}</p>
					</div>
				</div>
			</Section>
		</div>

		<Section title={tr('reviews_tasks_title')}>
			<div class="mb-2 flex items-center gap-2">
				<Badge tone={openCount ? 'warn' : 'ok'}>{openCount} {tr('pds_open')}</Badge>
				<span class="text-xs text-muted-foreground">{tr('reviews_target_note', { n: target })}</span>
			</div>
			{#if items.length === 0}
				<p class="text-sm text-muted-foreground">{tr('reviews_no_tasks')}</p>
			{:else}
				<ul class="space-y-1.5 text-sm">
					{#each items as i (i.id)}
						{@const due = dueInfo(i)}
						<li class="flex flex-wrap items-center gap-2 rounded-none border p-2">
							<Badge tone={statusTone[i.status] ?? 'muted'}>{enumLabel('pds', i.status)}</Badge>
							<Badge tone="muted">{tr('ed_round_n', { n: i.round })}</Badge>
							<a class="underline" href={recordHref(i)}>{entityLabel(i)}</a>
							{#if i.status === 'open' && due}
								<span class="text-xs {due.late ? 'font-medium text-destructive' : 'text-muted-foreground'}">{due.label}</span>
							{/if}
							{#if i.declineReason}<span class="text-xs text-muted-foreground">· {i.declineReason}</span>{/if}
							{#if i.status === 'open'}
								<div class="ml-auto flex gap-1.5">
									<a class="text-xs font-medium text-primary underline" href={recordHref(i)}>{tr('reviews_open_link')} →</a>
									<Button size="xs" variant="ghost" onclick={() => openDecline(i)}>{tr('reviews_decline')}</Button>
								</div>
							{:else}
								<span class="ml-auto text-xs text-muted-foreground">{fmtTime(i.createdAt)}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</Section>
	{/if}
</div>

<Dialog open={!!declineTarget} onclose={() => (declineTarget = null)} title={tr('reviews_decline_title')}>
	{#if declineTarget}
		<div class="space-y-3">
			<p class="text-xs text-muted-foreground">{tr('reviews_decline_hint', { n: declineTarget.round })}</p>
			<label class="block">
				<span class="text-xs text-muted-foreground">{tr('reviews_decline_reason')}</span>
				<Textarea name="decline_reason" rows={3} bind:value={declineReason} />
			</label>
			<div class="flex justify-end gap-2">
				<Button variant="ghost" onclick={() => (declineTarget = null)}>{tr('common_cancel')}</Button>
				<Button variant="danger" disabled={declining} onclick={doDecline}>{tr('reviews_decline_confirm')}</Button>
			</div>
		</div>
	{/if}
</Dialog>

<svelte:head><title>{tr('reviews_title')} · SPD</title></svelte:head>
