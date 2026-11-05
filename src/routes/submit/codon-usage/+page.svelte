<script lang="ts">
	import { codonUsage, geneticCodes } from '$lib/api/client';
	import type { GeneticCodeRow } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { toastOk } from '$lib/state/toast.svelte';
	import { LICENSES } from '$lib/format';
	import {
		CODON_MODES,
		aaStats,
		expectedSum,
		fmtSum,
		nonStandardCodons,
		rnaSpellings,
		parseCodonTable,
		type AaStat,
		type CodonMode
	} from '$lib/codons';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';
	import Select from '$lib/components/Select.svelte';
	import Textarea from '$lib/components/Textarea.svelte';
	import Input from '$lib/components/Input.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';
	import { draft } from '$lib/state/drafts.svelte';
	import DraftNote from '$lib/components/DraftNote.svelte';

	// No hash field anywhere on this page. The fingerprint is derived from the
	// table by the server (spd_backend/src/modules/codon.rs) — a contributor
	// quoting Kazusa has nothing to hash and should not be asked to try.
	const FIELDS: FormField[] = [
		{
			name: 'source',
			required: true,
			label: tr('codon_field_source'),
			hint: tr('codon_hint_source')
		},
		{
			name: 'title',
			label: tr('codon_field_title'),
			hint: tr('codon_hint_title')
		},
		{
			name: 'taxon_id',
			kind: 'organism',
			label: tr('codon_field_taxon'),
			hint: tr('codon_hint_taxon')
		},
		{
			name: 'scientific_name',
			label: tr('codon_field_scientific_name'),
			hint: tr('codon_hint_scientific_name')
		},
		{
			name: 'selection_mode',
			kind: 'select',
			required: true,
			options: [...CODON_MODES],
			ns: 'cm',
			label: tr('codon_field_mode'),
			hint: tr('codon_hint_mode')
		},
		{ name: 'source_url', label: tr('codon_field_source_url'), hint: tr('codon_hint_source_url') },
		{ name: 'license', kind: 'select', options: [...LICENSES] }
	];

	// a form nobody touched is just its seeded defaults — never a draft
	// codon_table is seeded too: the paste box binds values.codon_table directly, and
	// Svelte refuses `bind:value={undefined}` on a prop that has a fallback.
	const BLANK: Record<string, string> = { license: 'CC-BY-4.0', selection_mode: 'relative_frequency', codon_table: '', genetic_code_table_id: '' };
	let values = $state<Record<string, string>>({ ...BLANK });
	// The pasted table rides inside `values` (under a key that is not a FIELDS
	// name, so buildSafe ignores it) — that is what lets the browser draft keep
	// a thousand-row paste along with the metadata fields.
	const tableText = $derived(values.codon_table ?? '');
	let fileName = $state('');
	let fileEl = $state<HTMLInputElement | null>(null);
	let error = $state('');
	let saving = $state(false);
	let result = $state<{ id: string; created: boolean; sha: string } | null>(null);

	// The same ledger holds one-species tables and multi-species datasets.
	// A dataset is a set of species maps, each pointing at a shared genetic
	// code; it is not a pile of independent snapshots.
	type SpeciesRow = { taxonId: string; name: string; tableId: string; tableText: string };
	let datasetMode = $state<'single' | 'multi'>('single');
	let codeTables = $state<GeneticCodeRow[]>([]);
	let speciesRows = $state<SpeciesRow[]>([
		{ taxonId: '', name: '', tableId: '', tableText: '' },
		{ taxonId: '', name: '', tableId: '', tableText: '' }
	]);
	$effect(() => {
		void geneticCodes
			.list()
			.then((r) => (codeTables = Array.isArray(r.items) ? r.items : []))
			.catch(() => (codeTables = []));
	});
	const codeOptions = $derived([
		{ value: '', label: tr('codon_code_auto') },
		...codeTables.map((t) => ({ value: t.id, label: `${t.name} (NCBI ${t.ncbiTableId})` }))
	]);
	const metaFields = $derived(
		datasetMode === 'multi'
			? FIELDS.filter((f) => f.name !== 'taxon_id' && f.name !== 'scientific_name')
			: FIELDS
	);
	const multiViews = $derived(
		speciesRows.map((sp) => {
			const parsed = parseCodonTable(sp.tableText);
			return { ...sp, parsed, count: Object.keys(parsed.map).length };
		})
	);

	function addSpecies() {
		speciesRows.push({ taxonId: '', name: '', tableId: '', tableText: '' });
	}
	function removeSpecies(i: number) {
		if (speciesRows.length > 1) speciesRows.splice(i, 1);
	}
	async function readSpeciesFile(e: Event, i: number) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		speciesRows[i].tableText = await f.text();
		input.value = '';
	}

	const parsed = $derived(parseCodonTable(tableText));
	const codonCount = $derived(Object.keys(parsed.map).length);
	const stats = $derived(aaStats(parsed.map));
	const mode = $derived((values.selection_mode || 'relative_frequency') as CodonMode);
	const covered = $derived(stats.filter((s) => s.found > 0).length);
	const unknown = $derived(nonStandardCodons(parsed.map));
	const rna = $derived(rnaSpellings(parsed.map));
	// groups whose total disagrees with what the chosen reading implies — and
	// only for readings that DO imply a total
	const offTotal = $derived(
		stats
			.map((s) => ({ s, exp: expectedSum(mode, s.codons) }))
			.filter((x) => x.exp !== null && x.s.found === x.s.codons && Math.abs(x.s.sum - x.exp) > 0.02)
	);

	async function readFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		values.codon_table = await f.text();
		fileName = f.name;
		input.value = '';
	}

	// the resolver is what design tools call; running it here answers the one
	// question a contributor has before submitting: is my table already in?
	let resSource = $state('');
	let resTax = $state('');
	let resOut = $state<{
		id: string;
		source?: string;
		selectionMode?: string;
		codons?: number;
	} | null>(null);
	let resErr = $state('');
	async function resolveNow() {
		resOut = null;
		resErr = '';
		try {
			const r = (await codonUsage.resolve({ source: resSource, taxId: Number(resTax) })) as Record<
				string,
				unknown
			>;
			const preferred = (r.preferredCodons ?? r.codonMap ?? {}) as Record<string, unknown>;
			resOut = {
				id: String(r.id ?? ''),
				source: String(r.source ?? ''),
				selectionMode: String(r.selectionMode ?? ''),
				codons: Object.keys(preferred).length
			};
		} catch (e) {
			resErr = e instanceof Error ? e.message : String(e);
		}
	}

	async function submit() {
		error = '';
		result = null;
		const b = buildSafe(values, FIELDS);
		if (b.error || !b.body) return (error = b.error ?? tr('form_required_missing'));
		if (!b.body.source || !b.body.selection_mode) return (error = tr('form_required_missing'));
		if (datasetMode === 'multi') {
			const species = [];
			const seen = new Set<number>();
			for (let i = 0; i < multiViews.length; i++) {
				const v = multiViews[i];
				if (!/^\d+$/.test(v.taxonId.trim()) || Number(v.taxonId) <= 0) {
					return (error = tr('codon_multi_taxon_invalid', { n: i + 1 }));
				}
				const tax = Number(v.taxonId);
				if (seen.has(tax)) return (error = tr('codon_multi_duplicate', { n: tax }));
				seen.add(tax);
				if (v.parsed.jsonError || v.parsed.bad.length) {
					return (error = tr('codon_multi_map_bad', {
						n: i + 1,
						reason: v.parsed.jsonError || v.parsed.bad[0]
					}));
				}
				if (!v.count) return (error = tr('codon_multi_map_empty', { n: i + 1 }));
				species.push({
					taxon_id: tax,
					scientific_name: v.name.trim() || undefined,
					codon_map: v.parsed.map,
					genetic_code_table_id: v.tableId || undefined
				});
			}
			if (!species.length) return (error = tr('codon_multi_empty'));
			delete b.body.taxon_id;
			b.body.snapshot_kind = 'multi';
			b.body.species = species;
		} else {
			if (parsed.jsonError) return (error = `${tr('codon_json_bad')}: ${parsed.jsonError}`);
			if (!codonCount) return (error = tr('codon_no_codons'));
			if (parsed.bad.length) {
				return (error = `${tr('codon_bad_lines', { n: parsed.bad.length })}: ${parsed.bad.slice(0, 3).join(' ⎠ ')}`);
			}
			b.body.codon_map = parsed.map;
			b.body.snapshot_kind = 'single';
			if (values.genetic_code_table_id) b.body.genetic_code_table_id = values.genetic_code_table_id;
		}
		saving = true;
		try {
			const r = await codonUsage.create(b.body as never);
			result = { id: String(r.id), created: !!r.created, sha: String(r.snapshotSha256 ?? '') };
			draft('submit/codon-usage').clear();
			toastOk(result.created ? tr('codon_created') : tr('codon_existed'));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	function chipClass(s: AaStat): string {
		const exp = expectedSum(mode, s.codons);
		if (s.found === 0) return 'border-transparent bg-muted text-muted-foreground';
		const full = s.found === s.codons;
		const totalOk = exp === null || !full || Math.abs(s.sum - exp) <= 0.02;
		return full && totalOk
			? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
			: 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200';
	}
</script>

<div class="mx-auto max-w-4xl space-y-4">
	<h1 class="text-2xl font-bold">{tr('submit_codon')}</h1>
	<p class="text-sm text-muted-foreground">{tr('submit_codon_desc')}</p>

	{#if !session.signedIn}
		<Section>
			<div class="flex items-center justify-between gap-3">
				<p class="text-sm text-muted-foreground">{tr('submit_login_needed')}</p>
				<Button onclick={() => session.signIn()}>{tr('nav_login')}</Button>
			</div>
		</Section>
	{:else if result}
		<Section title={tr('codon_done_title')}>
			<p class="text-sm">
				{result.created ? tr('codon_created') : tr('codon_existed')}
				<a class="ml-1 font-mono text-xs underline" href="/codon-usage/{result.id}">{result.id}</a>
			</p>
			{#if result.sha}
				<p class="mt-2 break-all font-mono text-[10px] text-muted-foreground">{result.sha}</p>
				<p class="mt-1 text-xs text-muted-foreground">{tr('codon_sha_note')}</p>
			{/if}
			<div class="mt-3 flex flex-wrap gap-2">
				<Button size="sm" href="/codon-usage/{result.id}">{tr('codon_view_cta')}</Button>
				<Button
					size="sm"
					variant="outline"
					onclick={() => {
						result = null;
						values.codon_table = '';
						fileName = '';
					}}>{tr('codon_again')}</Button
				>
			</div>
		</Section>
	{:else}
		<Section title={tr('codon_step_meta')}>
			<DraftNote k="submit/codon-usage" {values} blank={BLANK} />
			<div class="mb-3 flex flex-wrap gap-2">
				<Button
					size="xs"
					variant={datasetMode === 'single' ? 'primary' : 'outline'}
					onclick={() => (datasetMode = 'single')}>{tr('codon_mode_single')}</Button
				>
				<Button
					size="xs"
					variant={datasetMode === 'multi' ? 'primary' : 'outline'}
					onclick={() => (datasetMode = 'multi')}>{tr('codon_mode_multi')}</Button
				>
			</div>
			<p class="mb-2 text-xs text-muted-foreground">
				{datasetMode === 'multi' ? tr('codon_mode_hint_multi') : tr('codon_mode_hint_single')}
			</p>
			<FormFields fields={metaFields} bind:values columns={2} />
			{#if datasetMode === 'single'}
				<div class="mt-3 grid gap-2 sm:grid-cols-2">
					<label class="text-xs">
						<span class="mb-1 block text-muted-foreground">{tr('codon_field_code')}</span>
						<Select
							name="codon_code_table"
							bind:value={values.genetic_code_table_id}
							options={codeOptions}
							class="w-full"
						/>
					</label>
				</div>
				<p class="mt-1 text-xs text-muted-foreground">{tr('codon_hint_code')}</p>
			{/if}
			<p class="mt-2 text-xs text-muted-foreground">{enumLabel('cmx', mode)}</p>
		</Section>

		{#if datasetMode === 'multi'}
			<Section title={tr('codon_multi_title')}>
				<p class="mb-3 text-xs text-muted-foreground">{tr('codon_multi_hint')}</p>
				<div class="space-y-3">
					{#each speciesRows as sp, i (i)}
						<div class="space-y-2 border p-3">
							<div class="flex items-center justify-between">
								<span class="text-xs font-semibold text-muted-foreground"
									>{tr('codon_multi_row', { n: i + 1 })}</span
								>
								{#if speciesRows.length > 1}
									<Button size="xs" variant="ghost" onclick={() => removeSpecies(i)}
										>{tr('codon_multi_remove')}</Button
									>
								{/if}
							</div>
							<div class="grid gap-2 sm:grid-cols-3">
								<label class="text-xs">
									<span class="mb-1 block text-muted-foreground">{tr('codon_multi_taxon')}</span>
									<Input name={`sp_tax_${i}`} bind:value={sp.taxonId} placeholder="9606" />
								</label>
								<label class="text-xs">
									<span class="mb-1 block text-muted-foreground">{tr('codon_field_scientific_name')}</span>
									<Input name={`sp_name_${i}`} bind:value={sp.name} placeholder="Homo sapiens" />
								</label>
								<label class="text-xs">
									<span class="mb-1 block text-muted-foreground">{tr('codon_field_code')}</span>
									<Select
										name={`sp_code_${i}`}
										bind:value={sp.tableId}
										options={codeOptions}
										class="w-full"
									/>
								</label>
							</div>
							<Textarea
								name={`sp_table_${i}`}
								bind:value={sp.tableText}
								rows={5}
								monospace
								placeholder={'GCT 0.05 GCC 0.30 GCA 0.34 GCG 0.31'}
							/>
							<div class="flex flex-wrap items-center gap-2">
								<label class="cursor-pointer text-[11px] text-muted-foreground underline">
									{tr('codon_from_file')}
									<input
										type="file"
										accept=".csv,.tsv,.txt,.tab,.json,text/csv,text/plain,application/json"
										class="hidden"
										onchange={(e) => void readSpeciesFile(e, i)}
									/>
								</label>
								<span class="text-xs text-muted-foreground"
									>{tr('codon_multi_parsed', { n: multiViews[i]?.count ?? 0 })}</span
								>
							</div>
						</div>
					{/each}
				</div>
				<div class="mt-3">
					<Button size="sm" variant="outline" onclick={addSpecies}>{tr('codon_multi_add')}</Button>
				</div>
				<p class="mt-3 text-xs text-muted-foreground">{tr('codon_sha_note')}</p>
				{#if error}<p class="mt-2 rounded-none bg-destructive/10 p-2 text-xs text-destructive">{error}</p>{/if}
				<div class="mt-3 flex justify-end">
					<Button onclick={submit} disabled={saving}>{tr('common_submit')}</Button>
				</div>
			</Section>
		{:else}
		<Section title={tr('codon_step_table')}>
			<p class="mb-2 text-xs text-muted-foreground">{tr('codon_paste_hint')}</p>
			<Textarea
				name="codon_table"
				bind:value={values.codon_table}
				rows={12}
				monospace
				placeholder={'Ala GCT 0.05 GCC 0.30 GCA 0.34 GCG 0.31\nSer TCA 12%'}
			/>
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<Button size="xs" variant="outline" onclick={() => fileEl?.click()}
					>{tr('codon_from_file')}</Button
				>
				{#if fileName}<span class="font-mono text-[11px] text-muted-foreground">{fileName}</span
					>{/if}
				{#if tableText}
					<button
						class="text-[11px] text-muted-foreground underline"
						onclick={() => {
							values.codon_table = '';
							fileName = '';
						}}>{tr('codon_clear')}</button
					>
				{/if}
				<input
					bind:this={fileEl}
					type="file"
					accept=".csv,.tsv,.txt,.tab,.json,text/csv,text/plain,application/json"
					class="hidden"
					onchange={readFile}
				/>
			</div>

			{#if codonCount || parsed.bad.length || parsed.jsonError}
				<div class="mt-3 space-y-2">
					<p
						class="text-xs {parsed.bad.length || parsed.jsonError
							? 'text-amber-800 dark:text-amber-300'
							: 'text-emerald-700 dark:text-emerald-300'}"
					>
						{tr('codon_parsed', { n: codonCount, m: covered })}
					</p>
					<div class="flex flex-wrap gap-1">
						{#each stats as s (s.aa)}
							<span
								class="inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[11px] {chipClass(
									s
								)}"
								title={s.aa === '*' ? tr('codon_stop') : s.aa3}
							>
								<span class="font-bold">{s.aa3}</span>
								<span>{s.found}/{s.codons}</span>
								{#if s.found}
									<span class="text-muted-foreground">Σ{fmtSum(s.sum)}</span>
								{/if}
							</span>
						{/each}
					</div>
					{#if offTotal.length}
						<p class="text-xs text-amber-800 dark:text-amber-300">
							{tr('codon_sum_off', {
								n: offTotal.length,
								expect: fmtSum(expectedSum(mode, 1) ?? 1)
							})}
							{offTotal
								.slice(0, 4)
								.map((x) => `${x.s.aa3} Σ${fmtSum(x.s.sum)}`)
								.join(' · ')}
						</p>
					{/if}
					{#if parsed.duplicates.length}
						<p class="text-xs text-amber-800 dark:text-amber-300">
							{tr('codon_dups', { n: parsed.duplicates.length })}
							{parsed.duplicates.slice(0, 6).join(' ')}
						</p>
					{/if}
					{#if unknown.length}
						<p class="text-xs text-muted-foreground">
							{tr('codon_unknown', { list: unknown.join(' ') })}
						</p>
						{#if rna.length}
							<p class="text-xs text-muted-foreground">{tr('codon_rna_note', { n: rna.length })}</p>
						{/if}
					{/if}
					{#if parsed.jsonError}
						<p class="rounded-none bg-amber-50 dark:bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">
							{tr('codon_json_bad')}: {parsed.jsonError}
						</p>
					{:else if parsed.bad.length}
						<details class="text-xs text-amber-900 dark:text-amber-200">
							<summary class="cursor-pointer"
								>{tr('codon_bad_lines', { n: parsed.bad.length })}</summary
							>
							<ul class="mt-1 list-inside list-disc font-mono">
								{#each parsed.bad.slice(0, 12) as l (l)}<li>{l}</li>{/each}
							</ul>
							<p class="mt-1">{tr('codon_bad_lines_note')}</p>
						</details>
					{/if}
					{#if covered < stats.length}
						<p class="text-xs text-muted-foreground">
							{tr('codon_partial', { n: stats.length - covered })}
						</p>
					{/if}
				</div>
			{/if}

			<p class="mt-3 text-xs text-muted-foreground">{tr('codon_sha_note')}</p>
			{#if error}<p class="mt-2 rounded-none bg-destructive/10 p-2 text-xs text-destructive">{error}</p>{/if}
			<div class="mt-3 flex justify-end">
				<Button onclick={submit} disabled={saving}>{tr('common_submit')}</Button>
			</div>
		</Section>
		{/if}
	{/if}

	<Section title={tr('codon_resolve')}>
		<p class="mb-2 text-xs text-muted-foreground">{tr('codon_resolve_hint')}</p>
		<div class="flex flex-wrap items-end gap-2">
			<label class="block">
				<span class="mb-1 block text-[11px] text-muted-foreground">{tr('codon_field_source')}</span>
				<Input name="res_source" class="h-8 w-56" bind:value={resSource} />
			</label>
			<label class="block">
				<span class="mb-1 block text-[11px] text-muted-foreground">{tr('codon_field_taxon')}</span>
				<Input name="res_tax" class="h-8 w-28" bind:value={resTax} />
			</label>
			<Button size="sm" variant="outline" onclick={resolveNow} disabled={!resSource || !resTax}
				>{tr('codon_resolve')}</Button
			>
		</div>
		{#if resOut}
			<p class="mt-2 text-xs text-emerald-800 dark:text-emerald-300">
				{tr('codon_resolve_found')}
				<a class="font-mono underline" href="/codon-usage/{resOut.id}">{resOut.id}</a>
				· {resOut.source} · {resOut.selectionMode} · {tr('codon_resolve_codons', {
					n: resOut.codons ?? 0
				})}
			</p>
		{:else if resErr}
			<p class="mt-2 text-xs text-muted-foreground">
				{resErr.includes('not found') ? tr('codon_resolve_none') : resErr}
			</p>
		{/if}
	</Section>
</div>

<svelte:head><title>{tr('submit_codon')} · SPD</title></svelte:head>
