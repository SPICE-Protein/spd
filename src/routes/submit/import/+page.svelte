<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { tr, fieldLabel } from '$lib/i18n';
	import { session } from '$lib/state/session.svelte';
	import { downloadText } from '$lib/export/download';
	import { parseImportText, toCsv } from '$lib/import/csv';
	import type { ParsedTable } from '$lib/import/csv';
	import {
		IMPORT_EXCLUDED,
		IMPORT_KINDS,
		extractReceiptId,
		importKindById,
		resolveColumns,
		rowToBody
	} from '$lib/import/kinds';
	import type { Column } from '$lib/components/table';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Button from '$lib/components/Button.svelte';
	import Select from '$lib/components/Select.svelte';
	import Textarea from '$lib/components/Textarea.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';

	/**
	 * Batch import for the existing create clients. Nothing here writes to SPD
	 * storage directly: each row is mapped onto a documented create body and
	 * sent to the normal server endpoint, sequentially, so a failure is a
	 * normal API error for that one row and the rest of the batch continues.
	 */
	const PREVIEW_LIMIT = 20;

	type ResultRow = {
		/** zero-based index into the parsed data rows */
		row: number;
		status: 'ok' | 'fail';
		id: string;
		error: string;
	};

	const kindOptions = IMPORT_KINDS.map((k) => ({ value: k.id, label: tr(k.labelKey) }));
	let kindId = $state(IMPORT_KINDS[0]?.id ?? '');
	const kind = $derived(importKindById(kindId) ?? IMPORT_KINDS[0]);

	let rawText = $state('');
	let fileName = $state('');
	let parseError = $state('');
	let table = $state<ParsedTable | null>(null);
	let fileInput = $state<HTMLInputElement>();

	let running = $state(false);
	let processed = $state(0);
	let results = $state<ResultRow[]>([]);

	// Parse on every source change. The effect owns table/parseError, so the
	// rest of the page can just read the last good parse.
	$effect(() => {
		const text = rawText;
		table = null;
		parseError = '';
		if (!text.trim()) return;
		try {
			table = parseImportText(text);
		} catch (e) {
			parseError = e instanceof Error ? e.message : String(e);
		}
	});

	const mapping = $derived(table ? resolveColumns(kind, table.headers) : null);
	const missingRequired = $derived(mapping?.missing ?? []);

	const previewRows = $derived.by<Array<Record<string, string>>>(() => {
		const t = table;
		const m = mapping;
		if (!t || !m) return [];
		return t.rows.slice(0, PREVIEW_LIMIT).map((row) => {
			const record: Record<string, string> = {};
			for (const column of m.present) record[column.key] = row[m.byKey[column.key]] ?? '';
			return record;
		});
	});

	const previewColumns = $derived.by<Column<Record<string, string>>[]>(() => {
		const m = mapping;
		if (!m) return [];
		return m.present.map((column) => ({
			key: column.key,
			label: `${fieldLabel(column.key)}${column.required ? ' *' : ''}`
		}));
	});

	const okCount = $derived(results.filter((r) => r.status === 'ok').length);
	const failedCount = $derived(results.length - okCount);
	const totalRows = $derived(table?.rows.length ?? 0);
	const percent = $derived(totalRows === 0 ? 0 : Math.round((processed / totalRows) * 100));
	const canStart = $derived(!running && !!table && totalRows > 0 && missingRequired.length === 0);

	function resetRun() {
		if (running) return;
		results = [];
		processed = 0;
	}

	async function readFile(event: Event) {
		if (running) return;
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		// clear the native value so re-picking the same file fires `change` again
		input.value = '';
		if (!file) return;
		resetRun();
		fileName = file.name;
		try {
			rawText = await file.text();
		} catch (e) {
			parseError = e instanceof Error ? e.message : String(e);
		}
	}

	function clearAll() {
		if (running) return;
		rawText = '';
		fileName = '';
		parseError = '';
		table = null;
		resetRun();
		if (fileInput) fileInput.value = '';
	}

	async function start() {
		const current = table;
		const map = mapping;
		const currentKind = kind;
		if (!canStart || !current || !map || !currentKind) return;

		running = true;
		processed = 0;
		results = [];
		try {
			for (let i = 0; i < current.rows.length; i++) {
				const built = rowToBody(currentKind, current.rows[i], map.byKey);
				if (built.error || !built.body) {
					results.push({
						row: i,
						status: 'fail',
						id: '',
						error: built.error ?? 'Invalid row'
					});
				} else {
					try {
						const receipt = await currentKind.create(built.body);
						const id = extractReceiptId(receipt);
						results.push({
							row: i,
							status: 'ok',
							id,
							error: ''
						});
						// `origin: 'batch-import'` rides the create body (see
						// kinds.ts); the server keeps the row out of "my
						// submissions" and lists it under "my imports".
					} catch (e) {
						results.push({
							row: i,
							status: 'fail',
							id: '',
							error: e instanceof Error ? e.message : String(e)
						});
					}
				}
				processed = i + 1;
				await tick();
			}
		} finally {
			running = false;
		}
	}

	function downloadFailed() {
		const current = table;
		if (!current || failedCount === 0) return;
		const rows: Array<Record<string, string>> = [];
		for (const result of results) {
			if (result.status !== 'fail') continue;
			const row = current.rows[result.row];
			if (row) rows.push(row);
		}
		const stamp = new Date().toISOString().slice(0, 10);
		downloadText(
			`failed-${kind.id}-${stamp}.csv`,
			toCsv(current.headers, rows),
			'text/csv;charset=utf-8'
		);
	}
