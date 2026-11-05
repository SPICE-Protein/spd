<script lang="ts">
	import { references } from '$lib/api/client';
	import type { ReferenceLookupData, ReferenceRow } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { toastErr, toastOk } from '$lib/state/toast.svelte';
	import { linkForReference, looksLikeReferenceId, normalizeExternalId } from '$lib/references';
	import Section from './Section.svelte';
	import Button from './Button.svelte';
	import Badge from './Badge.svelte';
	import Input from './Input.svelte';
	import Select from './Select.svelte';

	let { entityType, entityId, collapsible = false }: { entityType: string; entityId: string; collapsible?: boolean } = $props();

	let rows = $state<ReferenceRow[]>([]);
	let loading = $state(true);
	let busyId = $state<string | null>(null);

	// Add form. For doi/pubmed the contributor types ONE thing — the id —
	// and title/authors/year/OA link are retrieved from CrossRef/PubMed:
	// a preview card here (GET /references/lookup), then the same data on
	// the worker at attach time. "other" has no registry to ask, so the
	// manual fields stay for that lane only.
	let showAdd = $state(false);
	let form = $state({ source: 'doi', externalId: '', title: '', year: '', oaUrl: '' });
	let adding = $state(false);
	let addError = $state('');
	let preview = $state<ReferenceLookupData | null>(null);
	let looking = $state(false);
	let lookupError = $state('');

	const resolvable = $derived(form.source === 'doi' || form.source === 'pubmed');
	const normalizedId = $derived(normalizeExternalId(form.source, form.externalId));

	// a stale preview card under an edited id would be worse than none
	let lastLookupKey = $state('');
	$effect(() => {
		const key = `${form.source}|${form.externalId}`;
		if (key !== lastLookupKey) {
			lastLookupKey = key;
			preview = null;
			lookupError = '';
		}
	});

	async function reload() {
		loading = true;
		try {
			const res = await references.list(entityType, entityId);
			rows = Array.isArray(res) ? (res as ReferenceRow[]) : [];
		} catch {
			rows = [];
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		void reload();
	});

	async function lookup() {
		addError = '';
		lookupError = '';
		if (!form.externalId.trim()) {
			addError = tr('refs_required');
			return;
		}
		looking = true;
		preview = null;
		try {
			preview = await references.lookup(form.source, form.externalId.trim());
		} catch (e) {
			lookupError = e instanceof Error ? e.message : String(e);
		} finally {
			looking = false;
		}
	}

	async function add() {
		addError = '';
		if (!form.externalId.trim() || !form.source) {
			addError = tr('refs_required');
			return;
		}
		adding = true;
		try {
			await references.add(entityType, entityId, {
				source: form.source as 'pubmed' | 'doi' | 'other',
				externalId: form.externalId.trim(),
				// manual fields only mean something when there is no registry
				// to fetch from; for doi/pubmed the worker enriches the row
				title: resolvable ? undefined : form.title.trim() || undefined,
				year: resolvable ? undefined : form.year ? Number(form.year) : undefined,
				oaUrl: resolvable ? undefined : form.oaUrl.trim() || undefined
			});
			toastOk(tr('refs_added'));
			showAdd = false;
			form = { source: 'doi', externalId: '', title: '', year: '', oaUrl: '' };
			preview = null;
			await reload();
		} catch (e) {
			addError = e instanceof Error ? e.message : String(e);
		} finally {
			adding = false;
		}
	}

	async function refresh(ref: ReferenceRow) {
		busyId = ref.id;
		try {
			const data = await references.refresh(ref.id);
			citationCache.set(ref.id, { count: data?.citationCount ?? null, cached: data?.cached });
			await reload();
			toastOk(tr('refs_refreshed'));
		} catch (e) {
			toastErr(e);
		} finally {
			busyId = null;
		}
	}

	async function remove(ref: ReferenceRow) {
		if (!confirm(tr('refs_delete_confirm'))) return;
		try {
			await references.remove(entityType, entityId, ref.id);
			await reload();
		} catch (e) {
			toastErr(e);
		}
	}

	const citationCache = new Map<string, { count?: number | null; cached?: boolean }>();

	const canDelete = $derived(
		(ref: ReferenceRow) => session.canWrite && (session.isAdmin || ref.addedBy === session.user?.id)
	);
</script>

