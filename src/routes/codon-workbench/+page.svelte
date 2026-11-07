<script lang="ts">
	/**
	 * Codon optimization workbench. Everything here is pure client-side: pick a
	 * published usage snapshot (or resolve one from a taxon), paste a protein or
	 * CDS, and see the synonymous choices the dataset implies. No new backend
	 * endpoint — the workbench is a reader of codon-usage and genetic-codes.
	 */
	import { firstArray, codonUsage, geneticCodes } from '$lib/api/client';
	import type { CodonUsageRow, GeneticCodeRow } from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import { AA3, CODON_TO_AA } from '$lib/codons';
	import {
		CodonOptimizeError,
		DEFAULT_RARE_THRESHOLD,
		cai,
		codonUsageFromRow,
		gcContent,
		optimizeCds,
		optimizeProtein,
		type OptimizeResult
	} from '$lib/codonOptimize';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import Textarea from '$lib/components/Textarea.svelte';
	import Select from '$lib/components/Select.svelte';
	import Badge from '$lib/components/Badge.svelte';

	type Mode = 'protein' | 'dna';

	interface Choice {
		value: string;
		label: string;
		rowId: string;
		taxonId: number | null;
	}

	interface DatasetView {
		row: CodonUsageRow;
		taxonId: number | null;
		speciesName: string | null;
		usage: Record<string, number>;
		code: GeneticCodeRow;
		/** true when the snapshot's own table could not be used */
		codeFallback: boolean;
		/** true when the code is the built-in table, which has no detail route */
		syntheticCode: boolean;
	}

	interface RunView {
		result: OptimizeResult;
		mode: Mode;
		datasetLabel: string;
		beforeDna: string | null;
		beforeCai: number | null;
		beforeGc: number | null;
		originalCodons: string[];
		missingUsage: number;
		internalStop: boolean;
		appendedStop: boolean;
	}

	const STANDARD_CODE: GeneticCodeRow = {
		id: 'ncbi-1',
		ncbiTableId: 1,
		name: 'Standard',
		codonToAa: CODON_TO_AA
	};

	let mode = $state<Mode>('protein');
	let inputText = $state('');

	let rows = $state<CodonUsageRow[]>([]);
	let listLoading = $state(true);
	let listError = $state('');

	let codeTables = $state<GeneticCodeRow[]>([]);
	const standardCode = $derived(codeTables.find((t) => t.ncbiTableId === 1) ?? STANDARD_CODE);

	let selectedValue = $state('');
	let dataset = $state<DatasetView | null>(null);
	let datasetLoading = $state(false);
	let datasetError = $state('');
	let datasetNotice = $state('');
	let loadToken = 0;

	let taxonInput = $state('');
	let taxonLoading = $state(false);
	let taxonMessage = $state('');
	let taxonError = $state('');

	let run = $state<RunView | null>(null);
	let runError = $state<{ code: string; message: string } | null>(null);

	function errText(e: unknown): string {
		return e instanceof Error ? e.message : String(e);
	}

	function isMultiRow(row: CodonUsageRow): boolean {
		return row.snapshotKind === 'multi' || (row.species?.length ?? 0) > 1;
	}

	const choices = $derived.by<Choice[]>(() => {
		const out: Choice[] = [];
		for (const row of rows) {
			const title = row.title || row.source || row.id;
			const species = Array.isArray(row.species) ? row.species : [];
			if (isMultiRow(row) && species.length) {
				species.forEach((sp, i) => {
					const taxon = sp.taxonId ?? null;
					const name =
						sp.scientificName ||
						(taxon != null ? `${tr('cw_taxon')} ${taxon}` : `${tr('cw_species')} ${i + 1}`);
					out.push({
						value: `${row.id}::${taxon ?? `i${i}`}`,
						label: `${title} · ${name} · ${row.id}`,
						rowId: row.id,
						taxonId: taxon
					});
				});
				continue;
			}
			out.push({
				value: row.id,
				label: `${title} · ${row.id}`,
				rowId: row.id,
				taxonId: row.taxonId ?? species[0]?.taxonId ?? null
			});
		}
		return out;
	});

	const datasetOptions = $derived(choices.map((c) => ({ value: c.value, label: c.label })));

	const usageEntries = $derived(dataset ? Object.keys(dataset.usage).length : 0);

	const warnings = $derived.by<string[]>(() => {
		if (!run) return [];
		const out: string[] = [];
		if (run.internalStop) out.push(tr('cw_warn_internal_stop'));
		if (run.appendedStop) out.push(tr('cw_warn_appended_stop'));
		if (run.missingUsage > 0) out.push(tr('cw_warn_missing_usage', { n: run.missingUsage }));
		return out;
	});

	async function loadDatasets() {
		listLoading = true;
		listError = '';
		try {
			const data = await codonUsage.list();
			rows = firstArray<CodonUsageRow>(data, 'items');
			const first = choices[0];
			if (first && !selectedValue) {
				selectedValue = first.value;
				void loadChoice(first);
			}
		} catch (e) {
			rows = [];
			listError = errText(e);
		} finally {
			listLoading = false;
		}
	}

	async function loadCodeTables() {
		try {
			const data = await geneticCodes.list();
			codeTables = Array.isArray(data.items) ? data.items : [];
		} catch {
			codeTables = [];
		}
	}

	$effect(() => {
		void loadDatasets();
		void loadCodeTables();
	});

	async function loadChoice(choice: Choice) {
		const token = ++loadToken;
		datasetLoading = true;
		datasetError = '';
		datasetNotice = '';
		dataset = null;
		taxonMessage = '';
		taxonError = '';
		try {
			const row = await codonUsage.get(choice.rowId);
			const species = Array.isArray(row.species) ? row.species : [];
			const entry =
				choice.taxonId != null
					? species.find((sp) => Number(sp.taxonId) === choice.taxonId)
					: undefined;
			const usage = codonUsageFromRow(row, choice.taxonId ?? undefined);
			if (token !== loadToken) return;
			if (!Object.keys(usage).length) {
				datasetError = tr('cw_dataset_no_map');
				return;
			}

			const tableId = entry?.geneticCodeTableId ?? row.geneticCodeTableId ?? null;
			let code = standardCode;
			let codeFallback = !tableId;
			if (tableId) {
				try {
					code = await geneticCodes.get(tableId);
				} catch {
					code = standardCode;
					codeFallback = true;
				}
			}
			if (token !== loadToken) return;

			dataset = {
				row,
				taxonId: choice.taxonId ?? entry?.taxonId ?? row.taxonId ?? null,
				speciesName: entry?.scientificName ?? null,
				usage,
				code,
				codeFallback,
				syntheticCode: code === STANDARD_CODE
			};
			datasetNotice = !tableId
				? tr('cw_code_fallback_none')
				: codeFallback
					? tr('cw_code_fallback_missing')
					: '';
		} catch (e) {
			if (token === loadToken) datasetError = errText(e);
		} finally {
			if (token === loadToken) datasetLoading = false;
		}
	}

	function onChoiceChange() {
		const choice = choices.find((c) => c.value === selectedValue);
		if (choice) void loadChoice(choice);
	}

	async function loadTaxon() {
		const raw = taxonInput.trim();
		taxonMessage = '';
		taxonError = '';
		if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
			taxonError = tr('cw_taxon_invalid');
			return;
		}
		const taxon = Number(raw);
		const token = ++loadToken;
		taxonLoading = true;
		datasetLoading = false;
		try {
			const resolved = await geneticCodes.speciesCode(taxon);
			const row = rows.find(
				(r) =>
					Number(r.taxonId) === taxon ||
					(r.species ?? []).some((sp) => Number(sp.taxonId) === taxon)
			);
			if (!row) {
				if (token === loadToken) taxonError = tr('cw_taxon_none', { id: taxon });
				return;
			}
			const full = await codonUsage.get(row.id);
			const usage = codonUsageFromRow(full, taxon);
			if (!Object.keys(usage).length) {
				if (token === loadToken) taxonError = tr('cw_taxon_empty', { id: taxon });
				return;
			}
			if (token !== loadToken) return;

			const entry = (full.species ?? []).find((sp) => Number(sp.taxonId) === taxon);
			const code = resolved.table ?? standardCode;
			dataset = {
				row: full,
				taxonId: taxon,
				speciesName: entry?.scientificName ?? resolved.scientificName ?? null,
				usage,
				code,
				codeFallback: resolved.explicit === false,
				syntheticCode: code === STANDARD_CODE
			};
			datasetError = '';
			datasetNotice = resolved.explicit === false ? tr('cw_code_standard_fallback') : '';
			const match = choices.find((c) => c.rowId === row.id && c.taxonId === taxon);
			if (match) selectedValue = match.value;
			taxonMessage = tr('cw_taxon_found', {
				id: taxon,
				name: entry?.scientificName ?? resolved.scientificName ?? `${tr('cw_taxon')} ${taxon}`
			});
		} catch (e) {
			if (token === loadToken) taxonError = errText(e);
		} finally {
			if (token === loadToken) taxonLoading = false;
		}
	}

	function datasetLabel(view: DatasetView): string {
		const base = view.row.title || view.row.source || view.row.id;
		const name =
			view.speciesName ?? (view.taxonId != null ? `${tr('cw_taxon')} ${view.taxonId}` : '');
		return name ? `${base} · ${name}` : base;
	}

	function setMode(next: Mode) {
		if (mode === next) return;
		mode = next;
		run = null;
		runError = null;
	}

	function optimizeErrorMessage(e: CodonOptimizeError): string {
		switch (e.code) {
			case 'empty':
				return tr('cw_warn_empty');
			case 'length':
				return tr('cw_warn_length', { n: e.positions[0] ?? 0 });
			case 'alphabet':
				return tr('cw_warn_alphabet', { letters: e.letters.join(', ') });
			case 'unknown_codon':
				return tr('cw_warn_unknown_codon', { list: e.letters.join(', ') });
			case 'unknown_aa':
				return tr('cw_warn_unknown_aa', { list: e.letters.join(', ') });
			case 'no_codon':
				return e.letters[0] === '*'
					? tr('cw_warn_no_stop')
					: tr('cw_warn_no_codon', { aa: e.letters[0] ?? '' });
			default:
				return e.message;
		}
	}

	function runOptimize() {
		run = null;
		runError = null;
		if (!dataset) {
			runError = { code: 'no_dataset', message: tr('cw_warn_no_dataset') };
			return;
		}
		const seq = inputText.replace(/\s+/g, '');
		if (!seq) {
			runError = { code: 'empty', message: tr('cw_warn_empty') };
			return;
		}

		try {
			if (mode === 'dna') {
				const beforeDna = seq.toUpperCase();
				const originalCodons = beforeDna.match(/.{3}/g) ?? [];
				const result = optimizeCds(beforeDna, dataset.code.codonToAa, dataset.usage);
				run = {
					result,
					mode,
					datasetLabel: datasetLabel(dataset),
					beforeDna,
					beforeCai: cai(originalCodons, dataset.usage, dataset.code.codonToAa),
					beforeGc: gcContent(beforeDna),
					originalCodons,
					missingUsage: result.codons.filter((c) => c.frequency === null).length,
					internalStop: result.protein.slice(0, -1).includes('*'),
					appendedStop: result.codons.length > originalCodons.length
				};
			} else {
				const protein = seq.toUpperCase();
				const result = optimizeProtein(protein, dataset.code.codonToAa, dataset.usage);
				run = {
					result,
					mode,
					datasetLabel: datasetLabel(dataset),
					beforeDna: null,
					beforeCai: null,
					beforeGc: null,
					originalCodons: [],
					missingUsage: result.codons.filter((c) => c.frequency === null).length,
					internalStop: protein.slice(0, -1).includes('*'),
					appendedStop: !protein.endsWith('*')
				};
			}
		} catch (e) {
			if (e instanceof CodonOptimizeError) {
				runError = { code: e.code, message: optimizeErrorMessage(e) };
			} else {
				runError = { code: 'error', message: errText(e) };
			}
		}
	}

	async function copyText(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toastOk(tr('cw_copied'));
		} catch {
			toastErr(tr('cw_copy_fail'));
		}
	}

	function fmtCai(value: number): string {
		return Number.isFinite(value) ? value.toFixed(3) : '—';
	}

	function fmtGc(value: number): string {
		return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
	}

	function fmtFreq(value: number): string {
		return String(Math.round(value * 10000) / 10000);
	}

	function aaText(aa: string): string {
		return aa === '*' ? tr('codon_stop') : `${aa} · ${AA3[aa] ?? aa}`;
	}

	function clearRun() {
		inputText = '';
		run = null;
		runError = null;
	}
