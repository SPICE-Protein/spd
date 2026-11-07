<script lang="ts">
	import { page } from '$app/state';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import { catalogBy } from '$lib/submit/registry';
	import type { CatalogEntry } from '$lib/submit/registry';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Button from '$lib/components/Button.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import TargetPicker from '$lib/components/TargetPicker.svelte';
	import { buildSafe } from '$lib/components/form-values';
	import { draft } from '$lib/state/drafts.svelte';
	import DraftNote from '$lib/components/DraftNote.svelte';

	/**
	 * One wizard per catalog kind, driven entirely by the registry entry —
	 * /submit lists every category, this page turns the clicked one into a
	 * plain form. Even the free-shape community kinds (corrections,
	 * benchmarks…) are plain fields here: SPD's thin store accepts whatever
	 * keys it is given, so beginners never have to write JSON for them.
	 */
	const entry = $derived<CatalogEntry | undefined>(catalogBy(page.params.kind));

	// The raw targetId text input stays on the registry fields (the CatalogPage
	// dialog offers the paste path), but here the picker owns it and the
	// duplicate input is hidden.
	const shownFields = $derived(
		entry && entry.picksTarget ? (entry.fields ?? []).filter((f) => f.name !== 'targetId') : (entry?.fields ?? [])
	);

	const BLANK: Record<string, string> = { license: 'CC-BY-4.0' };
	let values = $state<Record<string, string>>({ ...BLANK });
	const draftKey = $derived(`submit/${page.params.kind ?? ''}`);
	let error = $state('');
	let saving = $state(false);
	let createdId = $state('');

	// SvelteKit reuses this component when only the [kind] param changes —
	// reseed per-kind state instead of leaking one wizard's form into the next.
	// The first pass is skipped on purpose: that is when a draft has just been
	// restored, and wiping it here would defeat the whole feature.
	let firstPass = true;
	$effect(() => {
		void entry;
		if (firstPass) {
			firstPass = false;
			return;
		}
		values = { ...BLANK };
		error = '';
		createdId = '';
	});

	// receipts come back shaped differently per module: id/publicId at the top
	// or one level down (e.g. {record:{id}}) — check both, never guess further.
	function extractId(r: unknown): string {
		if (r && typeof r === 'object') {
			const o = r as Record<string, unknown>;
			const direct = o.id ?? o.publicId;
			if (typeof direct === 'string' && direct) return direct;
			for (const v of Object.values(o)) {
				if (v && typeof v === 'object') {
					const nested = (v as Record<string, unknown>).id ?? (v as Record<string, unknown>).publicId;
					if (typeof nested === 'string' && nested) return nested;
				}
			}
		}
		return '';
	}

	async function submit() {
		error = '';
		const e = entry;
		if (!e?.create) return;
		const b = buildSafe(values, shownFields);
		if (b.error || !b.body) return (error = b.error ?? tr('form_required_missing'));
		const body = b.body;
		if (e.picksTarget) {
			if (!values.targetId?.trim()) return (error = tr('target_picker_required'));
			body.targetId = values.targetId;
		}
		saving = true;
		try {
			const r = await e.create(body);
			createdId = extractId(r);
			toastOk(tr('submit_created'));
			// keep the picked target on purpose — "submit another" usually
			// means another statement about the SAME record
			values = e.picksTarget ? { license: 'CC-BY-4.0', targetId: values.targetId } : { license: 'CC-BY-4.0' };
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			toastErr(err);
		} finally {
			saving = false;
		}
	}

	function reset() {
		createdId = '';
		error = '';
	}
</script>

<div class="mx-auto max-w-3xl space-y-4">
	{#if !entry}
		<p class="text-sm text-muted-foreground">{tr('submit_kind_not_found')}</p>
		<Button size="sm" href="/submit">{tr('nav_submit')}</Button>
	{:else}
		<h1 class="flex items-center gap-1.5 text-2xl font-bold">
			{tr(entry.titleKey)}
			<InfoTip
				text={tr(entry.descKey)}
				label={`${tr(entry.titleKey)} — ${tr('common_more_info')}`}
				class="mt-1"
			/>
		</h1>

		{#if error}
			<p class="rounded-none bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
		{:else if createdId}
			<div class="rounded-none bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-200">
				{tr('submit_created')} · <a class="font-mono underline" href="/{entry.route}/{createdId}">{createdId}</a>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button size="sm" href="/{entry.route}/{createdId}">{tr('submit_go_record')}</Button>
				<Button size="sm" variant="outline" href="/{entry.route}">{tr('submit_view_list')}</Button>
				<Button size="sm" variant="ghost" onclick={reset}>{tr('submit_another')}</Button>
			</div>
		{/if}

		{#if !entry.create}
			<!-- browse-only kinds are reachable by URL but have nothing to
			     submit here — point at the list instead of an empty form -->
			<p class="text-sm text-muted-foreground">{tr('submit_browse_only')}</p>
			<Button size="sm" variant="outline" href="/{entry.route}">{tr('submit_view_list')}</Button>
		{:else if session.signedIn}
			<Section>
				{#if entry.picksTarget}
					{#each [page.params.kind ?? ''] as kindKey (kindKey)}
						<p class="mb-1 text-xs text-muted-foreground">{tr('target_picker_label')}</p>
						<div class="mb-3">
							<TargetPicker
								onpick={(h) => {
									values.targetId = h?.id ?? '';
									// remember WHICH type was picked — the fieldPatch
									// editor fetches the target's correctable keys by
									// entity type, and the generic records lookup cannot
									// reach catalogs that live in their own table
									values['__targetType_targetId'] = h?.entityType ?? '';
								}}
							/>
						</div>
					{/each}
				{/if}
				<!-- keyed by kind so switching categories remounts the note and
				     restores that category's own draft -->
				{#each [draftKey] as key (key)}
					<DraftNote k={key} {values} blank={BLANK} />
				{/each}
				<FormFields fields={shownFields} bind:values columns={2} />
				<div class="mt-3 flex justify-end">
					<Button onclick={submit} disabled={saving}>{tr('common_submit')}</Button>
				</div>
			</Section>
		{:else}
			<div class="flex items-center gap-3 rounded-none border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
				{tr('submit_login_needed')}
				<Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
			</div>
		{/if}

		<p class="text-xs text-muted-foreground">
			<a class="underline" href="/submit">{tr('nav_submit')}</a>
		</p>
	{/if}
</div>

<svelte:head><title>{tr('nav_submit')} · {entry ? tr(entry.titleKey) : ''} · SPD</title></svelte:head>
