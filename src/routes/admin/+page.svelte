<script lang="ts">
	import { page } from '$app/state';
	import { admin, apiTokens, contributions, corrections, firstArray, retractions } from '$lib/api/client';
	import type { AdminApplicationRow, AdminAuditRow, AdminClaimRow, AdminEditorialStats, AdminRecordRow, AdminReviewerRow, PeerAssignmentItem } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { goto } from '$app/navigation';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { toastOk, toastInfo, toastErr } from '$lib/state/toast.svelte';
	import { cellText } from '$lib/components/json-coerce';
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import Select from '$lib/components/Select.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import DataView from '$lib/components/DataView.svelte';
	import IdLink from '$lib/components/IdLink.svelte';
	import FilingDetail from '$lib/components/FilingDetail.svelte';
	import CorrectionItems from '$lib/components/CorrectionItems.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import Textarea from '$lib/components/Textarea.svelte';
	import { fetchTargetFields, type TargetFields } from '$lib/submit/field-options';
	import { entityTypeOfId, isCorrectable } from '$lib/submit/correctable';
	import type { ApiRecordRow } from '$lib/api/types';

	// Curators run the editorial desk: the queue, the filing decisions and the
	// reviewer roster. Account-level desks (roles, tokens, audit, dispatch,
	// applications, claims) stay admin-only.
	const ADMIN_ONLY_TABS = ['applications', 'claims', 'audit', 'dispatch', 'roles', 'tokens'];
	const canSeeTab = (key: string) => session.isAdmin || !ADMIN_ONLY_TABS.includes(key);

	$effect(() => {
		if (session.ready && !session.isCurator) goto('/');
	});

	// Deep-linkable tab: /admin?tab=dispatch opens the dispatch queue (shareable
	// sub-queue URLs, 0032). Read once at init; written on every change.
	const VALID_TABS = ['editorial', 'applications', 'claims', 'filings', 'audit', 'dispatch', 'roles', 'tokens', 'reviewers'];
	const initialTab = page.url.searchParams.get('tab');
	let tab = $state(initialTab && VALID_TABS.includes(initialTab) ? initialTab : 'editorial');
	// A curator following an admin-only deep link lands on their desk instead
	// of an empty page; the URL-sync effect below then rewrites the address.
	$effect(() => {
		if (session.ready && session.isCurator && !canSeeTab(tab)) tab = 'editorial';
	});
	// editorial sub-queue: 'all' | 'unassigned' | 'me' | 'awaiting' — the last
	// is records whose round is reviewed but undecided (0032 desk backlog).
	let sub = $state(page.url.searchParams.get('sub') ?? 'all');
	// URL is written from (tab, sub); a shared effect keeps them in sync so a
	// deep link (?tab=editorial&sub=awaiting) survives the tab switch.
	$effect(() => {
		const want = `/admin?tab=${tab}${tab === 'editorial' && sub !== 'all' ? `&sub=${sub}` : ''}`;
		if (page.url.pathname + page.url.search !== want) {
			void goto(want, { keepFocus: true, noScroll: true, replaceState: true });
		}
	});
	// ---------------------------------------------------------------- editorial
	let tasks = $state<unknown[]>([]);
	let statusFilter = $state('');
	let typeFilter = $state('');
	let assigneeFilter = $state('');
	// 0032 desk telemetry + the staff roster that replaces the uuid-paste reassign
	let stats = $state<AdminEditorialStats | null>(null);
	let roster = $state<AdminReviewerRow[]>([]);
	let staff = $state<Array<{ userId: string; displayName: string; role: string }>>([]);
	let staffLoaded = $state(false);
	async function loadStaff() {
		if (staffLoaded) return;
		try {
			const d = (await admin.staff()) as unknown as { items?: Array<{ userId: string; displayName: string; role: string }> };
			staff = (d.items ?? []).map((s) => ({ userId: s.userId, displayName: s.displayName, role: s.role }));
			staffLoaded = true;
		} catch (e) {
			toastErr(e);
		}
	}
	async function loadStats() {
		try {
			stats = await admin.editorialStats();
		} catch (e) {
			toastErr(e);
		}
	}
	async function loadRoster() {
		try {
			roster = (await admin.reviewerRoster()).reviewers ?? [];
		} catch (e) {
			toastErr(e);
		}
	}
	let taskDetail = $state<Record<string, unknown> | null>(null);
	// staff refused to be fed prompt() dialogs — every decision gets a real
	// inline field, one shared form state while a task card is open
	let forms = $state({ resolution: '', reason: '', assignee: '', note: '', days: '365', sender: '', recipient: '' });

	async function loadTasks() {
		try {
			const d = await admin.tasks({
				status: statusFilter || undefined,
				taskType: typeFilter || undefined,
				assignee: assigneeFilter || undefined
			});
			tasks = firstArray(d, 'tasks', 'items');
		} catch (e) {
			toastErr(e);
		}
	}

	const awaitingRecords = $derived(stats?.backlog.awaitingRecords ?? []);
	// the task sub-queues ride on the same assignee filter: 'unassigned' and
	// 'me' map to the backend's assigned_to values; 'awaiting' hides the tasks.
	$effect(() => {
		if (tab === 'editorial' && sub !== 'awaiting') {
			const want = sub === 'me' ? 'me' : sub === 'unassigned' ? 'unassigned' : '';
			if (assigneeFilter !== want) {
				assigneeFilter = want;
				void loadTasks();
			}
		}
	});

	async function openTask(id: string) {
		try {
			taskDetail = await admin.task(id);
			forms = { resolution: '', reason: '', assignee: '', note: '', days: '365', sender: '', recipient: '' };
		} catch (e) {
			toastErr(e);
		}
	}

	async function act(fn: () => Promise<unknown>, msg = tr('admin_done')) {
		try {
			await fn();
			toastOk(msg);
			taskDetail = null;
			await loadTasks();
		} catch (e) {
			toastErr(e);
		}
	}

	const dTask = $derived(taskDetail?.task as Record<string, unknown> | undefined);
	const entityId = $derived(String(dTask?.entityId ?? ''));
	const entityType = $derived(String(dTask?.entityType ?? ''));
	const taskId = $derived(String(dTask?.id ?? ''));

	// ------------------------------------------------------------- applications
	let applications = $state<AdminApplicationRow[]>([]);
	let appStatus = $state('pending');
	let appOpen = $state('');

	async function loadApplications() {
		try {
			applications = (await admin.applications(appStatus || undefined)).applications ?? [];
		} catch (e) {
			toastErr(e);
		}
	}
	function appDecided(a: AdminApplicationRow): boolean {
		return a.status === 'approved' || a.status === 'rejected' || a.status === 'expired' || a.status === 'revoked';
	}

	// -------------------------------------------------------------------- claims
	let claims = $state<AdminClaimRow[]>([]);
	let claimStatus = $state('pending');

	async function loadClaims() {
		try {
			claims = (await admin.claims(claimStatus || undefined)).claims ?? [];
		} catch (e) {
			toastErr(e);
		}
	}

	// --------------------------------------------------------------------- audit
	let auditRows = $state<AdminAuditRow[]>([]);
	let auditType = $state('');
	let auditLoading = $state(false);

	async function loadAudit() {
		auditLoading = true;
		try {
			auditRows = (await admin.audit({ resourceType: auditType.trim() || undefined })).entries ?? [];
		} catch (e) {
			toastErr(e);
		} finally {
			auditLoading = false;
		}
	}

	$effect(() => {
		if (!session.isCurator) return;
		if (tab === 'editorial') {
			void loadTasks();
			void loadStats();
			// the staff roster is an admin read (it lists role grants)
			if (session.isAdmin) void loadStaff();
		}
		if (tab === 'applications') void loadApplications();
		if (tab === 'claims') void loadClaims();
		if (tab === 'audit') void loadAudit();
		if (tab === 'filings') void loadFilings();
		if (tab === 'dispatch') void loadDispatches();
		if (tab === 'reviewers') void loadRoster();
	});

	// ----------------------------------------------------------- peer dispatch
	let dispatchItems = $state<PeerAssignmentItem[]>([]);
	let dispatchTarget = $state(3);
	let dispatchStatus = $state('');
	let mdEntityType = $state('wet_lab_validation');
	let mdEntityId = $state('');
	let mdOrcid = $state('');
	// 0032: an explicit deadline (days from now) instead of the silent default.
	let mdDueDays = $state('14');
	// staff may cancel an open ask; a reviewer declines it themselves (§46).
	function dispatchDue(d: PeerAssignmentItem): { label: string; late: boolean } | null {
		if (d.dueAt == null) return null;
		const days = Math.ceil((d.dueAt * 1000 - Date.now()) / 86_400_000);
		return days >= 0 ? { label: tr('ed_due_in', { n: days }), late: false } : { label: tr('ed_due_over', { n: -days }), late: true };
	}
	const dispatchStatusTone: Record<string, string> = {
		open: 'warn', fulfilled: 'ok', expired: 'muted', cancelled: 'muted', declined: 'bad'
	};
	let qOrg = $state('');
	let qYear = $state(String(new Date().getUTCFullYear()));
	let qValue = $state('');

	async function loadDispatches() {
		try {
			const d = await admin.peerDispatches(dispatchStatus ? { status: dispatchStatus } : undefined);
			dispatchItems = Array.isArray(d.items) ? d.items : [];
			dispatchTarget = d.target ?? 3;
		} catch (e) {
			toastErr(e);
		}
	}
	async function doManualDispatch() {
		try {
			const dueDays = Number(mdDueDays) || undefined;
			await admin.manualDispatch({ entityType: mdEntityType, entityId: mdEntityId.trim(), reviewerOrcidId: mdOrcid.trim(), dueDays });
			toastOk(tr('dispatch_submit'));
			mdEntityId = '';
			await loadDispatches();
		} catch (e) {
			toastErr(e);
		}
	}
	async function doCancelDispatch(id: string) {
		try {
			await admin.cancelDispatch(id);
			toastOk(tr('dispatch_cancel'));
			await loadDispatches();
		} catch (e) {
			toastErr(e);
		}
	}
	async function doSetQuota() {
		try {
			await admin.setDispatchQuota(qOrg.trim(), Number(qYear), Number(qValue));
			toastOk(tr('dispatch_quota_set'));
		} catch (e) {
			toastErr(e);
		}
	}
	async function doDeleteQuota() {
		try {
			await admin.deleteDispatchQuota(qOrg.trim(), Number(qYear));
			toastOk(tr('dispatch_quota_delete'));
		} catch (e) {
			toastErr(e);
		}
	}

	// ---------------------------------------------------------------- filings
	// Community filings moderation (corrections / retractions / contributions).
	// Deletion is ALWAYS soft: hidden rows leave every public read, stay here,
	// and each action carries a reason that lands in the audit trail.
	const FILING_KINDS = ['correction', 'retraction', 'contribution'];
	const FILING_GET: Record<string, (i: string) => Promise<ApiRecordRow>> = {
		correction: (i) => corrections.get(i),
		retraction: (i) => retractions.get(i),
		contribution: (i) => contributions.get(i)
	};

	let filingRows = $state<AdminRecordRow[]>([]);
	let filingType = $state('correction');
	let filingHidden = $state('');
	let filingLoading = $state(false);

	async function loadFilings() {
		filingLoading = true;
		try {
			const d = await admin.records({
				entityType: filingType || undefined,
				hidden: filingHidden === '' ? undefined : filingHidden === '1'
			});
			filingRows = d.items ?? [];
		} catch (e) {
			toastErr(e);
		} finally {
			filingLoading = false;
		}
	}

	// one moderation dialog serves hide/restore for records (and, via the
	// validations page, comments): mode carries the verb, id the target
	let moder = $state<{ kind: 'record' | 'comment'; id: string; mode: 'hide' | 'restore' } | null>(null);
	let moderReason = $state('');
	function openModerate(kind: 'record' | 'comment', id: string, mode: 'hide' | 'restore') {
		moder = { kind, id, mode };
		moderReason = '';
	}
	async function doModerate() {
		if (!moder || !moderReason.trim()) return;
		const r = moderReason.trim();
		try {
			if (moder.kind === 'record') {
				if (moder.mode === 'hide') await admin.hideRecord(moder.id, r);
				else await admin.restoreRecord(moder.id, r);
			} else {
				if (moder.mode === 'hide') await admin.hideComment(moder.id, r);
				else await admin.restoreComment(moder.id, r);
			}
			toastOk(moder.mode === 'hide' ? tr('admin_filing_hidden') : tr('admin_filing_restored'));
			moder = null;
			if (tab === 'filings') void loadFilings();
			else if (tab === 'editorial') void loadTasks();
		} catch (e) {
			toastErr(e);
		}
	}

	// apply/reject dialog: a DECISION, deliberately not the hide/restore
	// `moder` state — accepting runs the field assertions through the create
	// path's own gates and rewrites the target record (§53), hiding only
	// mutes the ledger row. The items preview is read from the local row
	// payload (zero fetch); the apply receipt carries `changed`/`drifted`.
	//
	// Apply is also the editorial office's chance to FIX the claim before it
	// lands: the rows are editable, and only a changed set is sent as an
	// override. The filing itself is never rewritten.
	let decide =
		$state<{ id: string; mode: 'apply' | 'reject'; items: Array<Record<string, unknown>> } | null>(null);
	let decideReason = $state('');
	let decideItemsText = $state('');
	let decideOriginal = $state('');
	let decideType = $state('');
	let decideFields = $state<TargetFields>({ keys: [], scalars: {} });

	function correctionTargetType(r: AdminRecordRow): string {
		const { ev } = filingEventOf((r.payload ?? {}) as Record<string, unknown>);
		return String(ev.entityType ?? '') || entityTypeOfId(filingTarget(r)) || '';
	}

	function parseDecideItems(): Array<Record<string, unknown>> | null {
		try {
			const a = JSON.parse(decideItemsText || '[]') as unknown;
			if (!Array.isArray(a)) return null;
			const rows = a.filter(
				(it) =>
					!!it &&
					typeof it === 'object' &&
					!Array.isArray(it) &&
					String((it as Record<string, unknown>).field ?? '').trim() !== '' &&
					'proposed' in (it as object)
			) as Array<Record<string, unknown>>;
			return rows.length ? rows : null;
		} catch {
			return null;
		}
	}

	function openDecide(r: AdminRecordRow, mode: 'apply' | 'reject') {
		const { ev } = filingEventOf((r.payload ?? {}) as Record<string, unknown>);
		const items = (Array.isArray(ev.items) ? ev.items : []).filter(
			(it) =>
				!!it &&
				typeof it === 'object' &&
				!Array.isArray(it) &&
				String((it as Record<string, unknown>).field ?? '').trim() !== ''
		) as Array<Record<string, unknown>>;
		decide = { id: r.id, mode, items };
		decideReason = '';
		decideType = correctionTargetType(r);
		decideItemsText = JSON.stringify(items);
		decideOriginal = decideItemsText;
		decideFields = { keys: [], scalars: {} };
		if (mode === 'apply' && isCorrectable(decideType)) {
			void fetchTargetFields(decideType, filingTarget(r)).then((f) => (decideFields = f));
		}
	}

	const decideItemsReady = $derived(decide?.mode !== 'apply' || parseDecideItems() !== null);
	const decideApplyable = $derived(decide?.mode !== 'apply' || isCorrectable(decideType));

	async function doDecide() {
		if (!decide || !decideReason.trim() || !decideItemsReady || !decideApplyable) return;
		try {
			if (decide.mode === 'apply') {
				// Send the override only when the desk actually changed a row.
				const items = decideItemsText === decideOriginal ? undefined : (parseDecideItems() ?? undefined);
				const rec = await admin.applyRecord(decide.id, decideReason.trim(), items);
				const changed = Array.isArray(rec.changed) ? rec.changed.length : 0;
				const drifted = Array.isArray(rec.drifted) ? rec.drifted.length : 0;
				toastOk(tr('admin_filing_applied', { n: changed }));
				// drift is advisory by doctrine — the toast mirrors that: info,
				// not error, and never blocks
				if (drifted) toastInfo(tr('admin_drift_warning', { n: drifted }));
			} else {
				await admin.rejectRecord(decide.id, decideReason.trim());
				toastOk(tr('admin_filing_rejected'));
			}
			decide = null;
			void loadFilings();
		} catch (e) {
			toastErr(e);
		}
	}

	// edit dialog: rebuild the payload in the SAME wrapping it arrived with
	// (door filings store {entityId, event:{…}}, wizard filings are flat),
	// re-check it server-side, and record an audit reason
	let filingEdit =
		$state<{ id: string; entityType: string; base: Record<string, unknown>; wrapped: boolean } | null>(null);
	let editReason = $state(''); // audit reason — required
	let editFieldReason = $state(''); // the filing's own claim reason
	let editItems = $state(''); // CorrectionItems JSON rows (corrections)
	let editSummary = $state(''); // contributions
	let editRaw = $state(false); // advanced: replace the whole payload
	let editRawText = $state('');
	let editFields = $state<TargetFields>({ keys: [], scalars: {} });

	function filingEventOf(payload: Record<string, unknown>): { ev: Record<string, unknown>; wrapped: boolean } {
		const inner = payload.event;
		if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
			return { ev: inner as Record<string, unknown>, wrapped: true };
		}
		return { ev: payload, wrapped: false };
	}
	function seedFilingEdit(id: string, entityType: string, rawPayload: Record<string, unknown>) {
		const { ev, wrapped } = filingEventOf(rawPayload);
		filingEdit = { id, entityType, base: rawPayload, wrapped };
		editItems = JSON.stringify(Array.isArray(ev.items) ? ev.items : []);
		editFieldReason = String(ev.reason ?? '');
		editSummary = String(ev.summary ?? '');
		editRaw = false;
		editRawText = JSON.stringify(rawPayload, null, 2);
		editReason = '';
		// the target's real field names drive the datalist (best effort)
		const target = String(rawPayload.entityId ?? ev.targetId ?? '');
		const ttype = String(ev.entityType ?? '');
		void fetchTargetFields(ttype || undefined, target).then((r) => (editFields = r));
	}
	function openFilingEdit(r: AdminRecordRow) {
		seedFilingEdit(r.id, r.entityType, (r.payload ?? {}) as Record<string, unknown>);
	}
	async function openFilingEditFromTask(id: string, type: string) {
		try {
			const row = await FILING_GET[type](id);
			seedFilingEdit(String(row.id ?? id), type, (row.payload ?? {}) as Record<string, unknown>);
		} catch (e) {
			toastErr(e);
		}
	}

	// the same rule the server enforces: ≥1 assertion, named field, proposed present
	const itemsReadyEdit = $derived.by(() => {
		try {
			const a = JSON.parse(editItems || '[]') as unknown;
			return (
				Array.isArray(a) &&
				a.length > 0 &&
				a.every(
					(r) =>
						!!r &&
						typeof r === 'object' &&
						String((r as Record<string, unknown>).field ?? '').trim() !== '' &&
						'proposed' in (r as object)
				)
			);
		} catch {
			return false;
		}
	});
	const editReady = $derived(
		!!filingEdit &&
			!!editReason.trim() &&
			(editRaw ||
				(filingEdit.entityType === 'correction' && editFieldReason.trim() && itemsReadyEdit) ||
				(filingEdit.entityType === 'retraction' && editFieldReason.trim()) ||
				(filingEdit.entityType === 'contribution' && editSummary.trim()))
	);
	async function doFilingEdit() {
		if (!filingEdit || !editReady) return;
		let payload: Record<string, unknown>;
		if (editRaw) {
			try {
				payload = JSON.parse(editRawText) as Record<string, unknown>;
			} catch {
				toastErr(new Error('payload is not valid JSON'));
				return;
			}
		} else {
			const changes: Record<string, unknown> = {};
			if (filingEdit.entityType === 'correction') {
				changes.reason = editFieldReason.trim();
				changes.items = (JSON.parse(editItems || '[]') as Array<Record<string, unknown>>).filter(
					(r) => String(r?.field ?? '').trim() !== ''
				);
			} else if (filingEdit.entityType === 'retraction') {
				changes.reason = editFieldReason.trim();
			} else if (filingEdit.entityType === 'contribution') {
				changes.summary = editSummary.trim();
			}
			payload = filingEdit.wrapped
				? { ...filingEdit.base, event: { ...(filingEdit.base.event as Record<string, unknown>), ...changes } }
				: { ...filingEdit.base, ...changes };
		}
		try {
			await admin.editRecord(filingEdit.id, { payload, reason: editReason.trim() });
			toastOk(tr('admin_done'));
			filingEdit = null;
			if (tab === 'filings') void loadFilings();
		} catch (e) {
			toastErr(e);
		}
	}

	function filingTarget(r: AdminRecordRow): string {
		const p = (r.payload ?? {}) as Record<string, unknown>;
		const { ev } = filingEventOf(p);
		return String(p.entityId ?? ev.targetId ?? '');
	}
	function filingHeadline(r: AdminRecordRow): string {
		const { ev } = filingEventOf((r.payload ?? {}) as Record<string, unknown>);
		const text = String(ev.reason ?? ev.summary ?? '').trim();
		if (text) return text.length > 110 ? `${text.slice(0, 110)}…` : text;
		const n = Array.isArray(ev.items) ? (ev.items as unknown[]).length : 0;
		return n ? tr('filing_items_count', { n }) : '';
	}

	// -------------------------------------------------------------------- roles
	let roleUserId = $state('');
	let roleView = $state<Record<string, unknown> | null>(null);
	let roleGrant = $state({ role: 'researcher', expiresInDays: '365', reason: '' });
	let roleError = $state('');

	async function loadUser() {
		roleError = '';
		try {
			roleView = (await admin.user(roleUserId.trim())) as unknown as Record<string, unknown>;
		} catch (e) {
			roleError = e instanceof Error ? e.message : String(e);
			roleView = null;
		}
	}

	// token tier entitlement (§41) — admin-only; there is no token list endpoint,
	// so the grant is by token id (the owner reads it from their /me panel).
	let tokenGrant = $state({ tokenId: '', tier: 'unlimited', reason: '' });

	const TASK_TYPE_KEYS = ['validation_screening', 'organization_claim_review', 'researcher_application_review', 'contribution_review'];
	const APP_STATUSES = ['pending', 'email_received', 'under_review', 'awaiting_email', 'approved', 'rejected', 'all'];
	const CLAIM_STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'all'];