</script>

<div class="mx-auto max-w-4xl space-y-4">
	<div>
		<h1 class="flex items-center gap-1.5 text-2xl font-bold">
			{tr('import_title')}
			<InfoTip text={tr('import_intro')} label={`${tr('import_title')} — ${tr('common_more_info')}`} class="mt-1" />
		</h1>
	</div>

	<p class="text-xs text-muted-foreground">{tr('import_not_submission')}</p>

	{#if !session.signedIn}
		<div
			class="flex flex-wrap items-center gap-3 rounded-none border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
		>
			{tr('submit_login_needed')}
			<Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		</div>
	{/if}

	<Section title={tr('import_kind')}>
		<Select
			name="import_kind"
			bind:value={kindId}
			options={kindOptions}
			disabled={running}
			onchange={resetRun}
		/>
		<p class="mt-2 text-xs text-muted-foreground">
			{tr('import_required_columns')}:
			<span class="font-mono"
				>{kind.columns
					.filter((c) => c.required)
					.map((c) => c.key)
					.join(', ')}</span
			>
		</p>
		{#if kind.noteKey}
			<p class="mt-1 text-xs text-muted-foreground">{tr(kind.noteKey)}</p>
		{/if}
		<p class="mt-1 text-xs text-muted-foreground">
			<a class="underline" href={resolve('/submit')}>{tr('nav_submit')}</a>
		</p>

		{#if IMPORT_EXCLUDED.length > 0}
			<div class="mt-3 border-t pt-2 text-xs text-muted-foreground">
				<p>{tr('import_excluded')}</p>
				<ul class="mt-1 list-disc pl-4">
					{#each IMPORT_EXCLUDED as excluded (excluded.id)}
						<li>
							<span class="font-mono">{excluded.id}</span> — {tr(excluded.reasonKey)}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</Section>

	<Section title={tr('import_file')} hint={tr('import_paste_hint')}>
		<div class="flex flex-wrap items-center gap-2">
			<Button size="sm" variant="outline" disabled={running} onclick={() => fileInput?.click()}>
				{tr('import_file')}
			</Button>
			{#if fileName}<span class="font-mono text-xs text-muted-foreground">{fileName}</span>{/if}
			{#if rawText}
				<Button size="xs" variant="ghost" disabled={running} onclick={clearAll}>
					{tr('common_clear')}
				</Button>
			{/if}
			<input
				bind:this={fileInput}
				type="file"
				accept=".csv,.tsv,.tab,.json,text/csv,text/tab-separated-values,application/json"
				class="hidden"
				onchange={readFile}
			/>
		</div>

		<label class="mt-3 mb-1 block text-xs text-muted-foreground" for="f-import_paste">
			{tr('import_paste')}
		</label>
		<Textarea
			name="import_paste"
			bind:value={rawText}
			rows={10}
			monospace
			disabled={running}
			placeholder="name,partType,sequence,description"
			oninput={resetRun}
		/>
	</Section>

	{#if parseError}
		<p class="rounded-none bg-destructive/10 p-2 text-sm text-destructive">{parseError}</p>
	{:else if table}
		<Section title={tr('import_preview')}>
			<div class="flex flex-wrap items-center gap-2">
				<Badge tone="neutral">{tr('import_rows')}: {table.rows.length}</Badge>
				{#if mapping}
					<Badge tone="info">{tr('import_columns')}: {mapping.present.length}</Badge>
				{/if}
			</div>

			{#if missingRequired.length > 0}
				<p
					class="mt-2 rounded-none border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
				>
					{tr('import_missing_columns')}:
					<span class="font-mono">{missingRequired.join(', ')}</span>
				</p>
			{/if}

			{#if table.rows.length === 0}
				<p class="mt-3 text-sm text-muted-foreground">{tr('import_no_rows')}</p>
			{:else}
				<div class="mt-3">
					<DataTable rows={previewRows} columns={previewColumns} />
				</div>
				{#if table.rows.length > PREVIEW_LIMIT}
					<p class="mt-1 text-xs text-muted-foreground">
						{tr('import_preview_capped', { shown: PREVIEW_LIMIT, total: table.rows.length })}
					</p>
				{/if}
				{#if mapping && mapping.ignored.length > 0}
					<p class="mt-1 text-xs text-muted-foreground">
						{tr('import_ignored_columns')}:
						<span class="font-mono">{mapping.ignored.join(', ')}</span>
					</p>
				{/if}
			{/if}
		</Section>
	{/if}

	{#if table && totalRows > 0 && missingRequired.length === 0}
		<Section title={tr('import_start')} hint={tr('import_sequential')}>
			<div class="flex flex-wrap items-center gap-3">
				<Button onclick={start} disabled={!canStart || !session.signedIn}>
					{tr('import_start')}
				</Button>
				{#if running || processed > 0}
					<span class="text-xs text-muted-foreground">
						{tr('import_progress')}: {processed} / {totalRows}
					</span>
				{/if}
			</div>
			{#if running || processed > 0}
				<div class="mt-2 h-1.5 w-full bg-muted">
					<div class="h-full bg-primary transition-all" style={`width: ${percent}%`}></div>
				</div>
			{/if}
		</Section>
	{/if}

	{#if results.length > 0}
		<Section title={tr('import_result')}>
			<div class="mb-2 flex flex-wrap items-center gap-2">
				<Badge tone="ok">{tr('import_success')}: {okCount}</Badge>
				<Badge tone="bad">{tr('import_failed')}: {failedCount}</Badge>
				{#if failedCount > 0}
					<Button size="xs" variant="outline" onclick={downloadFailed}>
						{tr('import_download_failed')}
					</Button>
				{/if}
			</div>

			<div class="max-h-96 overflow-auto ring-1 ring-foreground/10">
				<Table>
					<TableHeader class="bg-muted/40">
						<TableRow>
							<TableHead class="w-16 whitespace-nowrap">#</TableHead>
							<TableHead class="w-24 whitespace-nowrap">{fieldLabel('status')}</TableHead>
							<TableHead class="whitespace-nowrap">{fieldLabel('detail')}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each results as result (result.row)}
							<TableRow>
								<TableCell class="align-top font-mono">{result.row + 1}</TableCell>
								<TableCell class="align-top">
									<Badge tone={result.status === 'ok' ? 'ok' : 'bad'}>
										{result.status === 'ok' ? tr('import_success') : tr('import_failed')}
									</Badge>
								</TableCell>
								<TableCell class="max-w-xl align-top break-words">
									{#if result.status === 'ok'}
										<span class="font-mono">{result.id || '—'}</span>
									{:else}
										<span class="text-destructive">{result.error}</span>
									{/if}
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		</Section>
	{/if}
</div>

<svelte:head><title>{tr('import_title')} · SPD</title></svelte:head>
