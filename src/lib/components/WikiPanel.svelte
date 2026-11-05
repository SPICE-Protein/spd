<script lang="ts">
	import { wiki } from '$lib/api/client';
	import type { WikiEntry, WikiRevisionRow } from '$lib/api/types';
	import { SpdApiError } from '$lib/api/base';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { toastErr, toastOk } from '$lib/state/toast.svelte';
	import { fmtTime } from '$lib/format';
	import Markdown from './Markdown.svelte';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import Field from './Field.svelte';
	import Input from './Input.svelte';
	import Textarea from './Textarea.svelte';
	import Section from './Section.svelte';
	import DataView from '$lib/components/DataView.svelte';

	let {
		entityType,
		entityId,
		collapsible = false
	}: { entityType: string; entityId: string; collapsible?: boolean } = $props();

	let entry = $state<WikiEntry | null>(null);
	let revisions = $state<WikiRevisionRow[]>([]);
	let revisionsLoaded = $state(false);
	let revisionsLoading = $state(false);
	let loading = $state(true);
	let showEditor = $state(false);
	let showHistory = $state(false);
	let viewing = $state<WikiRevisionRow | null>(null);

	let saving = $state(false);
	let form = $state({
		title: '',
		bodyMarkdown: '',
		summary: '',
		tags: '',
		crossReferences: '',
		related: '',
		changeSummary: ''
	});
	let formError = $state('');

	async function reload() {
		loading = true;
		// Revisions are a second read that only the history dialog needs;
		// the panel body paints as soon as the entry arrives.
		revisionsLoaded = false;
		revisions = [];
		try {
			const res = await wiki.get(entityType, entityId);
			entry = (res?.wiki as WikiEntry) ?? null;
		} catch (e) {
			// 400 "unknown entity" style errors shouldn't break the page — wiki is optional.
			entry = null;
			if (!(e instanceof SpdApiError)) toastErr(e);
		} finally {
			loading = false;
		}
	}

	async function loadRevisions() {
		if (revisionsLoaded || revisionsLoading) return;
		revisionsLoading = true;
		try {
			const revs = await wiki.revisions(entityType, entityId);
			revisions = Array.isArray(revs) ? (revs as WikiRevisionRow[]) : [];
			revisionsLoaded = true;
		} catch {
			revisions = [];
		} finally {
			revisionsLoading = false;
		}
	}

	function openHistory() {
		showHistory = true;
		void loadRevisions();
	}
	$effect(() => {
		void reload();
	});

	function openEditor() {
		form = {
			title: entry?.title ?? '',
			bodyMarkdown: entry?.bodyMarkdown ?? '',
			summary: entry?.summary ?? '',
			tags: (entry?.tags ?? []).join(', '),
			crossReferences: JSON.stringify(entry?.crossReferences ?? []),
			related: JSON.stringify(entry?.related ?? []),
			changeSummary: ''
		};
		showEditor = true;
	}

	// The header's "annotate" button on this record's page asks us to open the
	// editor by id, so the entry point can live far from the panel itself.
	$effect(() => {
		const onAnnotate = (e: Event) => {
			const detail = (e as CustomEvent<{ entityId?: string }>).detail;
			if (detail?.entityId !== entityId || !session.signedIn) return;
			openEditor();
		};
		window.addEventListener('spd:annotate', onAnnotate);
		return () => window.removeEventListener('spd:annotate', onAnnotate);
	});

	function parseList(raw: string): unknown[] | undefined {
		const t = raw.trim();
		if (!t) return undefined;
		if (t.startsWith('[')) return JSON.parse(t) as unknown[];
		return t
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}

	async function save() {
		formError = '';
		if (!form.title.trim() || !form.bodyMarkdown.trim() || !form.changeSummary.trim()) {
			formError = tr('wiki_required_fields');
			return;
		}
		saving = true;
		try {
			await wiki.put(entityType, entityId, {
				title: form.title.trim(),
				bodyMarkdown: form.bodyMarkdown,
				summary: form.summary.trim() || undefined,
				tags: form.tags
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean),
				crossReferences: parseList(form.crossReferences),
				related: parseList(form.related),
				changeSummary: form.changeSummary.trim()
			});
			toastOk(tr('wiki_saved'));
			showEditor = false;
			await reload();
		} catch (e) {
			formError = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	async function hideWiki() {
		try {
			await wiki.hide(entityType, entityId);
			toastOk(tr('wiki_hidden'));
			await reload();
		} catch (e) {
			toastErr(e);
		}
	}

	async function viewRevision(n: number) {
		try {
			const rev = await wiki.revision(entityType, entityId, n);
			viewing = (Array.isArray(rev) ? rev[0] : rev) as WikiRevisionRow;
			showHistory = false;
		} catch (e) {
			toastErr(e);
		}
	}

	const canModerate = $derived(
		entry ? session.isAdmin || entry.createdBy === session.user?.id : false
	);
</script>

<Section title={tr('wiki_title')} {collapsible}>
	{#if loading}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else if viewing}
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<h3 class="text-sm font-medium">{viewing.title} · r{viewing.revisionNumber}</h3>
				<Button size="xs" variant="ghost" onclick={() => (viewing = null)}
					>{tr('common_back')}</Button
				>
			</div>
			<p class="text-xs text-muted-foreground">
				{fmtTime(viewing.createdAt)} · {viewing.changeSummary ?? ''}
			</p>
			{#if viewing.bodyMarkdown}<Markdown source={viewing.bodyMarkdown} />{/if}
		</div>
	{:else if entry}
		<div class="space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h3 class="text-base font-semibold">{entry.title}</h3>
					<p class="text-xs text-muted-foreground">
						{tr('wiki_revision')}
						{entry.revisionNumber} · {fmtTime(entry.updatedAt ?? entry.createdAt)}
					</p>
				</div>
				<div class="flex gap-1">
					{#if session.canWrite}
						<Button size="xs" variant="outline" onclick={openEditor}>{tr('wiki_edit')}</Button>
					{/if}
					{#if session.signedIn}
						<Button size="xs" variant="ghost" onclick={openHistory}
							>{tr('wiki_history')}</Button
						>
					{/if}
					{#if session.canWrite && canModerate}<Button size="xs" variant="ghost" onclick={hideWiki}
							>{tr('wiki_hide')}</Button
						>{/if}
				</div>
			</div>
			{#if entry.summary}<p class="text-sm text-muted-foreground">{entry.summary}</p>{/if}
			<Markdown source={entry.bodyMarkdown} />
			{#if (entry.tags ?? []).length}
				<p class="break-words text-xs text-muted-foreground">{(entry.tags ?? []).join(' · ')}</p>
			{/if}
			{#if entry.crossReferences || entry.related}
				<DataView
					label={tr('wiki_refs_json')}
					value={{ crossReferences: entry.crossReferences, related: entry.related }}
				/>
			{/if}
		</div>
	{:else if session.canWrite}
		<div class="flex items-center justify-between">
			<p class="text-sm text-muted-foreground">{tr('wiki_absent_cta')}</p>
			<Button size="sm" variant="outline" onclick={openEditor}>{tr('wiki_create')}</Button>
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">{tr('wiki_absent_readonly')}</p>
	{/if}
</Section>

<Dialog bind:open={showEditor} title={entry ? tr('wiki_edit') : tr('wiki_create')} width="max-w-3xl">
	<div class="space-y-3">
		{#if formError}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">
				{formError}
			</p>{/if}
		<Field name="wiki_title" label={tr('wiki_field_title')} required>
			<Input name="wiki_title" bind:value={form.title} />
		</Field>
		<Field name="wiki_summary" label={tr('wiki_field_summary')}>
			<Input name="wiki_summary" bind:value={form.summary} />
		</Field>
		<Field name="wiki_body" label={tr('wiki_field_body')} required hint={tr('wiki_hint_markdown')}>
			<Textarea name="wiki_body" bind:value={form.bodyMarkdown} rows={14} monospace />
		</Field>
		<div class="grid grid-cols-2 gap-3">
			<Field name="wiki_tags" label={tr('wiki_field_tags')} hint={tr('wiki_hint_tags')}>
				<Input name="wiki_tags" bind:value={form.tags} />
			</Field>
			<Field name="wiki_cross" label={tr('wiki_field_crossRefs')} hint={tr('wiki_hint_json_array')}>
				<Input name="wiki_cross" bind:value={form.crossReferences} />
			</Field>
		</div>
		<Field name="wiki_related" label={tr('wiki_field_related')} hint={tr('wiki_hint_json_array')}>
			<Input name="wiki_related" bind:value={form.related} />
		</Field>
		<Field name="changeSummary" label={tr('field_changeSummary')} required>
			<Input name="changeSummary" bind:value={form.changeSummary} />
		</Field>
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showEditor = false)}>{tr('common_cancel')}</Button>
			<Button onclick={save} disabled={saving}>{tr('common_save')}</Button>
		</div>
	</div>
</Dialog>

<Dialog bind:open={showHistory} title={tr('wiki_history')}>
	<ul class="space-y-2">
		{#if revisionsLoading}
			<li class="text-sm text-muted-foreground">{tr('common_loading')}</li>
		{:else}
			{#each revisions as rev (rev.revisionNumber)}
				<li class="flex items-center justify-between gap-2 border-b pb-1.5 text-sm last:border-0">
					<div>
						<span class="font-medium">r{rev.revisionNumber}</span>
						<span class="ml-2 text-xs text-muted-foreground"
							>{fmtTime(rev.createdAt, true)} · {rev.changeSummary ?? ''}</span
						>
					</div>
					<Button size="xs" variant="outline" onclick={() => viewRevision(rev.revisionNumber)}
						>{tr('common_view')}</Button
					>
				</li>
			{:else}
				<li class="text-sm text-muted-foreground">{tr('common_empty')}</li>
			{/each}
		{/if}
	</ul>
</Dialog>
