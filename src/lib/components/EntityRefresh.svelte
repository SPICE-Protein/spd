<script lang="ts">
	// Source freshness + field-level refresh for an imported catalog record.
	// Genes have their own component/route (§59); this door covers the other
	// catalogs the importer seeds. Reading freshness is cosmetic: a failure
	// leaves the detail page exactly as it was.
	import { invalidateAll } from '$app/navigation';
	import { entityRefresh } from '$lib/api/client';
	import type { EntityRefreshData, EntityRefreshProposal } from '$lib/api/types';
	import { tr, fieldLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { session } from '$lib/state/session.svelte';
	import { toastOk, toastInfo, toastErr } from '$lib/state/toast.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Checkbox from '$lib/components/Checkbox.svelte';
	import Dialog from '$lib/components/Dialog.svelte';

	let { entityType, entityId }: { entityType: string; entityId: string } = $props();

	let status = $state<EntityRefreshData | null>(null);
	let statusError = $state('');
	let checking = $state(false);
	let dialogOpen = $state(false);
	let proposal = $state<EntityRefreshProposal | null>(null);
	let selected = $state<Record<string, boolean>>({});
	let applying = $state(false);

	const source = $derived(status?.source ?? null);
	const pendingProposal = $derived(
		status?.proposal && status.proposal.status === 'pending' ? status.proposal : null
	);
	const ageDays = $derived.by(() => {
		if (source?.ageDays != null) return source.ageDays;
		if (source?.fetchedAt == null) return null;
		return Math.max(0, Math.floor((Date.now() / 1000 - source.fetchedAt) / 86400));
	});

	let loadedKey = '';
	$effect(() => {
		if (!entityType || !entityId) return;
		const key = `${entityType}:${entityId}`;
		if (loadedKey === key) return;
		loadedKey = key;
		status = null;
		statusError = '';
		proposal = null;
		dialogOpen = false;
		void loadStatus();
	});

	async function loadStatus() {
		try {
			status = await entityRefresh.status(entityType, entityId);
			statusError = '';
		} catch (e) {
			statusError = e instanceof Error ? e.message : String(e);
		}
	}

	function openProposal(p: EntityRefreshProposal) {
		proposal = p;
		selected = Object.fromEntries(
			p.fields.map((f) => [f.field, !f.protected && !f.conflict])
		);
		dialogOpen = true;
	}

	function openPending() {
		if (pendingProposal) openProposal(pendingProposal);
	}

	async function check() {
		checking = true;
		try {
			const data = await entityRefresh.check(entityType, entityId);
			status = data;
			statusError = '';
			const p = data.proposal;
			if (!p || p.status !== 'pending' || p.fields.length === 0) {
				proposal = null;
				dialogOpen = false;
				toastInfo(tr('gene_refresh_current'));
				return;
			}
			openProposal(p);
		} catch (e) {
			toastErr(e);
		} finally {
			checking = false;
		}
	}

	function setSelected(field: string, v: boolean) {
		selected = { ...selected, [field]: v };
	}

	async function apply() {
		if (!proposal) return;
		const fields = proposal.fields
			.filter((f) => !f.protected && selected[f.field])
			.map((f) => f.field);
		if (fields.length === 0) {
			toastInfo(tr('gene_refresh_none_selected'));
			return;
		}
		applying = true;
		try {
			await entityRefresh.apply(entityType, entityId, proposal.id, fields);
			toastOk(tr('gene_refresh_applied', { count: fields.length }));
			proposal = null;
			dialogOpen = false;
			await loadStatus();
			await invalidateAll();
		} catch (e) {
			toastErr(e);
		} finally {
			applying = false;
		}
	}

	async function dismiss() {
		if (!proposal) return;
		applying = true;
		try {
			await entityRefresh.dismiss(entityType, entityId, proposal.id);
			proposal = null;
			dialogOpen = false;
			toastInfo(tr('gene_refresh_dismissed'));
			await loadStatus();
		} catch (e) {
			toastErr(e);
		} finally {
			applying = false;
		}
	}

	/** Scalars as-is, lists joined, objects as JSON — the proposal table
	 *  should read as values, not as `{"a":1}` noise. */
	function formatValue(v: unknown): string {
		if (v == null || v === '') return '—';
		if (Array.isArray(v)) {
			if (v.length === 0) return '—';
			return v
				.map((item) =>
					item != null && typeof item === 'object' ? JSON.stringify(item) : String(item)
				)
				.join(', ');
		}
		if (typeof v === 'object') return JSON.stringify(v);
		return String(v);
	}
</script>

{#if source?.externalId}
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
		<span>
			{tr('gene_source_accession')}
			{#if source.url}
				<a
					class="font-mono text-foreground underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
					href={source.url}
					target="_blank"
					rel="noopener noreferrer">{source.externalId}</a
				>
			{:else}
				<span class="font-mono text-foreground">{source.externalId}</span>
			{/if}
		</span>
		{#if source.fetchedAt != null}
			<span>{tr('gene_source_fetched')} {fmtTime(source.fetchedAt)}</span>
		{/if}
		{#if source.sourceUpdatedAt != null}
			<span>{tr('gene_source_updated')} {fmtTime(source.sourceUpdatedAt)}</span>
		{/if}
		{#if ageDays != null}
			<span>{tr('gene_source_age')} {tr('gene_source_age_days', { days: ageDays })}</span>
		{/if}
		{#if source.stale}
			<Badge tone="warn">{tr('gene_source_stale')}</Badge>
		{:else}
			<Badge tone="ok">{tr('gene_source_current')}</Badge>
		{/if}
		{#if session.canWrite}
			{#if pendingProposal}
				<Button size="xs" variant="outline" onclick={openPending}>
					{tr('gene_refresh_review', { count: pendingProposal.fields.length })}
				</Button>
			{/if}
			<Button size="xs" variant="outline" onclick={check} disabled={checking}>
				{checking ? tr('gene_source_checking') : tr('gene_source_check')}
			</Button>
		{/if}
	</div>

	<Dialog bind:open={dialogOpen} title={tr('gene_refresh_title')} width="max-w-3xl">
		{#if proposal}
			<div class="space-y-3">
				<p class="text-xs text-muted-foreground">
					{tr('gene_refresh_hint')}
					<span class="ml-2">{tr('gene_source_fetched')} {fmtTime(proposal.fetchedAt)}</span>
				</p>
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b text-left text-xs text-muted-foreground">
								<th class="py-1.5 pr-3 font-medium">{tr('gene_field_name')}</th>
								<th class="py-1.5 pr-3 font-medium">{tr('gene_field_old')}</th>
								<th class="py-1.5 pr-3 font-medium">{tr('gene_field_new')}</th>
							</tr>
						</thead>
						<tbody>
							{#each proposal.fields as f (f.field)}
								<tr class="border-b/60 border-b align-top last:border-0">
									<td class="py-2 pr-3">
										<label class="flex items-start gap-2">
											<Checkbox
												name={`entity-refresh-${f.field}`}
												checked={!f.protected && (selected[f.field] ?? false)}
												disabled={f.protected}
												onchange={(v) => setSelected(f.field, v)}
											/>
											<span>{fieldLabel(f.field)}</span>
										</label>
										{#if f.protected}
											<Badge tone="warn" class="mt-1">{tr('gene_refresh_protected')}</Badge>
										{:else if f.conflict}
											<Badge tone="warn" class="mt-1">{tr('gene_refresh_conflict')}</Badge>
										{:else if f.baseKnown === false}
											<Badge tone="warn" class="mt-1">{tr('gene_refresh_no_base')}</Badge>
										{/if}
									</td>
									<td class="py-2 pr-3">
										{#if f.baseKnown && f.base !== undefined}
											<div class="mb-1 text-[10px] text-muted-foreground">
												{tr('gene_refresh_base')} {formatValue(f.base)}
											</div>
										{/if}
										<div
											class="max-h-32 overflow-auto font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground"
										>
											{formatValue(f.old)}
										</div>
									</td>
									<td class="py-2">
										<div
											class="max-h-32 overflow-auto font-mono text-xs break-all whitespace-pre-wrap"
										>
											{formatValue(f.new)}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="flex flex-wrap justify-end gap-2">
					<Button variant="ghost" onclick={dismiss} disabled={applying}>
						{tr('gene_refresh_dismiss')}
					</Button>
					<Button variant="outline" onclick={() => (dialogOpen = false)} disabled={applying}>
						{tr('gene_refresh_later')}
					</Button>
					<Button onclick={apply} disabled={applying}>{tr('gene_refresh_apply')}</Button>
				</div>
			</div>
		{/if}
	</Dialog>
{:else if statusError}
	<p class="text-xs text-muted-foreground">{tr('gene_source_unavailable')}</p>
{/if}