<Section title={tr('refs_title')} {collapsible}>
	{#snippet actions()}
		{#if session.canWrite}<Button size="xs" variant="outline" onclick={() => (showAdd = !showAdd)}>{tr('refs_add')}</Button>{/if}
	{/snippet}

	{#if showAdd}
		<div class="mb-3 space-y-2 rounded-none border bg-muted/30 p-3">
			{#if addError}<p class="text-xs text-destructive">{addError}</p>{/if}
			<div class="grid grid-cols-[8rem_1fr_auto] items-center gap-2">
				<Select name="refs_source" class="h-8 w-full" bind:value={form.source} options={[{ value: 'doi', label: 'DOI' }, { value: 'pubmed', label: 'PubMed' }, { value: 'other', label: tr('vt_other') }]} />
				<Input name="refs_extid" class="h-8 w-full" placeholder={tr('refs_external_id')} bind:value={form.externalId} />
				{#if resolvable}
					<Button size="sm" variant="outline" onclick={lookup} disabled={looking || !form.externalId.trim()}>{looking ? tr('refs_looking') : tr('refs_lookup')}</Button>
				{/if}
			</div>
			{#if resolvable}
				<p class="text-xs text-muted-foreground">{tr('refs_only_id_hint')}</p>
				{#if form.externalId.trim() && !looksLikeReferenceId(form.source, form.externalId)}
					<p class="text-xs text-amber-600 dark:text-amber-400">{tr('refs_shape_hint')}</p>
				{/if}
				{#if form.externalId.trim() && normalizedId !== form.externalId.trim()}
					<p class="text-xs text-muted-foreground">{tr('refs_stored_as', { id: normalizedId })}</p>
				{/if}
			{:else}
				<p class="text-xs text-muted-foreground">{tr('refs_other_manual')}</p>
				<div class="grid grid-cols-[8rem_1fr] gap-2">
					<Input name="refs_title" class="h-8 w-full" placeholder={tr('refs_title_field')} bind:value={form.title} />
					<Input name="refs_year" class="h-8 w-full" placeholder="YYYY" bind:value={form.year} />
					<Input name="refs_oa" class="h-8 w-full" placeholder="OA URL" bind:value={form.oaUrl} />
				</div>
			{/if}

			{#if lookupError}
				<p class="text-xs text-destructive">{lookupError}</p>
			{:else if preview}
				<div class="rounded-none border bg-background p-2 text-sm">
					<div class="flex flex-wrap items-center gap-2">
						<Badge tone={preview.resolved ? 'ok' : 'warn'}>{preview.resolved ? tr('refs_resolved') : tr('refs_unresolved')}</Badge>
						<span class="font-mono text-xs text-muted-foreground">{preview.externalId}</span>
					</div>
					{#if preview.resolved}
						<p class="mt-1 font-medium">{preview.title ?? '—'}</p>
						{#if (preview.authors ?? []).length}
							<p class="text-xs text-muted-foreground">{(preview.authors ?? []).join(', ')}</p>
						{/if}
						<p class="text-xs text-muted-foreground">
							{preview.year ?? ''}
							{#if preview.citationCount != null}· {preview.citationCount} {tr('refs_citations')}{/if}
						</p>
						{#if preview.oaUrl}
							<a class="text-xs underline" href={String(preview.oaUrl)} target="_blank" rel="noopener noreferrer">{tr('refs_oa_link')}</a>
						{/if}
					{:else}
						<p class="mt-1 text-xs text-muted-foreground">{tr('refs_unresolved_hint')}</p>
					{/if}
				</div>
			{/if}

			<div class="flex justify-end gap-2">
				<Button size="sm" variant="ghost" onclick={() => (showAdd = false)}>{tr('common_cancel')}</Button>
				<Button size="sm" onclick={add} disabled={adding}>{tr('common_save')}</Button>
			</div>
		</div>
	{/if}

	{#if loading}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else if rows.length === 0}
		<p class="text-sm text-muted-foreground">{tr('refs_empty')}</p>
	{:else}
		<ul class="divide-y">
			{#each rows as ref (ref.id)}
				<li class="flex items-start justify-between gap-3 py-2 text-sm">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<Badge tone="muted">{enumLabel('ref', ref.source)}</Badge>
							{#if linkForReference(ref)}
								<a class="font-mono text-xs underline" href={linkForReference(ref)} target="_blank" rel="noopener noreferrer">{ref.externalId}</a>
							{:else}
								<span class="font-mono text-xs text-muted-foreground">{ref.externalId}</span>
							{/if}
						</div>
						<p class="mt-0.5 truncate" title={ref.title ?? ''}>{ref.title ?? '—'}</p>
						<p class="text-xs text-muted-foreground">
							{(ref.authors ?? []).join(', ')} {ref.year ? `· ${ref.year}` : ''}
							{#if citationCache.get(ref.id)?.count != null}
								· {tr('refs_citations')} {citationCache.get(ref.id)?.count}
							{/if}
						</p>
					</div>
					<div class="flex shrink-0 gap-1">
						{#if session.canWrite}
							<Button size="xs" variant="ghost" onclick={() => refresh(ref)} disabled={busyId === ref.id}>{tr('refs_refresh')}</Button>
						{/if}
						{#if canDelete(ref)}<Button size="xs" variant="ghost" onclick={() => remove(ref)}>{tr('common_delete')}</Button>{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</Section>