</script>

{#if session.isCurator}
	<div class="space-y-4">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h1 class="text-2xl font-bold">{session.isAdmin ? tr('nav_admin') : tr('nav_editorial')}</h1>
			<p class="text-xs text-muted-foreground">{tr('admin_portal_hint')}</p>
		</div>

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'editorial', label: tr('admin_tab_editorial'), badge: tasks.length },
				{ key: 'applications', label: tr('admin_tab_applications'), badge: applications.length },
				{ key: 'claims', label: tr('admin_tab_claims'), badge: claims.length },
				{ key: 'filings', label: tr('admin_tab_filings'), badge: filingRows.length },
				{ key: 'audit', label: tr('admin_tab_audit') },
				{ key: 'dispatch', label: tr('admin_tab_dispatch'), badge: dispatchItems.filter((i) => i.status === 'open').length },
				{ key: 'reviewers', label: tr('admin_tab_reviewers') },
				{ key: 'roles', label: tr('admin_roles') },
				{ key: 'tokens', label: tr('admin_tokens_tab') }
			].filter((i) => canSeeTab(i.key))}
		/>

		{#if tab === 'editorial'}
			<!-- 0032 desk telemetry strip: the backlog the queue is sitting in,
			     the turnaround medians, and the accept gate waiting on a verdict.
			     Bounded recency window — the payload states its own caps. -->
			{#if stats}
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
					<button class="rounded-none border p-2 text-left transition-colors hover:border-primary" onclick={() => { statusFilter = 'open'; assigneeFilter = ''; void loadTasks(); }}>
						<p class="text-xl font-bold tabular-nums">{Object.values(stats.backlog.validationsByStatus).reduce((a, b) => a + b, 0)}</p>
						<p class="text-xs text-muted-foreground">{tr('admin_st_validations')}</p>
					</button>
					<button class="rounded-none border p-2 text-left transition-colors hover:border-primary {stats.backlog.awaitingDecision ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/10' : ''}" onclick={() => { sub = 'awaiting'; }}>
						<p class="text-xl font-bold tabular-nums">{stats.backlog.awaitingDecision}</p>
						<p class="text-xs text-muted-foreground">{tr('admin_st_awaiting')}</p>
					</button>
					<div class="rounded-none border p-2">
						<p class="text-xl font-bold tabular-nums">{stats.screening.medianFirstScreeningDays == null ? '—' : `${stats.screening.medianFirstScreeningDays}d`}</p>
						<p class="text-xs text-muted-foreground">{tr('admin_st_screen_med')}</p>
					</div>
					<div class="rounded-none border p-2">
						<p class="text-xl font-bold tabular-nums">{stats.reviewing.medianReviewDays == null ? '—' : `${stats.reviewing.medianReviewDays}d`}</p>
						<p class="text-xs text-muted-foreground">{tr('admin_st_review_med')}</p>
					</div>
					<div class="rounded-none border p-2">
						<p class="text-xl font-bold tabular-nums">{stats.reviewing.onTimeRatePercent == null ? '—' : `${stats.reviewing.onTimeRatePercent}%`}</p>
						<p class="text-xs text-muted-foreground">{tr('admin_st_ontime')}</p>
					</div>
					<div class="rounded-none border p-2">
						<p class="text-xl font-bold tabular-nums">{stats.reviewers.activeLast90d}</p>
						<p class="text-xs text-muted-foreground">{tr('admin_st_active_reviewers')}</p>
					</div>
					<div class="col-span-2 flex flex-wrap items-center gap-1.5 rounded-none border p-2">
						{#each [['accept', 'ok'], ['minor_revision', 'warn'], ['major_revision', 'warn'], ['decline', 'bad']] as [k, tone] (k)}
							<Badge tone={tone}>{stats.decisions[k] ?? 0} {enumLabel('ed', k)}</Badge>
						{/each}
					</div>
				</div>
				{#if stats.backlog.awaitingRecords.length}
					<div class="rounded-none border-l-2 border-amber-400 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
						{tr('admin_st_awaiting_list')}:
						{#each stats.backlog.awaitingRecords.slice(0, 6) as a (a.entityType + a.id)}
							<a class="underline" href="/{a.entityType === 'protocol' ? 'protocols' : 'validations'}/{a.id}">{tr('ed_round_n', { n: a.round })} · {a.id.slice(0, 10)}…</a>
						{/each}
					</div>
				{/if}
			{/if}
			<div class="flex flex-wrap items-center gap-2">
				<Select
					name="ad_status"
					class="h-8 w-40"
					placeholder={tr('admin_filter_any_status')}
					bind:value={statusFilter}
					options={[{ value: '', label: tr('admin_filter_any_status') }, ...['open', 'in_progress', 'resolved', 'cancelled'].map((s) => ({ value: s, label: enumLabel('ts', s) }))]}
					onchange={loadTasks}
				/>
				<Select
					name="ad_type"
					class="h-8 w-44"
					placeholder={tr('admin_filter_any_type')}
					bind:value={typeFilter}
					options={[{ value: '', label: tr('admin_filter_any_type') }, ...TASK_TYPE_KEYS.map((t) => ({ value: t, label: enumLabel('tt', t) }))]}
					onchange={loadTasks}
				/>
				<Select
					name="ad_assignee"
					class="h-8 w-36"
					placeholder={tr('admin_assignee_anyone')}
					bind:value={assigneeFilter}
					options={[{ value: '', label: tr('admin_assignee_anyone') }, { value: 'me', label: tr('admin_assignee_me') }, { value: 'unassigned', label: tr('admin_assignee_unassigned') }]}
					onchange={loadTasks}
				/>
				<Button size="sm" variant="ghost" onclick={loadTasks}>⟳</Button>
			</div>

			<!-- sub-queue chips: the three views a desk actually works in -->
			<div class="flex flex-wrap items-center gap-1.5">
				{#each [['all', tr('ed_sub_all')], ['unassigned', tr('ed_sub_unassigned')], ['me', tr('ed_sub_mine')], ['awaiting', tr('ed_sub_awaiting')]] as [key, label] (key)}
					<Button size="xs" variant={sub === key ? 'primary' : 'outline'} onclick={() => { sub = key; }}>{label}</Button>
				{/each}
			</div>

			{#if sub === 'awaiting'}
				<!-- reviewed-but-undecided: the accept gate is met, no verdict. -->
				{#if awaitingRecords.length === 0}
					<p class="text-sm text-muted-foreground">{tr('ed_sub_awaiting_empty')}</p>
				{:else}
					<ul class="space-y-1.5">
						{#each awaitingRecords as a (a.entityType + a.id)}
							<li class="flex flex-wrap items-center gap-2 rounded-none border p-2 text-sm">
								<Badge tone="info">{tr('ed_round_n', { n: a.round })}</Badge>
								<Badge tone="muted">{a.entityType === 'protocol' ? tr('et_protocol') : tr('et_wet_lab_validation')}</Badge>
								<span class="text-xs text-muted-foreground">{tr('ed_round_reviews_in', { n: a.reviewCount, need: 2 })}</span>
								<a class="underline break-all" href="/{a.entityType === 'protocol' ? 'protocols' : 'validations'}/{a.id}"><code class="font-mono text-xs">{a.id}</code></a>
								<span class="ml-auto text-xs text-muted-foreground">{tr('ed_sub_awaiting_age', { n: Math.max(0, Math.floor((Date.now() / 1000 - a.submittedAt) / 86400)) })}</span>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if tasks.length === 0}
				<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}
				<ul class="space-y-2">
					{#each tasks as raw, i (i)}
						{@const t = raw as Record<string, unknown>}
						<li class="flex flex-wrap items-center gap-2 rounded-none border p-2.5 text-sm">
							<Button variant="link" size="xs" class="px-0 font-medium" onclick={() => openTask(String(t.id))}>{enumLabel('tt', String(t.taskType ?? ''))}</Button>
							<span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{String(t.summary ?? '')}</span>
							<StatusBadge status={String(t.status ?? '')} ns="ts" />
							{#if t.assigneeDisplayName}
								<Badge tone="info">{tr('admin_assigned_to')} {String(t.assigneeDisplayName)}</Badge>
							{:else if t.assigneeId}
								<Badge tone="muted">{String(t.assigneeId).slice(0, 8)}</Badge>
							{:else}
								<Badge tone="muted">{tr('admin_unassigned')}</Badge>
							{/if}
							{#if String(t.status) === 'open'}
								<Button size="xs" onclick={() => act(() => admin.claimTask(String(t.id)))}>{tr('admin_claim')}</Button>
							{/if}
							<span class="text-xs text-muted-foreground">{fmtTime(Number(t.createdAt ?? 0))}</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if dTask}
				<Section title={tr('admin_task_detail')}>
					<div class="mb-2 flex flex-wrap items-center gap-2 text-xs">
						<StatusBadge status={String(dTask.status)} ns="ts" />
						<code>{String(dTask.taskType)}</code>
						<span>· {enumLabel('et', entityType.replace(/-/g, '_'))} <code>{entityId.slice(0, 24)}</code></span>
						{#if dTask.resolution}<Badge tone="muted">{String(dTask.resolution)}</Badge>{/if}
						<Button variant="link" size="xs" class="ml-auto text-muted-foreground" onclick={() => (taskDetail = null)}>{tr('common_close')}</Button>
					</div>
					{#if dTask.summary}<p class="mb-2 text-sm">{String(dTask.summary)}</p>{/if}
					{#if dTask.entity}<DataView label={tr('admin_entity')} value={dTask.entity} />{/if}

					<div class="mt-3 space-y-3">
						<div class="flex flex-wrap gap-2">
							{#if String(dTask.status) === 'open'}
								<Button size="sm" onclick={() => act(() => admin.claimTask(taskId))}>{tr('admin_claim')}</Button>
							{/if}
							{#if String(dTask.taskType) === 'validation_screening' && entityId}
								<Button size="sm" variant="outline" href="/validations/{entityId}">{tr('admin_open_validation')}</Button>
							{/if}
						</div>

						{#if String(dTask.taskType) === 'researcher_application_review' && entityId}
							<p class="text-xs text-muted-foreground">{tr('admin_app_actions_hint')}</p>
							<div class="flex flex-wrap items-center gap-2 text-sm">
								<Input name="ad_sender" class="h-8 w-52 text-xs" placeholder={tr('admin_sender_ph')} bind:value={forms.sender} />
								<Input name="ad_recipient" class="h-8 w-52 text-xs" placeholder={tr('admin_recipient_ph')} bind:value={forms.recipient} />
								<Button size="sm" variant="outline" disabled={!forms.sender.trim() || !forms.recipient.trim()} onclick={() => act(() => admin.markEmailReceived(entityId, { senderEmail: forms.sender.trim(), recipientEmail: forms.recipient.trim() }))}>{tr('admin_email_received')}</Button>
							</div>
							<div class="flex flex-wrap items-center gap-2 text-sm">
								<Input name="ad_note" class="h-8 min-w-48 flex-1 text-xs" placeholder={tr('admin_note_prompt')} bind:value={forms.note} />
								<Input name="ad_days" type="number" class="h-8 w-20 text-xs" placeholder={tr('admin_days_ph')} bind:value={forms.days} />
								<Button size="sm" onclick={() => act(() => admin.approveApplication(entityId, forms.days ? Number(forms.days) : undefined, forms.note || undefined))}>{tr('admin_approve')}</Button>
								<Button size="sm" variant="danger" onclick={() => act(() => admin.rejectApplication(entityId, forms.note || undefined))}>{tr('admin_reject')}</Button>
							</div>
						{:else if String(dTask.taskType) === 'organization_claim_review' && entityId}
							<div class="flex flex-wrap items-center gap-2 text-sm">
								<Input name="ad_claim_note" class="h-8 min-w-48 flex-1 text-xs" placeholder={tr('admin_note_prompt')} bind:value={forms.note} />
								<Button size="sm" onclick={() => act(() => admin.approveClaim(entityId, forms.note || undefined))}>{tr('admin_approve')}</Button>
								<Button size="sm" variant="danger" onclick={() => act(() => admin.rejectClaim(entityId, forms.note || undefined))}>{tr('admin_reject')}</Button>
							</div>
						{:else if String(dTask.taskType) === 'contribution_review' && entityId}
							{#if entityType === 'correction' || entityType === 'retraction'}
								<!-- the filing itself, read as what it claims; a hidden
								     one answers "record not found" — restore it from the
								     filings tab first -->
								<div class="mb-3 rounded-none border bg-muted/30 p-3">
									<FilingDetail kind={entityType as 'correction' | 'retraction' | 'contribution'} id={entityId} get={FILING_GET[entityType]} />
								</div>
								<div class="flex flex-wrap gap-2 text-sm">
									{#if session.isAdmin}
										<Button size="sm" variant="outline" onclick={() => openFilingEditFromTask(entityId, entityType)}>{tr('admin_record_edit')}</Button>
										<Button size="sm" variant="danger" onclick={() => openModerate('record', entityId, 'hide')}>{tr('admin_record_hide')}</Button>
										<Button size="sm" variant="outline" onclick={() => openModerate('record', entityId, 'restore')}>{tr('admin_record_restore')}</Button>
									{/if}
									<a class="self-center text-xs underline text-muted-foreground" href="/{entityType}s/{entityId}">{tr('admin_open_filing')}</a>
								</div>
							{:else if entityType === 'contribution'}
								<div class="flex flex-wrap gap-2 text-sm">
									<Button size="sm" onclick={() => act(() => contributions.decide(entityId, { decision: 'accept' }))}>{tr('admin_approve')}</Button>
									<Button size="sm" variant="outline" onclick={() => act(() => contributions.decide(entityId, { decision: 'request_revision' }))}>{tr('admin_request_revision')}</Button>
									<Button size="sm" variant="danger" onclick={() => act(() => contributions.decide(entityId, { decision: 'reject' }))}>{tr('admin_reject')}</Button>
								</div>
							{:else}
								<!-- legacy contribution_review tasks whose entityType is
								     unknown: the decide endpoint still applies -->
								<div class="flex flex-wrap gap-2 text-sm">
									<Button size="sm" onclick={() => act(() => contributions.decide(entityId, { decision: 'accept' }))}>{tr('admin_approve')}</Button>
									<Button size="sm" variant="outline" onclick={() => act(() => contributions.decide(entityId, { decision: 'request_revision' }))}>{tr('admin_request_revision')}</Button>
									<Button size="sm" variant="danger" onclick={() => act(() => contributions.decide(entityId, { decision: 'reject' }))}>{tr('admin_reject')}</Button>
								</div>
							{/if}
						{/if}

						{#if String(dTask.status) !== 'resolved' && String(dTask.status) !== 'cancelled'}
							<div class="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
								<Input name="ad_resolution" class="h-8 min-w-40 flex-1 text-xs" placeholder={tr('admin_resolution_prompt')} bind:value={forms.resolution} />
								<Button size="sm" variant="outline" onclick={() => act(() => admin.resolveTask(taskId, forms.resolution || undefined))}>{tr('admin_resolve')}</Button>
								<Input name="ad_reason" class="h-8 min-w-40 flex-1 text-xs" placeholder={tr('admin_cancel_reason_prompt')} bind:value={forms.reason} />
								<Button size="sm" variant="ghost" onclick={() => act(() => admin.cancelTask(taskId, forms.reason || undefined))}>{tr('admin_cancel')}</Button>
							</div>
							{#if session.isAdmin}
								<div class="flex flex-wrap items-center gap-2 text-sm">
									<!-- 0032: the desk picks a human, it does not paste a uuid.
									     staff roster is loaded once for the editorial tab. -->
									<Select
										name="ad_assignee_pick"
										class="h-8 min-w-48 flex-1"
										placeholder={tr('admin_reassign_pick')}
										bind:value={forms.assignee}
										options={[{ value: '', label: tr('admin_reassign_pick') }, ...staff.map((s) => ({ value: s.userId, label: `${s.displayName} · ${s.role}` }))]}
									/>
									<Button size="sm" variant="ghost" disabled={!forms.assignee} onclick={() => act(() => admin.reassignTask(taskId, forms.assignee))}>{tr('admin_reassign')}</Button>
								</div>
							{/if}
						{/if}
					</div>
				</Section>
			{/if}
		{:else if tab === 'applications'}
			<div class="flex flex-wrap items-center gap-2">
				<Select
					name="ad_app_status"
					class="h-8 w-40"
					bind:value={appStatus}
					options={APP_STATUSES.map((s) => ({ value: s, label: s === 'all' ? tr('admin_filter_any_status') : s === 'pending' ? tr('admin_status_pending') : enumLabel('as', s) }))}
					onchange={() => { appOpen = ''; loadApplications(); }}
				/>
				<Button size="sm" variant="ghost" onclick={loadApplications}>⟳</Button>
				<InfoTip text={tr('admin_applications_hint')} label={`${tr('admin_tab_applications')} — ${tr('common_more_info')}`} />
			</div>
			{#if applications.length === 0}
				<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}
				<ul class="space-y-2">
					{#each applications as a (a.id)}
						<li class="rounded-none border p-3 text-sm">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium">{a.applicantName || tr('common_unknown')}</span>
								<a class="font-mono text-xs underline" href={`https://orcid.org/${a.orcidId}`} target="_blank" rel="noopener">{a.orcidId}</a>
								<StatusBadge status={a.status} ns="as" />
								<span class="ml-auto text-xs text-muted-foreground">{fmtTime(a.createdAt)}</span>
							</div>
							<p class="mt-1 text-xs text-muted-foreground">
								{a.institutionName}{#if a.department} · {a.department}{/if}{#if a.position} · {a.position}{/if}{#if a.institutionEmail} · <code>{a.institutionEmail}</code>{/if}
							</p>
							{#if a.researchPurpose}
								<p class="mt-1 line-clamp-2 text-xs">{a.researchPurpose}</p>
							{/if}
							<div class="mt-2 flex flex-wrap gap-2">
								{#if a.status === 'awaiting_email'}
									<Button size="xs" variant="outline" onclick={() => { appOpen = appOpen === a.id ? '' : a.id; forms.recipient = a.institutionEmail ?? ''; }}>{tr('admin_email_received')}</Button>
								{/if}
								{#if a.status === 'email_received' || a.status === 'under_review'}
									<Button size="xs" variant="outline" onclick={() => (appOpen = appOpen === a.id ? '' : a.id)}>{tr('admin_review')}</Button>
								{/if}
								{#if !appDecided(a)}
									<a class="text-xs underline text-muted-foreground" href="/users/{a.userId}">{tr('admin_view_user')}</a>
								{/if}
							</div>
							{#if appOpen === a.id}
								<div class="mt-2 space-y-2 rounded-none bg-muted/40 p-2">
									{#if a.status === 'awaiting_email'}
										<div class="flex flex-wrap gap-2 text-xs">
											<Input name="ad_row_sender" class="h-7 min-w-40 flex-1" placeholder={tr('admin_sender_ph')} bind:value={forms.sender} />
											<Input name="ad_row_recipient" class="h-7 min-w-40 flex-1" placeholder={tr('admin_recipient_ph')} bind:value={forms.recipient} />
											<Button size="xs" disabled={!forms.sender.trim() || !forms.recipient.trim()} onclick={() => act(() => admin.markEmailReceived(a.id, { senderEmail: forms.sender.trim(), recipientEmail: forms.recipient.trim() }).then(loadApplications), tr('admin_done'))}>{tr('admin_email_received')}</Button>
										</div>
									{:else}
										<div class="flex flex-wrap gap-2 text-xs">
											<Input name="ad_row_note" class="h-7 min-w-40 flex-1" placeholder={tr('admin_note_prompt')} bind:value={forms.note} />
											<Input name="ad_row_days" type="number" class="h-7 w-16" placeholder={tr('admin_days_ph')} bind:value={forms.days} />
											<Button size="xs" onclick={() => act(() => admin.approveApplication(a.id, forms.days ? Number(forms.days) : undefined, forms.note || undefined).then(loadApplications), tr('admin_done'))}>{tr('admin_approve')}</Button>
											<Button size="xs" variant="danger" onclick={() => act(() => admin.rejectApplication(a.id, forms.note || undefined).then(loadApplications), tr('admin_done'))}>{tr('admin_reject')}</Button>
										</div>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'claims'}
			<div class="flex flex-wrap items-center gap-2">
				<Select
					name="ad_claim_status"
					class="h-8 w-40"
					bind:value={claimStatus}
					options={CLAIM_STATUSES.map((s) => ({ value: s, label: s === 'all' ? tr('admin_filter_any_status') : s === 'pending' ? tr('admin_status_pending') : enumLabel('cs', s) }))}
					onchange={() => loadClaims()}
				/>
				<Button size="sm" variant="ghost" onclick={loadClaims}>⟳</Button>
				<InfoTip text={tr('admin_claims_hint')} label={`${tr('admin_tab_claims')} — ${tr('common_more_info')}`} />
			</div>
			{#if claims.length === 0}
				<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}
				<ul class="space-y-2">
					{#each claims as c (c.id)}
						<li class="rounded-none border p-3 text-sm">
							<div class="flex flex-wrap items-center gap-2">
								<a class="font-medium underline" href="/organizations/{c.organizationId}">{c.organizationName}</a>
								<Badge tone={c.organizationStatus === 'active' ? 'ok' : 'muted'}>{enumLabel('st', c.organizationStatus)}</Badge>
								<span>← {c.applicantName || tr('common_unknown')}</span>
								{#if c.applicantOrcid}<a class="font-mono text-xs underline" href={`https://orcid.org/${c.applicantOrcid}`} target="_blank" rel="noopener">{c.applicantOrcid}</a>{/if}
								<StatusBadge status={c.status} ns="cs" />
								<span class="ml-auto text-xs text-muted-foreground">{fmtTime(c.createdAt)}</span>
							</div>
							<p class="mt-1 text-xs">{c.evidenceSummary}</p>
							{#if c.evidenceEmail}<p class="text-xs text-muted-foreground">{tr('f_email')}: <code>{c.evidenceEmail}</code></p>{/if}
							<div class="mt-2 flex flex-wrap gap-2 text-xs">
								<Input name="ad_claim_row_note" class="h-7 min-w-40 flex-1" placeholder={tr('admin_note_prompt')} bind:value={forms.note} />
								{#if c.status === 'pending' || c.status === 'under_review'}
									<Button size="xs" onclick={() => act(() => admin.approveClaim(c.id, forms.note || undefined).then(loadClaims), tr('admin_done'))}>{tr('admin_approve')}</Button>
									<Button size="xs" variant="danger" onclick={() => act(() => admin.rejectClaim(c.id, forms.note || undefined).then(loadClaims), tr('admin_done'))}>{tr('admin_reject')}</Button>
								{:else if c.reviewNote}
									<Badge tone="muted">{c.reviewNote}</Badge>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'filings'}
			<div class="flex flex-wrap items-center gap-2">
				<Select
					name="ad_filing_type"
					class="h-8 w-40"
					bind:value={filingType}
					options={[{ value: '', label: tr('admin_filter_any_type') }, ...FILING_KINDS.map((k) => ({ value: k, label: enumLabel('et', k) }))]}
					onchange={loadFilings}
				/>
				<Select
					name="ad_filing_hidden"
					class="h-8 w-36"
					bind:value={filingHidden}
					options={[
						{ value: '', label: tr('admin_filing_vis_all') },
						{ value: '0', label: tr('admin_filing_vis_public') },
						{ value: '1', label: tr('admin_filing_vis_hidden') }
					]}
					onchange={loadFilings}
				/>
				<Button size="sm" variant="ghost" onclick={loadFilings} disabled={filingLoading}>⟳</Button>
				<InfoTip text={tr('admin_filings_hint')} label={`${tr('admin_tab_filings')} — ${tr('common_more_info')}`} />
			</div>
			{#if filingRows.length === 0}
				<p class="text-sm text-muted-foreground">{filingLoading ? tr('common_loading') : tr('common_empty')}</p>
			{:else}
				<ul class="space-y-2">
					{#each filingRows as r (r.id)}
						<li class="rounded-none border p-3 text-sm">
							<div class="flex flex-wrap items-center gap-2 text-xs">
								<Badge tone="muted">{enumLabel('et', r.entityType)}</Badge>
								<IdLink id={r.id} />
								<StatusBadge status={r.status} ns="st" />
								{#if r.hidden}<Badge tone="warn">{tr('admin_badge_hidden')}</Badge>{/if}
								<span class="text-muted-foreground">{fmtTime(r.createdAt)}</span>
							</div>
							{#if filingTarget(r)}
								<p class="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
									{tr('col_target')}: <IdLink id={filingTarget(r)} />
								</p>
							{/if}
							<p class="mt-1 line-clamp-2 text-sm">{filingHeadline(r)}</p>
							<div class="mt-2 flex flex-wrap gap-2 text-xs">
								<a class="underline text-muted-foreground" href={`/${r.entityType}s/${r.id}`}>{tr('common_view')}</a>
								{#if FILING_KINDS.includes(r.entityType)}
									{#if r.entityType === 'correction' && !r.hidden && r.status === 'active'}
										<Button size="xs" onclick={() => openDecide(r, 'apply')}>{tr('admin_record_apply')}</Button>
										<Button size="xs" variant="danger" onclick={() => openDecide(r, 'reject')}>{tr('admin_record_reject')}</Button>
									{/if}
									{#if session.isAdmin}
										<Button size="xs" variant="outline" onclick={() => openFilingEdit(r)}>{tr('admin_record_edit')}</Button>
										{#if r.hidden}
											<Button size="xs" variant="outline" onclick={() => openModerate('record', r.id, 'restore')}>{tr('admin_record_restore')}</Button>
										{:else}
											<Button size="xs" variant="danger" onclick={() => openModerate('record', r.id, 'hide')}>{tr('admin_record_hide')}</Button>
										{/if}
									{/if}
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'audit'}
			<div class="flex flex-wrap items-center gap-2">
				<Input name="ad_audit_type" class="h-8 min-w-48 font-mono text-xs" placeholder={tr('admin_audit_type_ph')} bind:value={auditType} />
				<Button size="sm" variant="outline" onclick={loadAudit} disabled={auditLoading}>{tr('nav_search')}</Button>
				<p class="text-xs text-muted-foreground">{tr('admin_audit_hint')}</p>
			</div>
			{#if auditRows.length === 0}
				<p class="text-sm text-muted-foreground">{auditLoading ? tr('common_loading') : tr('common_empty')}</p>
			{:else}
				<ul class="space-y-1.5">
					{#each auditRows as r (r.id)}
						<li class="rounded-none border p-2.5 text-sm">
							<div class="flex flex-wrap items-center gap-2">
								<Badge tone="muted">{r.action}</Badge>
								{#if r.actorName}
									<span>{r.actorName}</span>
								{:else if r.actorUserId}
									<code class="text-xs">{r.actorUserId.slice(0, 10)}</code>
								{:else}
									<span class="text-xs text-muted-foreground">{tr('admin_system')}</span>
								{/if}
								<span class="text-xs text-muted-foreground">
									{r.resourceType ?? '—'}{#if r.resourceId} {r.resourceId.startsWith('spd:') ? '' : '·'}{#if r.resourceId.startsWith('spd:')}<IdLink id={r.resourceId} />{:else}<code class="text-[10px]">{r.resourceId.slice(0, 24)}</code>{/if}{/if}
								</span>
								<span class="ml-auto text-xs text-muted-foreground">{fmtTime(r.createdAt)}</span>
							</div>
							{#if r.metadata && (typeof r.metadata !== 'object' || Object.keys(r.metadata as object).length > 0)}
								<div class="mt-1 text-xs"><DataView value={r.metadata} depth={1} /></div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'roles'}
			<Section title={tr('admin_user_roles')}>
				<div class="flex gap-2">
					<Input name="ad_role_user" class="h-8 flex-1 font-mono text-sm" placeholder={tr('admin_user_id_placeholder')} bind:value={roleUserId} />
					<Button size="sm" variant="outline" onclick={loadUser}>{tr('common_view')}</Button>
				</div>
				{#if roleError}<p class="mt-2 rounded-none bg-destructive/10 p-2 text-xs text-destructive">{roleError}</p>{/if}
				{#if roleView}
					{@const u = (roleView.user ?? roleView) as Record<string, unknown>}
					{@const roles = Array.isArray(roleView.roles) ? (roleView.roles as Record<string, unknown>[]) : []}
					<div class="mt-3 space-y-2 text-sm">
						<p>{String(u.displayName ?? '')} · <code class="font-mono text-xs">{String(u.orcidId ?? '')}</code> · <StatusBadge status={String(u.status ?? '')} ns="st" /></p>
						<div class="flex flex-wrap gap-1">
							{#each roles as r (String(r.role))}
								<Badge tone={r.revokedAt ? 'muted' : 'ok'}>
									{String(r.role)}{r.expiresAt ? ` · ${fmtTime(Number(r.expiresAt))}` : ''}
								</Badge>
							{/each}
						</div>
						<div class="flex flex-wrap gap-2 text-xs">
							<Select name="ad_role" class="h-8 w-32" bind:value={roleGrant.role} options={['user', 'researcher', 'curator', 'admin'].map((r) => ({ value: r, label: r }))} />
							<Input name="ad_role_days" type="number" class="h-8 w-20" placeholder="days" bind:value={roleGrant.expiresInDays} />
							<Input name="ad_role_reason" class="h-8 flex-1" placeholder={tr('field_reason')} bind:value={roleGrant.reason} />
							<Button size="sm" onclick={() => act(() => admin.grantRole(roleUserId.trim(), { role: roleGrant.role, expiresInDays: roleGrant.expiresInDays ? Number(roleGrant.expiresInDays) : undefined, reason: roleGrant.reason || undefined }))}>{tr('admin_grant')}</Button>
							<Button size="sm" variant="danger" onclick={() => act(() => admin.revokeRole(roleUserId.trim(), roleGrant.role))}>{tr('admin_revoke')}</Button>
						</div>
					</div>
				{/if}
			</Section>
		{:else if tab === 'dispatch'}
			<div class="flex flex-wrap items-center gap-2">
				<Select
					name="ad_dispatch_status"
					class="h-8 w-36"
					placeholder={tr('dispatch_all')}
					bind:value={dispatchStatus}
					options={[{ value: '', label: tr('dispatch_all') }, { value: 'open', label: tr('pds_open') }, { value: 'fulfilled', label: tr('pds_fulfilled') }, { value: 'expired', label: tr('pds_expired') }, { value: 'declined', label: tr('pds_declined') }, { value: 'cancelled', label: tr('pds_cancelled') }]}
					onchange={loadDispatches}
				/>
				<span class="text-xs text-muted-foreground">{tr('dispatch_shortfall_note', { n: dispatchTarget })}</span>
			</div>
			<Section title={tr('admin_tab_dispatch')} hint={tr('dispatch_round_hint')}>
				{#if dispatchItems.length === 0}
					<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
				{:else}
					<ul class="divide-y text-sm">
						{#each dispatchItems as d (d.id)}
							{@const due = dispatchDue(d)}
							<li class="flex flex-wrap items-center gap-2 py-1.5 text-xs">
								<Badge tone={dispatchStatusTone[d.status] ?? 'muted'}>{enumLabel('pds', d.status)}</Badge>
								<Badge tone="muted">{tr('ed_round_n', { n: d.round })}</Badge>
								<span class="font-medium">{d.entityType === 'protocol' ? tr('et_protocol') : tr('et_wet_lab_validation')}{d.revisionNumber != null ? ` · r${d.revisionNumber}` : ''}</span>
								<code class="font-mono text-muted-foreground">{d.entityId.slice(0, 24)}…</code>
								<span class="text-muted-foreground">{tr('dispatch_col_reviewer')} <code class="font-mono">{d.reviewerUserId.slice(0, 19)}</code></span>
								<a class="underline text-muted-foreground" href={`/organizations/${d.organizationId}`}>{d.organizationId.slice(0, 20)}</a>
								{#if due && d.status === 'open'}
									<span class={due.late ? 'font-medium text-destructive' : 'text-muted-foreground'}>{due.label}</span>
								{/if}
								{#if d.declineReason}<span class="text-muted-foreground">· {d.declineReason}</span>{/if}
								<span class="text-muted-foreground">{fmtTime(d.createdAt)}</span>
								{#if d.status === 'open'}
									<Button size="xs" variant="ghost" onclick={() => doCancelDispatch(d.id)}>{tr('dispatch_cancel')}</Button>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</Section>
			<div class="grid gap-4 lg:grid-cols-2">
				<Section title={tr('dispatch_manual_title')} hint={tr('dispatch_due_hint')}>
					<div class="space-y-2 text-sm">
						<Select name="md_entity_type" bind:value={mdEntityType} options={[{ value: 'wet_lab_validation', label: tr('et_wet_lab_validation') }, { value: 'protocol', label: tr('et_protocol') }]} />
						<Input name="md_entity_id" class="h-8 w-full font-mono text-xs" placeholder={tr('dispatch_f_entityId')} bind:value={mdEntityId} />
						<Input name="md_orcid" class="h-8 w-full font-mono text-xs" placeholder={tr('dispatch_f_reviewerOrcid')} bind:value={mdOrcid} />
						<label class="flex items-center gap-2 text-xs text-muted-foreground">
							{tr('dispatch_due_days')}
							<Input name="md_due_days" type="number" min={1} max={90} class="h-8 w-24 text-xs" bind:value={mdDueDays} />
						</label>
						<Button size="sm" onclick={doManualDispatch} disabled={!mdEntityId.trim() || !mdOrcid.trim()}>{tr('dispatch_submit')}</Button>
					</div>
				</Section>
				<Section title={tr('dispatch_quota_title')} hint={tr('dispatch_quota_hint')}>
					<div class="space-y-2 text-sm">
						<Input name="q_org" class="h-8 w-full font-mono text-xs" placeholder={tr('dispatch_quota_org')} bind:value={qOrg} />
						<div class="flex gap-2">
							<Input name="q_year" type="number" class="h-8 w-24 text-xs" placeholder={tr('dispatch_quota_year')} bind:value={qYear} />
							<Input name="q_value" type="number" class="h-8 w-24 text-xs" placeholder={tr('dispatch_quota_value')} bind:value={qValue} />
							<Button size="sm" onclick={doSetQuota} disabled={!qOrg.trim() || !qValue}>{tr('dispatch_quota_set')}</Button>
							<Button size="sm" variant="outline" onclick={doDeleteQuota} disabled={!qOrg.trim()}>{tr('dispatch_quota_delete')}</Button>
						</div>
					</div>
				</Section>
			</div>
		{:else if tab === 'reviewers'}
			<!-- 0032 reviewer performance roster (OJS "Add Reviewer" past
			     assignments): completions, turnaround, punctuality. -->
			<Section title={tr('admin_tab_reviewers')} hint={tr('admin_roster_hint')}>
				{#if roster.length === 0}
					<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
				{:else}
					<table class="w-full text-sm">
						<thead>
							<tr class="text-left text-xs text-muted-foreground">
								<th class="py-1 pr-3 font-medium">{tr('dispatch_col_reviewer')}</th>
								<th class="py-1 pr-3 font-medium">{tr('admin_rost_reviews')}</th>
								<th class="py-1 pr-3 font-medium">{tr('admin_rost_fulfilled')}</th>
								<th class="py-1 pr-3 font-medium">{tr('admin_rost_open')}</th>
								<th class="py-1 pr-3 font-medium">{tr('admin_rost_declined')}</th>
								<th class="py-1 pr-3 font-medium">{tr('admin_rost_median')}</th>
								<th class="py-1 font-medium">{tr('admin_rost_ontime')}</th>
							</tr>
						</thead>
						<tbody>
							{#each roster as rv (rv.reviewerId)}
								<tr class="border-t">
									<td class="py-1.5 pr-3"><IdLink id={rv.reviewerId} /></td>
									<td class="py-1.5 pr-3 tabular-nums">{rv.publishedReviews}</td>
									<td class="py-1.5 pr-3 tabular-nums">{rv.fulfilledDispatches}</td>
									<td class="py-1.5 pr-3 tabular-nums">{rv.openDispatches}</td>
									<td class="py-1.5 pr-3 tabular-nums">{rv.declinedDispatches}</td>
									<td class="py-1.5 pr-3 tabular-nums">{rv.medianReviewDays == null ? '—' : `${rv.medianReviewDays}d`}</td>
									<td class="py-1.5 tabular-nums">{rv.onTimeRatePercent == null ? '—' : `${rv.onTimeRatePercent}%`}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</Section>
		{:else if tab === 'tokens'}
			<Section title={tr('admin_tokens_tab')} hint={tr('admin_token_tier_intro')}>
				<div class="flex flex-wrap items-end gap-2 text-sm">
					<label class="block">
						<span class="text-xs text-muted-foreground">{tr('admin_token_id')}</span>
						<Input name="tk_id" class="mt-1 h-8 w-64 font-mono text-xs" placeholder="tok_…" bind:value={tokenGrant.tokenId} />
					</label>
					<label class="block">
						<span class="text-xs text-muted-foreground">{tr('f_tier')}</span>
						<Select name="tk_tier" class="mt-1 h-8 w-36" bind:value={tokenGrant.tier} options={['standard', 'unlimited'].map((t) => ({ value: t, label: enumLabel('tk', t) }))} />
					</label>
					<label class="block flex-1">
						<span class="text-xs text-muted-foreground">{tr('field_reason')}</span>
						<Input name="tk_reason" class="mt-1 h-8 w-full" placeholder={tr('token_tier_reason_ph')} bind:value={tokenGrant.reason} />
					</label>
					<Button
						size="sm"
						disabled={!tokenGrant.tokenId.trim()}
						onclick={() =>
							act(
								() => apiTokens.setTier(tokenGrant.tokenId.trim(), { tier: tokenGrant.tier as never, reason: tokenGrant.reason || undefined }),
								tr('admin_token_tier_set')
							)}
					>{tr('admin_grant')}</Button>
				</div>
			</Section>
		{/if}
	</div>
{/if}

<Dialog
	open={moder !== null}
	onclose={() => (moder = null)}
	title={moder?.mode === 'restore' ? tr('admin_record_restore') : tr('admin_record_hide')}
	hint={moder?.mode === 'restore' ? tr('admin_restore_hint') : tr('admin_hide_hint')}
>
	<div class="space-y-3">
		<label class="block">
			<span class="text-xs text-muted-foreground">{tr('field_reason')} <span class="text-destructive">*</span></span>
			<Input name="ad_mod_reason" class="mt-1 h-8 w-full" bind:value={moderReason} />
		</label>
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (moder = null)}>{tr('common_cancel')}</Button>
			<Button
				variant={moder?.mode === 'restore' ? 'primary' : 'danger'}
				disabled={!moderReason.trim()}
				onclick={doModerate}>{moder?.mode === 'restore' ? tr('admin_record_restore') : tr('admin_record_hide')}</Button>
		</div>
	</div>
</Dialog>

<Dialog
	open={decide !== null}
	onclose={() => (decide = null)}
	title={decide?.mode === 'apply' ? tr('admin_record_apply') : tr('admin_record_reject')}
	hint={decide?.mode === 'apply' ? tr('admin_apply_hint') : tr('admin_reject_hint')}
	width="max-w-xl"
>
	{#if decide}
		<div class="space-y-3">
			{#if decide.mode === 'apply' && !decideApplyable}
				<p class="rounded-none border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
					{tr('admin_apply_not_correctable')}
				</p>
			{:else if decide.mode === 'apply'}
				<label class="block">
					<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
						{tr('filing_items_title')} <span class="text-destructive">*</span>
						<InfoTip
							text={tr('admin_items_override_hint')}
							label={`${tr('filing_items_title')} — ${tr('common_more_info')}`}
						/>
					</span>
					<CorrectionItems name="ad_decide_items" bind:value={decideItemsText} fieldOptions={decideFields} />
				</label>
			{:else if decide.items.length}
				<div class="overflow-x-auto rounded-none border">
					<table class="w-full text-left text-xs">
						<thead>
							<tr class="border-b text-muted-foreground">
								<th class="py-1.5 pr-3 font-medium">{tr('ci_field')}</th>
								<th class="py-1.5 pr-3 font-medium">{tr('ci_current')}</th>
								<th class="py-1.5 font-medium">{tr('ci_proposed')}</th>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each decide.items as it, i (i)}
								<tr>
									<td class="py-1.5 pr-3"><code class="font-mono">{String(it.field)}</code></td>
									<td class="py-1.5 pr-3 break-all text-muted-foreground">
										{'current' in it && it.current !== undefined ? cellText(it.current) : '—'}
									</td>
									<td class="py-1.5 break-all font-medium">
										{it.proposed !== undefined ? cellText(it.proposed) : '—'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="rounded-none border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
					{tr('admin_decide_no_items')}
				</p>
			{/if}
			<label class="block">
				<span class="text-xs text-muted-foreground">{tr('field_reason')} <span class="text-destructive">*</span></span>
				<Input name="ad_decide_reason" class="mt-1 h-8 w-full" bind:value={decideReason} />
			</label>
			<div class="flex justify-end gap-2">
				<Button variant="ghost" onclick={() => (decide = null)}>{tr('common_cancel')}</Button>
				<Button
					variant={decide.mode === 'apply' ? 'primary' : 'danger'}
					disabled={!decideReason.trim() || !decideItemsReady || !decideApplyable}
					onclick={doDecide}>{decide.mode === 'apply' ? tr('admin_record_apply') : tr('admin_record_reject')}</Button>
			</div>
		</div>
	{/if}
</Dialog>

<Dialog open={!!filingEdit} onclose={() => (filingEdit = null)} title={tr('admin_filing_edit_title')} width="max-w-xl">
	{#if filingEdit}
		<div class="space-y-3">
			<p class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<Badge tone="muted">{enumLabel('et', filingEdit.entityType)}</Badge>
				<code class="font-mono break-all">{filingEdit.id}</code>
			</p>
			{#if !editRaw}
				{#if filingEdit.entityType === 'correction' || filingEdit.entityType === 'retraction'}
					<label class="block">
						<span class="text-xs text-muted-foreground">{tr('filing_reason')} <span class="text-destructive">*</span></span>
						<Textarea name="ad_edit_reason_text" rows={3} bind:value={editFieldReason} />
					</label>
				{/if}
				{#if filingEdit.entityType === 'correction'}
					<label class="block">
						<span class="text-xs text-muted-foreground">{tr('filing_items_title')} <span class="text-destructive">*</span></span>
						<CorrectionItems name="ad_edit_items" bind:value={editItems} fieldOptions={editFields} />
					</label>
				{:else if filingEdit.entityType === 'contribution'}
					<label class="block">
						<span class="text-xs text-muted-foreground">{tr('filing_summary')} <span class="text-destructive">*</span></span>
						<Textarea name="ad_edit_summary" rows={4} bind:value={editSummary} />
					</label>
				{/if}
			{:else}
				<label class="block">
					<span class="text-xs text-muted-foreground">{tr('admin_edit_raw_payload')}</span>
					<Textarea name="ad_edit_raw" monospace rows={10} bind:value={editRawText} />
				</label>
			{/if}
			<div>
				<Button variant="link" size="xs" class="h-auto px-0 text-muted-foreground" onclick={() => (editRaw = !editRaw)}>
					{editRaw ? tr('form_use_rows') : tr('form_use_raw_json')}
				</Button>
			</div>
			<label class="block">
				<span class="text-xs text-muted-foreground">{tr('admin_audit_reason')} <span class="text-destructive">*</span></span>
				<Input name="ad_edit_audit_reason" class="mt-1 h-8 w-full" placeholder={tr('admin_audit_reason_ph')} bind:value={editReason} />
				<span class="mt-1 block text-xs text-muted-foreground">{tr('admin_audit_reason_hint')}</span>
			</label>
			<div class="flex justify-end gap-2">
				<Button variant="ghost" onclick={() => (filingEdit = null)}>{tr('common_cancel')}</Button>
				<Button onclick={doFilingEdit} disabled={!editReady}>{tr('common_save')}</Button>
			</div>
		</div>
	{/if}
</Dialog>

<svelte:head><title>{tr('nav_admin')} · SPD</title></svelte:head>
