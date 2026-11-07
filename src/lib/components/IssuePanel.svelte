<script lang="ts">
	import { tick } from 'svelte';
	import { entities } from '$lib/api/client';
	import { session } from '$lib/state/session.svelte';
	import { mine } from '$lib/state/mine.svelte';
	import { tr } from '$lib/i18n';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Button from './Button.svelte';
	import Badge from './Badge.svelte';
	import Dialog from './Dialog.svelte';
	import Input from './Input.svelte';
	import Textarea from './Textarea.svelte';
	import CorrectionItems from './CorrectionItems.svelte';
	import EditorialCorrectionDialog from './EditorialCorrectionDialog.svelte';
	import { fetchTargetFields, type TargetFields } from '$lib/submit/field-options';
	import { isCorrectable } from '$lib/submit/correctable';

	/**
	 * The contributor's way to change a record that is already in SPD.
	 *
	 * Records are append-only, so "edit" is never a mutation: it is a new
	 * statement that goes through the editorial queue. That is why this sits in
	 * the page header as buttons instead of a collapsed disclosure at the bottom
	 * — someone looking for "how do I fix this?" should not have to discover a
	 * triangle labelled "flag an issue".
	 *
	 * The doors, in the order a contributor actually reaches for them:
	 *   revise   — the submitter re-declares their own record (only pages that
	 *              own a revision endpoint pass `onrevise`)
	 *   correct  — anyone may propose field-level changes with a reason
	 *   annotate — the collaborative wiki entry for this record
	 *   retract  — ask that the record be withdrawn, with evidence
	 */
	let {
		entityType,
		entityId,
		onrevise = undefined,
		reviseLabel = undefined,
		hasWiki = true,
		size = 'xs',
		onannotate = undefined
	}: {
		entityType: string;
		entityId: string;
		onrevise?: () => void;
		reviseLabel?: string;
		hasWiki?: boolean;
		/** header rows elsewhere on the page set their own button size */
		size?: 'xs' | 'sm';
		/** Pages that keep WikiPanel inside a tab pass a callback that
		 *  selects that tab. Without it the event fires while the panel is
		 *  unmounted and nothing appears to happen. */
		onannotate?: () => void;
	} = $props();

	let showCorr = $state(false);
	let showOfficial = $state(false);
	let showRetract = $state(false);
	let corrReason = $state('');
	let corrItems = $state(''); // CorrectionItems keeps a JSON string of rows
	let corrEvidence = $state('');
	let retractReason = $state('');
	let evidenceUrl = $state('');
	let confirmWord = $state('');
	let busy = $state<'c' | 'r' | null>(null);
	let filed = $state<{ kind: 'correction' | 'retraction'; id: string } | null>(null);

	// The door stands on a known record, so the correction editor can offer
	// THIS record's fields with their current values pre-billed.
	let corrFields = $state<TargetFields>({ keys: [], scalars: {} });
	let corrFieldsFetched = false;
	function openCorrect() {
		showCorr = true;
		if (!corrFieldsFetched) {
			corrFieldsFetched = true;
			corrFields = { keys: [], scalars: {}, loading: true };
			void fetchTargetFields(entityType, entityId).then((r) => (corrFields = r));
		}
	}

	// Same rule the server enforces: a correction must assert at least one
	// field change, so the send button waits for a complete row.
	const itemsReady = $derived.by(() => {
		if (!corrItems.trim()) return false;
		try {
			const arr = JSON.parse(corrItems) as unknown;
			return (
				Array.isArray(arr) &&
				arr.length > 0 &&
				arr.every(
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

	// Ownership is a decorative badge, but the shared activity feed behind it
	// is one of the heaviest reads in the API. Let the page's own data win
	// the first seconds; the badge fills in when the browser goes idle.
	$effect(() => {
		if (!session.signedIn) return;
		let idle = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;
		if (typeof requestIdleCallback === 'function') {
			idle = requestIdleCallback(() => mine.ensure(), { timeout: 2500 });
		} else {
			timer = setTimeout(() => mine.ensure(), 1200);
		}
		return () => {
			if (idle) cancelIdleCallback(idle);
			if (timer) clearTimeout(timer);
		};
	});
	const isMine = $derived(mine.is(entityId));

	async function submit(kind: 'c' | 'r') {
		busy = kind;
		try {
			if (kind === 'c') {
				const body: Record<string, unknown> = { reason: corrReason.trim(), entityType };
				body.items = (JSON.parse(corrItems) as Array<Record<string, unknown>>).filter(
					(r) => String(r?.field ?? '').trim()
				);
				if (corrEvidence.trim()) body.evidenceUrl = corrEvidence.trim();
				const r = await entities.correct(entityId, body);
				filed = { kind: 'correction', id: String(r.id ?? '') };
				toastOk(tr('issue_correction_sent'));
				showCorr = false;
				corrReason = '';
				corrItems = '';
				corrEvidence = '';
			} else {
				const body: Record<string, unknown> = { reason: retractReason.trim(), entityType };
				if (evidenceUrl.trim()) body.evidenceUrl = evidenceUrl.trim();
				const r = await entities.retract(entityId, body);
				filed = { kind: 'retraction', id: String(r.id ?? '') };
				toastOk(tr('issue_retraction_sent'));
				showRetract = false;
				retractReason = '';
				evidenceUrl = '';
				confirmWord = '';
			}
			mine.refreshNow();
		} catch (e) {
			toastErr(e);
		} finally {
			busy = null;
		}
	}

	async function openWiki() {
		// WikiPanel listens and opens its editor for the matching record. On
		// pages that mount the panel only inside a tab, the callback selects
		// it first; tick() waits for that mount before the event is fired.
		onannotate?.();
		await tick();
		window.dispatchEvent(new CustomEvent('spd:annotate', { detail: { entityId } }));
	}
</script>

<div data-print-hide class="flex flex-wrap items-center gap-1.5">
	{#if session.signedIn && session.canWrite}
		{#if isMine}<Badge tone="ok">{tr('issue_mine')}</Badge>{/if}
		{#if onrevise}
			<Button size={size} onclick={onrevise}>{reviseLabel ?? tr('issue_revise')}</Button>
		{/if}
		{#if isCorrectable(entityType)}
			<Button size={size} variant="outline" onclick={openCorrect}>{tr('issue_cta_correction')}</Button>
			{#if session.isCurator}
				<Button size={size} variant="secondary" onclick={() => (showOfficial = true)}>{tr('admin_official_correction')}</Button>
			{/if}
		{/if}
		{#if hasWiki}<Button size={size} variant="ghost" onclick={openWiki}>{tr('issue_cta_annotate')}</Button>{/if}
		<Button size={size} variant="ghost" onclick={() => (showRetract = true)}>{tr('issue_cta_retraction')}</Button>
	{:else if session.signedIn}
		<p class="text-xs text-muted-foreground">{tr('issue_write_researcher_only')}</p>
	{:else}
		<Button size={size} variant="ghost" onclick={() => session.signIn()}>{tr('issue_signin_cta')}</Button>
	{/if}
</div>

{#if filed}
	<p class="mt-2 rounded-none bg-emerald-50 dark:bg-emerald-500/10 p-2 text-xs text-emerald-900 dark:text-emerald-200">
		{filed.kind === 'correction' ? tr('issue_correction_sent') : tr('issue_retraction_sent')} ·
		<a class="font-mono underline" href="/{filed.kind === 'correction' ? 'corrections' : 'retractions'}/{filed.id}">{filed.id}</a>
		<span class="ml-1">{tr('issue_queued_note')}</span>
	</p>
{/if}

<Dialog bind:open={showCorr} title={tr('issue_cta_correction')} width="max-w-xl">
	<p class="mb-3 text-xs text-muted-foreground">{tr('issue_correction_hint')}</p>
	<div class="space-y-3">
		<label class="block">
			<span class="text-xs text-muted-foreground">{tr('issue_reason')} <span class="text-destructive">*</span></span>
			<Textarea name="issue_reason" rows={4} bind:value={corrReason} />
		</label>
		<label class="block">
			<span class="text-xs text-muted-foreground">{tr('issue_proposed')} <span class="text-destructive">*</span></span>
			<CorrectionItems name="issue_items" bind:value={corrItems} fieldOptions={corrFields} />
		</label>
		<label class="block">
			<span class="text-xs text-muted-foreground">{tr('issue_evidence_url')}</span>
			<Input name="issue_corr_evidence" type="url" class="h-8 w-full" placeholder="https://…" bind:value={corrEvidence} />
		</label>
		<p class="text-xs text-muted-foreground">{tr('issue_append_only_note')}</p>
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showCorr = false)}>{tr('common_cancel')}</Button>
			<Button onclick={() => submit('c')} disabled={busy !== null || !corrReason.trim() || !itemsReady}>{tr('issue_send')}</Button>
		</div>
	</div>
</Dialog>

{#if isCorrectable(entityType) && session.isCurator}
	<EditorialCorrectionDialog {entityType} {entityId} bind:open={showOfficial} />
{/if}

<Dialog
	bind:open={showRetract}
	title={tr('issue_cta_retraction')}
	hint={tr('issue_retraction_hint')}
	width="max-w-lg"
>
	<div class="space-y-3">
		<label class="block">
			<span class="text-xs text-muted-foreground">{tr('issue_reason')} <span class="text-destructive">*</span></span>
			<Textarea name="issue_retract_reason" rows={4} bind:value={retractReason} />
		</label>
		<label class="block">
			<span class="text-xs text-muted-foreground">{tr('issue_evidence_url')}</span>
			<Input name="issue_evidence_url" type="url" class="h-8 w-full" placeholder="https://…" bind:value={evidenceUrl} />
		</label>
		<label class="block">
			<span class="text-xs text-muted-foreground">{tr('issue_confirm_label')}</span>
			<Input name="issue_confirm" class="h-8 w-full" placeholder="retract" bind:value={confirmWord} />
		</label>
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showRetract = false)}>{tr('common_cancel')}</Button>
			<Button
				variant="danger"
				onclick={() => submit('r')}
				disabled={busy !== null || !retractReason.trim() || confirmWord.trim().toLowerCase() !== 'retract'}>{tr('issue_send')}</Button>
		</div>
	</div>
</Dialog>
