<script lang="ts">
	import { provenance, firstArray } from '$lib/api/client';
	import type { ProvenanceSnapshotRow } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { fmtTime, fmtNumber } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from './Section.svelte';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';
	import Input from './Input.svelte';
	import Select from './Select.svelte';
	import Textarea from './Textarea.svelte';

	let { entityType, entityId, collapsible = false }: { entityType: string; entityId: string; collapsible?: boolean } = $props();

	const MEDIA = ['application/json', 'text/plain', 'text/x-fasta'];

	let rows = $state<ProvenanceSnapshotRow[]>([]);
	let loading = $state(false);

	async function load() {
		if (!entityId) return;
		loading = true;
		try {
			rows = firstArray<ProvenanceSnapshotRow>(await provenance.forEntity(entityType, entityId), 'snapshots', 'items');
		} catch {
			rows = [];
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		void load();
	});

	// attach form
	let showForm = $state(false);
	let form = $state({ source: '', sourceId: '', fetchedAt: '', mediaType: 'application/json', content: '' });
	let saving = $state(false);

	async function attach() {
		if (!form.source.trim() || !form.sourceId.trim() || !form.content || !form.fetchedAt) {
			return toastErr(tr('form_required_missing'));
		}
		let content: unknown;
		if (form.mediaType === 'application/json') {
			try {
				content = JSON.parse(form.content);
			} catch {
				return toastErr(tr('prov_bad_json'));
			}
		} else {
			content = form.content;
		}
		saving = true;
		try {
			const r = await provenance.create({
				entityType,
				entityId,
				source: form.source.trim(),
				sourceId: form.sourceId.trim(),
				fetchedAt: Number(form.fetchedAt),
				mediaType: form.mediaType,
				content
			});
			toastOk(`${tr('prov_attached')} ${String(r.sha256 ?? '').slice(0, 18)}…`);
			showForm = false;
			form = { source: '', sourceId: '', fetchedAt: '', mediaType: 'application/json', content: '' };
			await load();
		} catch (e) {
			toastErr(e);
		} finally {
			saving = false;
		}
	}

	// content viewer — the /content endpoint streams stored bytes (public).
	let viewing = $state<ProvenanceSnapshotRow | null>(null);
	let contentText = $state('');
	let fetching = $state(false);

	async function viewContent(s: ProvenanceSnapshotRow) {
		if (viewing === s) {
			viewing = null;
			contentText = '';
			return;
		}
		viewing = s;
		fetching = true;
		contentText = '';
		try {
			const sid = String(s.snapshotId ?? s.id ?? '');
			const res = await fetch(provenance.contentUrl(sid), { credentials: 'include' });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			contentText = await res.text();
		} catch (e) {
			contentText = String(e);
		} finally {
			fetching = false;
		}
	}
</script>

<Section title={tr('prov_title')} {collapsible}>
	{#snippet actions()}
		{#if session.signedIn}
			<Button size="xs" variant="outline" onclick={() => (showForm = !showForm)}>{tr('prov_attach')}</Button>
		{/if}
	{/snippet}

	<p class="mb-2 text-xs text-muted-foreground">{tr('prov_intro')}</p>

	{#if showForm && session.signedIn}
		<div class="mb-3 grid gap-2 rounded-none border p-3 text-sm sm:grid-cols-2">
			<label class="block">
				<span class="text-xs text-muted-foreground">{tr('prov_source')}</span>
				<Input name="prov_source" class="mt-1 h-8 w-full" placeholder="uniprot / rcsb / …" bind:value={form.source} />
			</label>
			<label class="block">
				<span class="text-xs text-muted-foreground">{tr('prov_source_id')}</span>
				<Input name="prov_sourceid" class="mt-1 h-8 w-full font-mono text-xs" placeholder="P04180 / 2LYZ / …" bind:value={form.sourceId} />
			</label>
			<label class="block">
				<span class="text-xs text-muted-foreground">{tr('prov_fetched_at')}</span>
				<Input name="prov_fetched" type="number" class="mt-1 h-8 w-full font-mono text-xs" bind:value={form.fetchedAt} />
			</label>
			<label class="block">
				<span class="text-xs text-muted-foreground">{tr('f_mediaType')}</span>
				<Select name="prov_media" class="mt-1 h-8 w-full" bind:value={form.mediaType} options={MEDIA.map((m) => ({ value: m, label: m }))} />
			</label>
			<label class="block sm:col-span-2">
				<span class="text-xs text-muted-foreground">{tr('prov_content')}</span>
				<Textarea name="prov_content" class="mt-1 h-32 w-full p-2 text-xs" monospace spellcheck={false} bind:value={form.content} />
			</label>
			<div class="flex justify-end gap-2 sm:col-span-2">
				<Button variant="ghost" size="sm" onclick={() => (showForm = false)}>{tr('common_cancel')}</Button>
				<Button size="sm" onclick={attach} disabled={saving}>{tr('common_submit')}</Button>
			</div>
		</div>
	{/if}

	{#if rows.length === 0}
		<p class="text-sm text-muted-foreground">{loading ? tr('common_loading') : tr('prov_empty')}</p>
	{:else}
		<ul class="divide-y text-sm">
			{#each rows as s (String(s.snapshotId ?? s.id))}
				<li class="flex flex-wrap items-center gap-2 py-2">
					<Badge tone="info">{s.source}</Badge>
					<code class="font-mono text-xs">{s.sourceId}</code>
					<span class="text-xs text-muted-foreground">{s.mediaType} · {fmtNumber(s.byteLength)} B</span>
					<span class="text-xs text-muted-foreground" title={s.sha256}>{tr('prov_sha')} {String(s.sha256).slice(0, 12)}…</span>
					<span class="ml-auto text-xs text-muted-foreground">{tr('prov_fetched')} {fmtTime(Number(s.fetchedAt), true)}</span>
					<Button size="xs" variant="ghost" onclick={() => viewContent(s)}>{viewing === s ? tr('common_close') : tr('prov_view')}</Button>
					{#if viewing === s}
						<div class="w-full">
							{#if fetching}<p class="text-xs text-muted-foreground">{tr('common_loading')}</p>
							{:else}<pre class="max-h-64 overflow-auto rounded-none bg-muted/40 p-2 text-[11px] leading-relaxed">{contentText}</pre>{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</Section>