</script>

<div class="space-y-4">
	<div>
		<h1 class="flex items-center gap-1.5 text-2xl font-bold">
			{tr('cw_title')}
			<InfoTip text={tr('cw_intro')} label={`${tr('cw_title')} — ${tr('common_more_info')}`} class="mt-1" />
		</h1>
	</div>

	<Section
		title={tr('cw_mode_title')}
		hint={mode === 'protein' ? tr('cw_mode_hint_protein') : tr('cw_mode_hint_dna')}
	>
		<div class="flex flex-wrap gap-2">
			<Button
				size="sm"
				variant={mode === 'protein' ? 'primary' : 'outline'}
				onclick={() => setMode('protein')}>{tr('cw_mode_protein')}</Button
			>
			<Button
				size="sm"
				variant={mode === 'dna' ? 'primary' : 'outline'}
				onclick={() => setMode('dna')}>{tr('cw_mode_dna')}</Button
			>
		</div>
		<label class="mt-3 block text-xs">
			<span class="mb-1 block text-muted-foreground">
				{mode === 'protein' ? tr('cw_seq_label_protein') : tr('cw_seq_label_dna')}
			</span>
			<Textarea
				name="cw_input"
				bind:value={inputText}
				rows={7}
				monospace
				spellcheck={false}
				placeholder={mode === 'protein'
					? tr('cw_seq_placeholder_protein')
					: tr('cw_seq_placeholder_dna')}
			/>
		</label>

		<div class="mt-2 flex flex-wrap items-center gap-2">
			<Button onclick={runOptimize} disabled={!dataset || !inputText.trim()}>{tr('cw_run')}</Button>
			<Button size="sm" variant="ghost" onclick={clearRun}>{tr('cw_clear')}</Button>
			<span class="text-xs text-muted-foreground">
				{tr('cw_seq_len', { n: inputText.replace(/\s+/g, '').length })}
			</span>
		</div>
	</Section>

	<Section title={tr('cw_dataset_title')}>
		{#if listLoading}
			<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
		{:else if listError}
			<p
				class="rounded-none border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive"
			>
				{listError}
			</p>
		{:else if !choices.length}
			<p class="text-sm text-muted-foreground">{tr('cw_dataset_empty')}</p>
		{:else}
			<label class="block max-w-xl text-xs">
				<span class="mb-1 block text-muted-foreground">{tr('cw_dataset_select')}</span>
				<Select
					name="cw_dataset"
					bind:value={selectedValue}
					options={datasetOptions}
					placeholder={tr('cw_dataset_placeholder')}
					onchange={onChoiceChange}
				/>
			</label>
		{/if}

		{#if datasetLoading}
			<p class="mt-2 text-xs text-muted-foreground">{tr('common_loading')}</p>
		{/if}
		{#if datasetError}
			<p
				class="mt-2 rounded-none border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
			>
				{datasetError}
			</p>
		{/if}

		{#if dataset}
			<div class="mt-3 space-y-1.5 text-xs">
				<div class="flex flex-wrap items-center gap-2">
					<a class="underline" href="/codon-usage/{dataset.row.id}"
						>{dataset.row.title || dataset.row.source || dataset.row.id}</a
					>
					<code class="font-mono text-[10px] text-muted-foreground break-all">{dataset.row.id}</code
					>
					{#if dataset.taxonId != null}
						<span>{tr('cw_taxon')} {dataset.taxonId}</span>
					{/if}
					{#if dataset.speciesName}
						<span class="break-words">{dataset.speciesName}</span>
					{/if}
					{#if dataset.row.selectionMode}
						<span>{dataset.row.selectionMode}</span>
					{/if}
					<span class="text-muted-foreground">{tr('cw_usage_entries', { n: usageEntries })}</span>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-muted-foreground">{tr('cw_code_label')}:</span>
					{#if dataset.syntheticCode}
						<span>{dataset.code.name}</span>
					{:else}
						<a class="underline" href="/genetic-codes/{dataset.code.id}">{dataset.code.name}</a>
					{/if}
					<span>NCBI {dataset.code.ncbiTableId}</span>
					{#if dataset.codeFallback}<Badge tone="warn">{tr('cw_code_fallback')}</Badge>{/if}
				</div>
				{#if datasetNotice}
					<p class="text-amber-800 dark:text-amber-300">{datasetNotice}</p>
				{/if}
			</div>
		{/if}

		<div class="mt-4 border-t pt-3">
			<p class="mb-2 flex items-center gap-1.5 text-xs font-medium">
				{tr('cw_taxon_title')}
				<InfoTip text={tr('cw_taxon_hint')} label={`${tr('cw_taxon_title')} — ${tr('common_more_info')}`} />
			</p>
			<div class="flex flex-wrap items-end gap-2">
				<label class="block text-xs">
					<span class="mb-1 block text-muted-foreground">{tr('cw_taxon_label')}</span>
					<Input name="cw_taxon" bind:value={taxonInput} class="h-8 w-40" placeholder="9606" />
				</label>
				<Button
					size="sm"
					variant="outline"
					onclick={() => void loadTaxon()}
					disabled={taxonLoading || !taxonInput.trim()}
					>{taxonLoading ? tr('common_loading') : tr('cw_taxon_load')}</Button
				>
			</div>
			{#if taxonMessage}
				<p class="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{taxonMessage}</p>
			{/if}
			{#if taxonError}
				<p class="mt-2 text-xs text-amber-800 dark:text-amber-300">{taxonError}</p>
			{/if}
		</div>
	</Section>

	{#if runError}
		<Section title={tr('cw_error_title')}>
			<p
				class="rounded-none border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive"
			>
				{runError.message}
			</p>
		</Section>
	{/if}

	{#if run}
		<Section title={tr('cw_result_title')}>
			<p class="mb-3 text-xs text-muted-foreground">
				{tr('cw_result_context', {
					dataset: run.datasetLabel,
					kind: run.mode === 'dna' ? tr('cw_mode_dna') : tr('cw_mode_protein')
				})}
			</p>
			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
				<div class="border p-2.5">
					<p class="text-[11px] text-muted-foreground">{tr('cw_metric_cai')}</p>
					<p class="font-mono text-xl">{fmtCai(run.result.metrics.cai)}</p>
					<p class="text-[11px] text-muted-foreground">
						{run.beforeCai === null
							? tr('cw_no_before_short')
							: tr('cw_before_value', { value: fmtCai(run.beforeCai) })}
					</p>
				</div>
				<div class="border p-2.5">
					<p class="text-[11px] text-muted-foreground">{tr('cw_metric_gc')}</p>
					<p class="font-mono text-xl">{fmtGc(run.result.metrics.gc)}</p>
					<p class="text-[11px] text-muted-foreground">
						{run.beforeGc === null
							? tr('cw_no_before_short')
							: tr('cw_before_value', { value: fmtGc(run.beforeGc) })}
					</p>
				</div>
				<div class="border p-2.5">
					<p class="text-[11px] text-muted-foreground">{tr('cw_metric_length')}</p>
					<p class="font-mono text-xl">{tr('cw_bp_value', { n: run.result.metrics.length })}</p>
					<p class="text-[11px] text-muted-foreground">
						{tr('cw_aa_value', { n: run.result.protein.replace(/\*/g, '').length })}
					</p>
				</div>
				<div class="border p-2.5">
					<p class="text-[11px] text-muted-foreground">{tr('cw_metric_rare')}</p>
					<p class="font-mono text-xl">{run.result.metrics.rareCount}</p>
					<p class="text-[11px] text-muted-foreground">
						{tr('cw_metric_rare_hint', { pct: Math.round(DEFAULT_RARE_THRESHOLD * 100) })}
					</p>
				</div>
			</div>

			{#if warnings.length}
				<div
					class="mt-3 border border-amber-500/30 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
				>
					<p class="mb-1 font-medium">{tr('cw_warnings_title')}</p>
					<ul class="list-inside list-disc space-y-0.5">
						{#each warnings as warning, i (i)}<li>{warning}</li>{/each}
					</ul>
				</div>
			{/if}
		</Section>

		<Section title={tr('cw_sequence_title')}>
			{#if run.beforeDna}
				<div class="mb-4">
					<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
						<span class="text-xs font-medium">{tr('cw_dna_before')}</span>
						<Button size="xs" variant="outline" onclick={() => void copyText(run?.beforeDna ?? '')}
							>{tr('cw_copy')}</Button
						>
					</div>
					<pre
						class="max-h-64 overflow-auto whitespace-pre-wrap break-all border bg-muted/30 p-2 font-mono text-xs">{run.beforeDna}</pre>
				</div>
			{/if}

			<div>
				<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
					<span class="text-xs font-medium">{tr('cw_dna_after')}</span>
					<Button size="xs" variant="outline" onclick={() => void copyText(run?.result.dna ?? '')}
						>{tr('cw_copy')}</Button
					>
				</div>
				<pre
					class="max-h-64 overflow-auto whitespace-pre-wrap break-all border bg-emerald-50/40 p-2 font-mono text-xs dark:bg-emerald-500/5">{run
						.result.dna}</pre>
			</div>

			<div class="mt-4">
				<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
					<span class="text-xs font-medium">{tr('cw_protein')}</span>
					<Button
						size="xs"
						variant="outline"
						onclick={() => void copyText(run?.result.protein ?? '')}>{tr('cw_copy')}</Button
					>
				</div>
				<pre
					class="max-h-64 overflow-auto whitespace-pre-wrap break-all border bg-muted/30 p-2 font-mono text-xs">{run
						.result.protein}</pre>
			</div>

			{#if run.mode === 'protein'}
				<p class="mt-2 text-xs text-muted-foreground">{tr('cw_no_before_dna')}</p>
			{/if}
		</Section>

		{#if run.mode === 'dna'}
			<Section title={tr('cw_table_codons_title')} hint={tr('cw_table_codons_hint')}>
				<div class="w-full overflow-x-auto">
					<table class="w-full border-collapse text-xs">
						<thead>
							<tr class="bg-muted/40 text-left">
								<th class="whitespace-nowrap p-1.5 font-medium">{tr('cw_position')}</th>
								<th class="whitespace-nowrap p-1.5 font-medium">{tr('cw_original')}</th>
								<th class="p-1.5 font-medium" aria-hidden="true">→</th>
								<th class="whitespace-nowrap p-1.5 font-medium">{tr('cw_optimized')}</th>
								<th class="whitespace-nowrap p-1.5 font-medium">{tr('cw_aa')}</th>
								<th class="whitespace-nowrap p-1.5 font-medium">{tr('cw_frequency')}</th>
							</tr>
						</thead>
						<tbody>
							{#each run.result.codons as codon, i (i)}
								<tr class={codon.changed ? 'bg-sky-500/10' : ''}>
									<td class="p-1.5 tabular-nums">{i + 1}</td>
									<td class="whitespace-nowrap p-1.5 font-mono">
										{run.originalCodons[i] ?? '—'}
									</td>
									<td class="p-1.5 text-muted-foreground">→</td>
									<td
										class="whitespace-nowrap p-1.5 font-mono {codon.changed
											? 'font-semibold text-sky-700 dark:text-sky-300'
											: ''}"
									>
										{codon.codon}
									</td>
									<td class="whitespace-nowrap p-1.5">{aaText(codon.aa)}</td>
									<td class="whitespace-nowrap p-1.5 tabular-nums">
										{codon.frequency === null ? tr('cw_missing_usage') : fmtFreq(codon.frequency)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Section>
		{:else}
			<Section title={tr('cw_table_choices_title')} hint={tr('cw_table_choices_hint')}>
				<div class="w-full overflow-x-auto">
					<table class="w-full border-collapse text-xs">
						<thead>
							<tr class="bg-muted/40 text-left">
								<th class="whitespace-nowrap p-1.5 font-medium">{tr('cw_position')}</th>
								<th class="whitespace-nowrap p-1.5 font-medium">{tr('cw_aa')}</th>
								<th class="whitespace-nowrap p-1.5 font-medium">{tr('cw_optimized')}</th>
								<th class="whitespace-nowrap p-1.5 font-medium">{tr('cw_frequency')}</th>
								<th class="whitespace-nowrap p-1.5 font-medium">{tr('cw_note')}</th>
							</tr>
						</thead>
						<tbody>
							{#each run.result.codons as codon, i (i)}
								<tr>
									<td class="p-1.5 tabular-nums">{i + 1}</td>
									<td class="whitespace-nowrap p-1.5">{aaText(codon.aa)}</td>
									<td class="whitespace-nowrap p-1.5 font-mono">{codon.codon}</td>
									<td class="whitespace-nowrap p-1.5 tabular-nums">
										{codon.frequency === null ? tr('cw_missing_usage') : fmtFreq(codon.frequency)}
									</td>
									<td class="whitespace-nowrap p-1.5">
										{#if run.appendedStop && i === run.result.codons.length - 1}
											<Badge tone="info">{tr('cw_appended_stop')}</Badge>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Section>
		{/if}
	{/if}
</div>

<svelte:head><title>{tr('cw_title')} · SPD</title></svelte:head>
