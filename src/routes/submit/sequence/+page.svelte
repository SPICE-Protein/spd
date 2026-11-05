<script lang="ts">
	import { page } from '$app/state';
	import { sequences } from '$lib/api/client';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { BIOMOLECULE_CHARS } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';
	import SequenceText from '$lib/components/SequenceText.svelte';
	import { draft } from '$lib/state/drafts.svelte';
	import DraftNote from '$lib/components/DraftNote.svelte';

	const DRAFT_KEY = 'submit/sequence';

	const FIELDS: FormField[] = [
		{ name: 'proteinId', required: true, picker: 'protein', pickerLabel: String(page.url.searchParams.get('proteinName') ?? ''), hint: tr('sequence_hint_protein_id') },
		{ name: 'sequence', kind: 'textarea', required: true, rows: 8, hint: tr('sequence_hint_letters') },
		{ name: 'parentSequenceId', picker: 'sequence', hint: tr('sequence_hint_parent') },
		{ name: 'mutationLines', kind: 'textarea', rows: 3, hint: tr('sequence_hint_mutation_lines') },
		{ name: 'tags', kind: 'list', hint: tr('form_hint_comma_list') },
		{ name: 'license', kind: 'select', options: ['CC-BY-4.0'] }
	];

	/**
	 * Plain-language point substitutions — `A45G` per line, several per line
	 * allowed — compiled to the backend's mutation objects. Nobody should
	 * hand-write JSON to say "alanine 45 became glycine".
	 */
	const MUT_RE = /^([A-Za-z])(\d+)([A-Za-z])$/;
	const parsedMutations = $derived.by(() => {
		const toks = (values.mutationLines ?? '').split(/[,\s]+/).filter(Boolean);
		const out: Array<Record<string, unknown>> = [];
		for (const t of toks) {
			const m = MUT_RE.exec(t);
			if (!m) return { error: t, items: [] as Array<Record<string, unknown>> };
			out.push({ from: m[1].toUpperCase(), position: Number(m[2]), to: m[3].toUpperCase() });
		}
		return { error: '', items: out };
	});

	let values = $state<Record<string, string>>({
		license: 'CC-BY-4.0',
		proteinId: String(page.url.searchParams.get('proteinId') ?? ''),
		parentSequenceId: String(page.url.searchParams.get('parentSequenceId') ?? '')
	});
	let error = $state('');
	let saving = $state(false);
	let result = $state<{ id: string; created: boolean; deduplicated?: boolean } | null>(null);

	const normalized = $derived((values.sequence ?? '').replace(/\s+/g, '').toUpperCase());
	const badChars = $derived([...normalized].filter((c) => !BIOMOLECULE_CHARS.includes(c)));

	async function submit() {
		error = '';
		result = null;
		const b = buildSafe(values, FIELDS);
		if (b.error || !b.body) return (error = b.error ?? tr('form_required_missing'));
		if (!b.body.proteinId || !b.body.sequence) return (error = tr('form_required_missing'));
		if (badChars.length) return (error = `${tr('sequence_bad_chars')}: ${[...new Set(badChars)].join(' ')}`);
		if (parsedMutations.error) return (error = `${tr('sequence_mutation_bad_token')}: ${parsedMutations.error}`);
		if (parsedMutations.items.length) b.body.mutations = parsedMutations.items;
		delete b.body.mutationLines;
		saving = true;
		try {
			const r = await sequences.create(b.body as never);
			result = { id: String(r.sequence?.id ?? ''), created: !!r.created, deduplicated: r.deduplicated };
			draft(DRAFT_KEY).clear();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<h1 class="text-2xl font-bold">{tr('submit_sequence')}</h1>
	<Section>
		{#if error}<p class="mb-3 rounded-none bg-destructive/10 p-2 text-xs text-destructive">{error}</p>{/if}
		{#if result}
			<p class="rounded-none bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-200">
				{result.deduplicated ? tr('sequence_deduplicated') : tr('sequence_created')} ·
				<a class="underline font-mono" href="/sequences/{result.id}">{result.id}</a>
			</p>
			<div class="mt-3 flex gap-2">
				<Button size="sm" href="/sequences/{result.id}">{tr('submit_go_sequence')}</Button>
				<Button size="sm" variant="outline" href="/submit/fold?sequenceId={result.id}">{tr('submit_then_fold')}</Button>
			</div>
		{:else if session.signedIn}
			<DraftNote k={DRAFT_KEY} {values} />
			<FormFields fields={FIELDS} bind:values />
			{#if normalized}
				<p class="mt-2 text-xs text-muted-foreground">{tr('sequence_normalized_preview')} ({normalized.length})</p>
				<SequenceText sequence={normalized} />
			{/if}
			{#if parsedMutations.items.length}
				<p class="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
					{tr('sequence_mutation_preview', { n: parsedMutations.items.length })} ·
					{parsedMutations.items.map((m) => `${m.from}${m.position}${m.to}`).join('  ')}
				</p>
			{:else if parsedMutations.error}
				<p class="mt-2 text-xs text-amber-700 dark:text-amber-300">{tr('sequence_mutation_bad_token')}: {parsedMutations.error}</p>
			{/if}
			<div class="mt-3 flex justify-end">
				<Button onclick={submit} disabled={saving}>{tr('common_submit')}</Button>
			</div>
		{:else}
			<div class="flex items-center justify-between">
				<p class="text-sm text-muted-foreground">{tr('submit_login_needed')}</p>
				<Button onclick={() => session.signIn()}>{tr('nav_login')}</Button>
			</div>
		{/if}
	</Section>
</div>

<svelte:head><title>{tr('submit_sequence')} · SPD</title></svelte:head>
