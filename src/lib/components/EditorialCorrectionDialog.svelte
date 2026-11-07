<script lang="ts">
	import { admin } from '$lib/api/client';
	import { tr } from '$lib/i18n';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import Textarea from './Textarea.svelte';
	import CorrectionItems from './CorrectionItems.svelte';
	import { fetchTargetFields, type TargetFields } from '$lib/submit/field-options';

	/**
	 * The editorial office's own correction door.
	 *
	 * A contributor's correction is a claim the desk accepts or declines; this
	 * is the desk making the same claim directly, so the ledger row and the
	 * field assertions land in one audited call. The target record still goes
	 * through the create path's validators — this dialog only removes the
	 * round-trip, not the gates.
	 */
	let {
		entityType,
		entityId,
		open = $bindable(false)
	}: {
		entityType: string;
		entityId: string;
		open?: boolean;
	} = $props();

	let reason = $state('');
	let items = $state('');
	let fields = $state<TargetFields>({ keys: [], scalars: {} });
	let fetched = false;
	let busy = $state(false);

	$effect(() => {
		if (!open || fetched) return;
		fetched = true;
		fields = { keys: [], scalars: {}, loading: true };
		void fetchTargetFields(entityType, entityId).then((r) => (fields = r));
	});

	// A cancelled draft must not silently become the next call's proposal.
	$effect(() => {
		if (!open) {
			reason = '';
			items = '';
		}
	});

	const itemsReady = $derived.by(() => {
		if (!items.trim()) return false;
		try {
			const a = JSON.parse(items) as unknown;
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

	function reset() {
		reason = '';
		items = '';
	}

	async function submit() {
		if (!reason.trim() || !itemsReady) return;
		busy = true;
		try {
			const rows = (JSON.parse(items) as Array<Record<string, unknown>>).filter(
				(r) => String(r?.field ?? '').trim()
			);
			const rec = await admin.officialCorrection({
				targetId: entityId,
				entityType,
				reason: reason.trim(),
				items: rows
			});
			const changed = Array.isArray(rec.changed) ? rec.changed.length : 0;
			toastOk(tr('admin_official_done', { n: changed }));
			open = false;
			reset();
			// Detail pages fetch their record in component state, not in a
			// SvelteKit load function, so invalidateAll() would leave the page
			// showing the pre-correction values. Reload to prove the write.
			window.location.reload();
		} catch (e) {
			toastErr(e);
		} finally {
			busy = false;
		}
	}
</script>

<Dialog bind:open title={tr('admin_official_correction')} hint={tr('admin_official_hint')} width="max-w-xl">
	<div class="space-y-3">
		<label class="block">
			<span class="text-xs text-muted-foreground">{tr('issue_reason')} <span class="text-destructive">*</span></span>
			<Textarea name="ed_corr_reason" rows={4} bind:value={reason} />
		</label>
		<label class="block">
			<span class="text-xs text-muted-foreground">{tr('issue_proposed')} <span class="text-destructive">*</span></span>
			<CorrectionItems name="ed_corr_items" bind:value={items} fieldOptions={fields} />
		</label>
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (open = false)}>{tr('common_cancel')}</Button>
			<Button onclick={submit} disabled={busy || !reason.trim() || !itemsReady}>{tr('admin_official_submit')}</Button>
		</div>
	</div>
</Dialog>
