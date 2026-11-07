<script lang="ts">
	import { page } from '$app/state';
	import { artifacts, search, vectors } from '$lib/api/client';
	import type { SearchHit } from '$lib/api/types';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/components/table';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import ProvenancePanel from '$lib/components/ProvenancePanel.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import RecordActions from '$lib/components/RecordActions.svelte';
	import Checkbox from '$lib/components/Checkbox.svelte';
	import PlasmidMap from '$lib/gene/PlasmidMap.svelte';
	import ExportMenu from '$lib/components/ExportMenu.svelte';
	import { ENGINEERED_REGION, fileStem, toFasta, toGenbank, toSbol3 } from '$lib/export/bio';
	import type { ExportFeature, Molecule } from '$lib/export/bio';

	/**
	 * Vector template page, sectioned after Addgene (name + backbone badges,
	 * key-facts grid, feature table, plasmid map, supplier block) and NCBI
	 * (GenBank FEATURES/ORIGIN flatfile, FASTA, numbered sequence lines).
	 * SPD stores the design record only — the sequence lives behind its
	 * artifact, fetched lazily through /artifacts/:id/content.
	 */
	const id = $derived(page.params.id ?? '');

	let row = $state<Record<string, unknown> | null>(null);
	let error = $state('');
	let tab = $state('overview');
	let check = $state<{
		valid: boolean;
		checks: { name?: string; status?: string; message?: string }[];
		warnings: string[];
	} | null>(null);
	let strict = $state(false);

	async function load() {
		try {
			row = (await vectors.get(id)) as unknown as Record<string, unknown>;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}
	$effect(() => void load());

	async function runValidate() {
		check = null;
		try {
			check = await vectors.validate(id, { strict: strict || undefined });
		} catch (e) {
			toastErr(e);
		}
	}

	const features = $derived(
		Array.isArray(row?.features) ? (row.features as Record<string, unknown>[]) : []
	);
	const sites = $derived(
		Array.isArray(row?.insertionSites) ? (row.insertionSites as Record<string, unknown>[]) : []
	);
	const suppliers = $derived(
		Array.isArray(row?.suppliers) ? (row.suppliers as Record<string, unknown>[]) : []
	);

	function num(v: unknown): number | null {
		return typeof v === 'number' && Number.isFinite(v) ? v : null;
	}

	// ------------------------------------------------------------- sequence --
	// Artifact bytes can arrive as bare bases, FASTA, or GenBank; strip the
	// container down to A/C/G/T before anything reads them (map + views).
	let rawText = $state('');
	let seqLoading = $state(false);
	let seqError = $state('');
	let seqLoaded = $state(false);
	let seqView = $state<'genbank' | 'fasta' | 'raw'>('genbank');

	const seq = $derived.by(() => {
		let t = rawText;
		if (/^\s*LOCUS/m.test(t)) {
			const m = t.match(/ORIGIN\s+([\s\S]*?)\/\//);
			t = m ? m[1] : '';
		} else if (/^\s*>/.test(t)) {
			t = t
				.split('\n')
				.filter((l) => !/^\s*>/.test(l))
				.join('');
		}
		return t.replace(/[^A-Za-z]/g, '').toUpperCase();
	});
	const seqLen = $derived(seq.length);

	async function loadSequence() {
		const aid = String(row?.sequenceArtifactId ?? '');
		if (!aid || seqLoaded || seqLoading) return;
		seqLoading = true;
		seqError = '';
		try {
			rawText = await artifacts.content(aid);
			seqLoaded = true;
		} catch (e) {
			seqError = e instanceof Error ? e.message : String(e);
		} finally {
			seqLoading = false;
		}
	}
	$effect(() => {
		if (tab === 'sequence') void loadSequence();
	});

	// ------------------------------------------------------------ derived ---
	// Construct payloads mirror the assembly record and carry vectorId; the
	// LIKE search over api_records finds every construct citing this vector.
	interface ConstructRow {
		constructId?: string;
		cassetteId?: string;
		createdAt?: number;
		[key: string]: unknown;
	}
	let constructs = $state<ConstructRow[]>([]);

	async function loadConstructs() {
		if (!id) return;
		try {
			// The route id is the vector's public id, so this search does not
			// have to wait for the vector payload to arrive.
			const env = await search.run({ q: id, entityType: 'construct', limit: 50 });
			const hits = Array.isArray(env.data) ? (env.data as SearchHit[]) : [];
			constructs = hits
				.map(
					(h) =>
						({ ...(h.payload as Record<string, unknown>), createdAt: h.createdAt }) as ConstructRow
				)
				.filter((p) => p.constructId);
		} catch {
			constructs = [];
		}
	}
	$effect(() => {
		if (id) void loadConstructs();
	});

	// -------------------------------------------------------------- map model --
	const TOTAL_LEN = $derived(
		seqLen || Math.max(0, ...features.map((f) => num(f.end) ?? num(f.start) ?? 0))
	);
	const placed = $derived(features.filter((f) => num(f.start) != null && num(f.end) != null));
	const unplaced = $derived(features.filter((f) => num(f.start) == null || num(f.end) == null));

	// Feature colors hash the type, so every CDS shares one hue across
	// vectors and the canvas painter takes the hex directly.
	const PALETTE = [
		'#10b981',
		'#0ea5e9',
		'#f59e0b',
		'#8b5cf6',
		'#f43f5e',
		'#14b8a6',
		'#6366f1',
		'#f97316'
	];
	function colorOf(type: string): string {
		let h = 0;
		for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
		return PALETTE[h % PALETTE.length];
	}

	const circular = $derived(String(row?.topology ?? 'circular') === 'circular');

	// The ported GUI map consumes its own feature/site shapes (numeric ids,
	// 1-based inclusive ranges); SPD's record fields map onto it directly.
	const mapFeatures = $derived(
		placed.map((f, i) => ({
			id: i,
			name: String(f.id ?? f.type ?? `feature ${i + 1}`),
			start: num(f.start) as number,
			end: num(f.end) as number,
			type: String(f.type ?? 'feature'),
			color: colorOf(String(f.type ?? 'feature')),
			forward: !(num(f.strand) === -1 || String(f.strand) === '-')
		}))
	);
	const mapSites = $derived(
		sites
			.map((s) => ({
				name: String(s.id ?? ''),
				pos: num(s.position) ?? 0,
				seq: String(s.recognition ?? s.enzyme ?? ''),
				color: '#8b96b5'
			}))
			.filter((x) => x.name && x.pos > 0)
	);
	// The map measures itself off the sequence; feature extents stand in
	// until the artifact loads real bases.
	const mapSeq = $derived(seq || (TOTAL_LEN ? 'N'.repeat(TOTAL_LEN) : ''));

	// -------------------------------------------------------- genbank view ---
	function gbLoc(f: Record<string, unknown>): string {
		const s = num(f.start) as number;
		const e = num(f.end) as number;
		const strand = f.strand;
		const minus = strand === -1 || strand === '-';
		const wrap = circular && e < s;
		const base = wrap ? `join(${s}..${TOTAL_LEN},1..${e})` : `${s}..${e}`;
		return minus ? `complement(${base})` : base;
	}
	function gbQualifiers(f: Record<string, unknown>): string[] {
		const out: string[] = [];
		for (const [k, v] of Object.entries(f)) {
			if (['id', 'type', 'start', 'end', 'strand'].includes(k) || v == null) continue;
			const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
			out.push(`                     /${k}="${val}"`);
		}
		return out;
	}
	const genbank = $derived.by(() => {
		const name = String(row?.name ?? 'vector');
		const locusName = name.replace(/\s+/g, '_').slice(0, 16);
		const mol = /rna/i.test(String(row?.format ?? '')) ? 'RNA' : 'DNA';
		const head = [
			`LOCUS       ${locusName.padEnd(17)}${String(TOTAL_LEN).padStart(6, ' ')} bp ${mol}      ${circular ? 'circular' : 'linear'}   SPD`,
			`DEFINITION  ${name}.`,
			`ACCESSION   ${String(row?.id ?? '')}`,
			`VERSION     SPD-${String(row?.schemaVersion ?? 1)}`,
			`SOURCE      synthetic construct`,
			`  ORGANISM  synthetic construct`,
			`FEATURES             Location/Qualifiers`
		];
		const feats: string[] = [];
		for (const f of placed) {
			feats.push(
				`     ${String(f.type ?? 'misc_feature')
					.toUpperCase()
					.padEnd(16)}${gbLoc(f)}`
			);
			feats.push(...gbQualifiers(f));
		}
		for (const s of sites) {
			const p = num(s.position);
			feats.push(`     ${'misc_feature'.padEnd(16)}${p != null ? `${p}..${p}` : 'unknown'}`);
			feats.push(`                     /label="${String(s.id ?? 'insertion site')}"`);
			feats.push(`                     /note="SPD insertion site"`);
		}
		let origin = 'ORIGIN';
		if (seq) {
			const lines: string[] = [];
			for (let i = 0; i < seq.length; i += 60) {
				const chunk = seq.slice(i, i + 60);
				lines.push(
					`${String(i + 1).padStart(9)} ${(chunk.match(/.{1,10}/g) ?? [chunk]).join(' ')}`
				);
			}
			origin += '\n' + lines.join('\n');
		}
		return [...head, ...feats, origin, '//'].join('\n');
	});
	const fasta = $derived(
		`>${name_or('vector')}\n${(seq || '').match(/.{1,60}/g)?.join('\n') ?? ''}`
	);
	function name_or(fallback: string): string {
		const n = String(row?.name ?? '');
		return (n || fallback) + ` | ${String(row?.id ?? '')} | ${TOTAL_LEN} bp`;
	}

	// Export features are 1-based inclusive, the same frame SPD stores. A
	// circular feature that wraps the origin is split into two features rather
	// than emitted as a join: the writer is plain GenBank, not a splice map.
	const exportMolecule: Molecule = $derived(/rna/i.test(String(row?.format ?? '')) ? 'rna' : 'dna');
	const exportBase = $derived(fileStem(String(row?.name ?? 'vector'), String(row?.id ?? '')));
	const exportFeatures = $derived.by((): ExportFeature[] => {
		const out: ExportFeature[] = [];
		for (const f of placed) {
			const start = num(f.start);
			const end = num(f.end);
			if (start == null || end == null || start < 1) continue;
			const type = String(f.type ?? 'misc_feature');
			const name = String(f.id ?? f.type ?? 'feature');
			const strand: 1 | -1 = num(f.strand) === -1 || String(f.strand) === '-' ? -1 : 1;
			if (circular && end < start && seq.length) {
				out.push({ type, name: `${name} (1/2)`, start, end: seq.length, strand });
				out.push({ type, name: `${name} (2/2)`, start: 1, end, strand });
			} else if (end >= start) {
				out.push({ type, name, start, end, strand });
			}
		}
		for (const site of sites) {
			const pos = num(site.position);
			if (pos == null || pos < 1) continue;
			out.push({
				type: 'misc_feature',
				name: String(site.id ?? 'insertion site'),
				start: pos,
				end: pos,
				strand: 1
			});
		}
		return out;
	});
	const exportFormats = $derived([
		{
			key: 'genbank',
			label: tr('export_genbank'),
			filename: `${exportBase}.gb`,
			disabled: !seqLoaded || !seq,
			build: () =>
				toGenbank({
					name: String(row?.name ?? 'vector'),
					description: String(row?.id ?? ''),
					sequence: seq,
					molecule: exportMolecule,
					circular,
					features: exportFeatures
				})
		},
		{
			key: 'fasta',
			label: 'FASTA',
			filename: `${exportBase}.fasta`,
			disabled: !seqLoaded || !seq,
			build: () =>
				toFasta({
					name: String(row?.name ?? 'vector'),
					description: String(row?.id ?? ''),
					sequence: seq,
					molecule: exportMolecule
				})
		},
		{
			key: 'sbol3',
			label: tr('export_sbol3'),
			filename: `${exportBase}.sbol3.json`,
			mime: 'application/json',
			disabled: !seqLoaded || !seq,
			build: () =>
				toSbol3({
					id: String(row?.id ?? ''),
					name: String(row?.name ?? 'vector'),
					description: String(row?.id ?? ''),
					sequence: seq,
					molecule: exportMolecule,
					role: ENGINEERED_REGION
				})
		}
	]);

	// ---------------------------------------------------------------- tables --
	const featureColumns: Column<Record<string, unknown>>[] = [
		{ key: 'id', label: tr('f_label') },
		{ key: 'type', label: tr('f_type') },
		{ key: 'start', label: tr('f_start') },
		{ key: 'end', label: tr('f_end') },
		{ key: 'strand', label: tr('f_strand') },
		{ key: 'note', label: tr('f_note') }
	];
	const siteColumns: Column<Record<string, unknown>>[] = [
		{ key: 'id', label: tr('f_label') },
		{
			key: 'position',
			label: tr('f_start'),
			format: (s) => (s.position != null ? String(s.position) : '—')
		},
		{ key: 'enzyme', label: 'Enzyme', format: (s) => String(s.enzyme ?? s.recognition ?? '—') }
	];
	const constructColumns: Column<ConstructRow>[] = [
		{
			key: 'constructId',
			label: tr('et_construct'),
			format: (c) => String(c.constructId ?? '').slice(0, 28)
		},
		{
			key: 'cassetteId',
			label: tr('et_expression_cassette'),
			format: (c) => String(c.cassetteId ?? '').slice(0, 28)
		},
		{
			key: 'createdAt',
			label: tr('f_createdAt'),
			format: (c) => (c.createdAt != null ? fmtTime(c.createdAt) : '—')
		}
	];

	const glance = $derived({
		features: features.length,
		sites: sites.length,
		suppliers: suppliers.length,
		constructs: constructs.length,
		len: TOTAL_LEN
	});
</script>

{#if error}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		{error}
	</div>
{:else if row}
	<div class="space-y-4">
		<!-- identity header — Addgene leads with the plasmid name + backbone chips -->
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold">{String(row.name ?? '')}</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<Badge tone="muted">{enumLabel('tp', String(row.topology ?? ''))}</Badge>
					{#if row.format}<Badge tone="muted">{String(row.format)}</Badge>{/if}
					{#if TOTAL_LEN}<span>{TOTAL_LEN} bp</span>{/if}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					<code class="font-mono break-all">{String(row.id)}</code>
				</p>
			</div>
			<PageTools />
			<IssuePanel
				entityType="vector"
				entityId={String(row.id)}
				onannotate={() => (tab = 'community')}
			/>
			<RecordActions
				entityType="vector"
				id={String(row.id)}
				name={String(row.name ?? row.id)}
				href={`/vectors/${row.id}`}
				record={row}
				related={[
					{
						label: tr('action_assemble'),
						href: `/submit/design?mode=assemble&vectorId=${String(row.id)}`
					}
				]}
			/>
			<div class="flex items-center gap-2">
				<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<Checkbox name="vector_strict" bind:checked={strict} />
					{tr('vector_strict')}
				</label>
				<Button size="sm" onclick={runValidate}>{tr('vector_validate')}</Button>
			</div>
		</div>

		<!-- at-a-glance counters jump straight to the section that holds them -->
		<div class="grid grid-cols-5 gap-2">
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'overview')}
			>
				<p class="text-lg font-semibold tabular-nums">{glance.features}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('vector_glance_features')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'overview')}
			>
				<p class="text-lg font-semibold tabular-nums">{glance.sites}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('vector_glance_sites')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'sequence')}
			>
				<p class="text-lg font-semibold tabular-nums">{glance.len ? glance.len : '—'}</p>
				<p class="truncate text-[10px] text-muted-foreground">bp</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'suppliers')}
			>
				<p class="text-lg font-semibold tabular-nums">{glance.suppliers}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('vector_glance_suppliers')}</p>
			</Button>
			<Button
				variant="outline"
				class="h-auto w-full flex-col gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'derived')}
			>
				<p class="text-lg font-semibold tabular-nums">{glance.constructs}</p>
				<p class="truncate text-[10px] text-muted-foreground">{tr('vector_glance_constructs')}</p>
			</Button>
		</div>

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'overview', label: tr('tab_overview') },
				{ key: 'map', label: tr('vector_tab_map') },
				{ key: 'sequence', label: tr('vector_tab_sequence') },
				{ key: 'derived', label: tr('vector_tab_derived'), badge: constructs.length },
				{ key: 'suppliers', label: tr('vector_glance_suppliers'), badge: suppliers.length },
				{ key: 'community', label: tr('protein_tab_community') }
			]}
		/>

		{#if tab === 'overview'}
			{#if check}
				<Section title={tr('vector_validation_result')}>
					<div class="mb-2 flex items-center gap-2">
						<Badge tone={check.valid ? 'ok' : 'bad'}>{check.valid ? 'valid ✓' : 'invalid ✗'}</Badge>
					</div>
					<ul class="space-y-1 text-sm">
						{#each check.checks as c, i (i)}
							<li class="flex gap-2">
								<Badge
									tone={c.status === 'ok' || c.status === 'pass'
										? 'ok'
										: c.status === 'warning'
											? 'warn'
											: 'bad'}>{c.status ?? '—'}</Badge
								>
								<span>{c.name ?? ''} {c.message ?? ''}</span>
							</li>
						{/each}
						{#each check.warnings as w, i (i)}
							<li class="text-xs text-amber-700 dark:text-amber-300">⚠ {w}</li>
						{/each}
					</ul>
				</Section>
			{/if}
			<div class="grid gap-4 lg:grid-cols-2">
				<Section title={tr('vector_key_facts')}>
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
						<dt class="text-muted-foreground">{tr('f_name')}</dt>
						<dd>{String(row.name ?? '')}</dd>
						<dt class="text-muted-foreground">{tr('f_topology')}</dt>
						<dd>{enumLabel('tp', String(row.topology ?? ''))}</dd>
						<dt class="text-muted-foreground">{tr('f_format')}</dt>
						<dd>{String(row.format ?? '—')}</dd>
						<dt class="text-muted-foreground">{tr('f_coordinateSystem')}</dt>
						<dd>{String(row.coordinateSystem ?? '—')}</dd>
						<dt class="text-muted-foreground">{tr('f_schemaVersion')}</dt>
						<dd>{String(row.schemaVersion ?? '—')}</dd>
						<dt class="text-muted-foreground">{tr('f_length')}</dt>
						<dd>{TOTAL_LEN ? `${TOTAL_LEN} bp` : '—'}</dd>
						{#if row.sequenceArtifactId}
							<dt class="text-muted-foreground">{tr('f_sequenceArtifactId')}</dt>
							<dd>
								<a
									class="font-mono text-xs underline"
									href="/artifacts/{String(row.sequenceArtifactId)}"
									>{String(row.sequenceArtifactId)}</a
								>
							</dd>
						{/if}
					</dl>
				</Section>
				<Section title={tr('vector_insertion_sites')}>
					{#if sites.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
					{:else}<DataTable rows={sites} columns={siteColumns} />{/if}
				</Section>
			</div>
			<Section title={tr('vector_features')}>
				{#if features.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
				{:else}<DataTable rows={features} columns={featureColumns} />{/if}
			</Section>
		{:else if tab === 'map'}
			<Section title={tr('vector_tab_map')} hint={tr('vector_map_hint')}>
				{#if TOTAL_LEN === 0 || placed.length === 0}
					<p class="text-sm text-muted-foreground">{tr('vector_no_coords')}</p>
					{#if features.length}
						<div class="mt-2"><DataTable rows={features} columns={featureColumns} /></div>
					{/if}
				{:else}
					<div class="gene-view" style="height: 540px;">
						<PlasmidMap
							plasmidName={String(row.name ?? '')}
							dnaSeq={mapSeq}
							geneFeatures={mapFeatures}
							restrictionSites={mapSites}
							primers={[]}
							activeFeatureId={null}
							selectionStart={1}
							selectionEnd={1}
							linear={!circular}
						/>
					</div>
					{#if unplaced.length}
						<p class="mt-2 text-xs text-muted-foreground">
							{tr('vector_no_coords')} ({unplaced.length})
						</p>
					{/if}
				{/if}
			</Section>
		{:else if tab === 'sequence'}
			<div class="flex flex-wrap items-center gap-2">
				<div class="flex gap-1">
					{#each [['genbank', tr('vector_view_genbank')], ['fasta', tr('vector_view_fasta')], ['raw', tr('vector_view_raw')]] as [k, label] (k)}
						<Button
							size="xs"
							variant={seqView === k ? 'secondary' : 'ghost'}
							class={seqView === k ? 'font-semibold' : 'text-muted-foreground'}
							onclick={() => (seqView = k as 'genbank' | 'fasta' | 'raw')}>{label}</Button
						>
					{/each}
				</div>
				<div class="ml-auto flex gap-2">
					<ExportMenu formats={exportFormats} />
				</div>
			</div>
			<Section title={tr('vector_tab_sequence')}>
				{#if !row.sequenceArtifactId}
					<p class="text-sm text-muted-foreground">{tr('vector_seq_none')}</p>
				{:else if seqLoading}
					<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
				{:else if seqError}
					<p
						class="rounded-none bg-amber-50 dark:bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300"
					>
						{tr('vector_seq_pending')}
						{seqError}
					</p>
				{:else if seq || rawText}
					<pre
						class="max-h-[60vh] overflow-auto rounded-none bg-muted/40 p-3 font-mono text-[11px] leading-4">{seqView ===
						'genbank'
							? genbank
							: seqView === 'fasta'
								? fasta
								: rawText}</pre>
				{:else}
					<p class="text-sm text-muted-foreground">{tr('vector_seq_none')}</p>
				{/if}
			</Section>
		{:else if tab === 'derived'}
			<Section title={tr('vector_tab_derived')} hint={tr('vector_derived_hint')}>
				{#if constructs.length === 0}
					<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
				{:else}
					<DataTable
						rows={constructs}
						columns={constructColumns}
						hrefFor={(c) => `/constructs/${String(c.constructId)}`}
					/>
				{/if}
			</Section>
		{:else if tab === 'suppliers'}
			<Section title={tr('f_suppliers')}>
				{#if suppliers.length === 0}
					<p class="text-sm text-muted-foreground">{tr('supplier_empty')}</p>
				{:else}
					<ul class="divide-y text-sm">
						{#each suppliers as s, i (i)}
							<li class="flex flex-wrap items-center gap-2 py-2 text-xs">
								<a class="underline" href={`/organizations/${String(s.organizationId ?? '')}`}
									>{String(s.organizationName ?? s.organizationId ?? '')}</a
								>
								{#if s.catalogNumber}<code>{String(s.catalogNumber)}</code>{/if}
								{#if s.orderUrl}<a
										class="underline"
										href={String(s.orderUrl)}
										target="_blank"
										rel="noopener">{tr('org_order')}</a
									>{/if}
								{#if s.orderEmail}<a class="underline" href={`mailto:${String(s.orderEmail)}`}
										>{String(s.orderEmail)}</a
									>{/if}
								{#if s.lastVerifiedAt || s.verified}<Badge tone="ok"
										>{tr('org_verified')}{s.lastVerifiedAt
											? ` ${fmtTime(Number(s.lastVerifiedAt))}`
											: ''}</Badge
									>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</Section>
		{:else if tab === 'community'}
			<div class="grid gap-4 lg:grid-cols-2">
				<WikiPanel entityType="vector" entityId={String(row.id)} collapsible />
				<ReferencesPanel entityType="vector_template" entityId={String(row.id)} collapsible />
				<ProvenancePanel entityType="vector" entityId={String(row.id)} collapsible />
			</div>
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{/if}

<svelte:head><title>{String(row?.name ?? tr('browse_vectors'))} · SPD</title></svelte:head>
