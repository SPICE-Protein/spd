<script lang="ts">
	import { page } from '$app/state';
	import { external, graphQuery } from '$lib/api/client';
	import type { ExternalImportResult } from '$lib/api/types';
	import { SpdApiError } from '$lib/api/base';
	import { session } from '$lib/state/session.svelte';
	import { queryToken } from '$lib/state/query-token.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import JsonBlock from '$lib/components/JsonBlock.svelte';
	import StatBar from '$lib/components/StatBar.svelte';
	import QueryNodeEditor from '$lib/components/QueryNodeEditor.svelte';
	import ResultTree from '$lib/components/ResultTree.svelte';
	import Input from '$lib/components/Input.svelte';
	import Textarea from '$lib/components/Textarea.svelte'
	import UpstreamResolveDialog from '$lib/components/UpstreamResolveDialog.svelte';
	import SavedQueriesPanel from '$lib/components/SavedQueriesPanel.svelte';
	import {
		NODE_TYPES,
		TIERS,
		tierFor,
		specsToInput,
		inputToSpecs,
		specHeight,
		specShape,
		trimToDepth,
		treesMinResolutions,
		newSpec,
		presetProtein,
		presetFoldEvidence,
		presetLineage,
		type NodeSpec
	} from '$lib/graph/registry';
	import { QUERY_TEMPLATES } from '$lib/graph/templates';

	// Presets are builder trees, not JSON strings — the visual path is the
	// primary one; raw JSON stays as the power-user tab.
	const PRESETS = [
		{ key: 'protein_graph', make: presetProtein },
		{ key: 'fold_evidence', make: presetFoldEvidence },
		{ key: 'sequence_lineage', make: presetLineage }
	];

	let roots = $state<NodeSpec[]>([presetProtein()[0]]);
	let mode = $state<'visual' | 'json'>('visual');
	let rawText = $state('');
	let running = $state(false);
	let result = $state<Record<string, unknown> | null>(null);
	let error = $state('');

	// Which root types can be started from a name instead of an id. The ladder
	// is one cheap GET and only decides whether the button appears; a failure
	// just hides it, the id field still works.
	let ladderTypes = $state<Record<string, string[]>>({});
	$effect(() => {
		let alive = true;
		external
			.ladder()
			.then((data) => {
				if (!alive) return;
				const map: Record<string, string[]> = {};
				for (const l of data.ladders) if (l.sources.length) map[l.entityType] = l.sources;
				ladderTypes = map;
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	});
	let asking = $state<{ spec: NodeSpec; entityType: string; query: string } | null>(null);

	// A template is built for the standard tier. Anonymous readers get the part
	// their depth allows — but "empty result" and "cut down to your tier" look
	// identical on screen, so remember the cut and say so.
	let trimmed = $state<{ from: number; to: number } | null>(null);

	// Template cards and record pages link here with `?template=…`, optionally
	// plus `rootType`/`rootId` so "query from this record" starts from the
	// record instead of an empty root. Apply once per mount so a later builder
	// edit is never overwritten by the effect re-running.
	let templateApplied = false;
	$effect(() => {
		if (templateApplied) return;
		// The session resolves after mount. Trimming before it lands would cut
		// a signed-in reader down to the anonymous depth and never re-expand,
		// so wait for the real tier before applying the template.
		if (session.loading) return;
		const templateId = page.url.searchParams.get('template');
		const rootType = page.url.searchParams.get('rootType')?.trim() ?? '';
		const rootId = page.url.searchParams.get('rootId')?.trim() ?? '';
		if (!templateId && !rootType) return;
		templateApplied = true;
		if (templateId) {
			const template = QUERY_TEMPLATES.find((t) => t.id === templateId);
			if (!template) return;
			roots = template.build();
		} else {
			if (!(NODE_TYPES as readonly string[]).includes(rootType)) return;
			roots = [newSpec(rootType)];
		}
		if (rootId && roots.length) roots[0].id = rootId;
		// A template is built for the standard tier. Anonymous readers get the
		// part their depth allows instead of a Run button that always refuses.
		const depth = TIERS[tierFor(session.signedIn)].depth;
		const before = Math.max(...roots.map((root) => specHeight(root)));
		roots = roots.map((root) => trimToDepth(root, depth));
		trimmed = before > depth ? { from: before, to: depth } : null;
		mode = 'visual';
		error = '';
	});

	const tier = $derived(TIERS[tierFor(session.signedIn)]);
	// A bearer token the caller brought decides the real tier server-side; the
	// cookie-derived ladder below is only the fallback prediction.
	const usingToken = $derived(!!queryToken.value);
	const maxTreeHeight = $derived(Math.max(...roots.map((r) => specHeight(r))));
	const minRes = $derived(treesMinResolutions(roots));
	const willBeRejected = $derived(!usingToken && maxTreeHeight > tier.depth);

	// Local mirror of the stored token so typing never re-trims the field;
	// the store is written on change/blur and cleared explicitly.
	let tokenDraft = $state(queryToken.value);
	let tokenRevealed = $state(false);
	function saveToken() {
		queryToken.set(tokenDraft);
	}
	function clearToken() {
		queryToken.clear();
		tokenDraft = '';
	}

	const currentInput = $derived.by(() => {
		try {
			return JSON.stringify(specsToInput(roots), null, 2);
		} catch {
			return '{}';
		}
	});

	function switchMode(next: 'visual' | 'json') {
		if (next === mode) return;
		if (next === 'json') {
			rawText = currentInput;
			mode = 'json';
		} else {
			try {
				const parsed = inputToSpecs(JSON.parse(rawText));
				if (!parsed) throw new Error();
				roots = parsed;
				mode = 'visual';
			} catch {
				error = tr('query_bad_json');
			}
		}
	}

	function usePreset(key: string) {
		const p = PRESETS.find((x) => x.key === key);
		if (!p) return;
		roots = p.make();
		trimmed = null;
		if (mode === 'json') rawText = JSON.stringify(specsToInput(roots), null, 2);
	}

	/** Only ladder-covered types get the button: a type with no upstream has
	 *  nothing to search, and a control that always answers "nothing" is a lie. */
	function lookupFor(spec: NodeSpec): (() => void) | undefined {
		if (!ladderTypes[spec.type]) return undefined;
		return () => (asking = { spec, entityType: spec.type, query: spec.id.trim() });
	}

	function pickUpstream(result: ExternalImportResult) {
		// The picked record's SPD address becomes the root id; `source` stays
		// empty so the server infers the catalog from the id's shape.
		const target = asking?.spec;
		if (target) target.id = result.publicId;
		asking = null;
	}

	/** "Use as root" from a result node — the tree the reader was inspecting
	 *  becomes the next query instead of retyping its id by hand. */
	function reroot(kind: string, id: string) {
		roots = [newSpec(kind, id)];
		trimmed = null;
		error = '';
		// A re-rooted tree is not what the JSON tab is showing; switch back so
		// the two views cannot disagree.
		mode = 'visual';
	}

	function loadSaved(saved: NodeSpec[]) {
		roots = saved;
		trimmed = null;
		error = '';
		mode = 'visual';
	}

	const idsMissing = $derived(roots.some((r) => !r.id.trim()));

	async function run() {
		error = '';
		let body: unknown;
		try {
			body = mode === 'visual' ? specsToInput(roots) : JSON.parse(rawText);
		} catch {
			error = tr('query_bad_json');
			return;
		}
		if (mode === 'visual' && idsMissing) {
			error = tr('query_needs_ids');
			return;
		}
		running = true;
		try {
			result = await graphQuery.run(body as never, queryToken.value || undefined);
		} catch (e) {
			result = null;
			if (e instanceof SpdApiError) {
				error = `${e.code}: ${e.message}`;
				const fe = Object.entries(e.fields ?? {});
				if (fe.length) error += ' · ' + fe.map(([k, v]) => `${k}: ${v}`).join('; ');
			} else error = String(e);
			toastErr(e);
		} finally {
			running = false;
		}
	}

	const budget = $derived(
		result ? { used: Number(result.budgetUsed ?? 0), max: Number(result.budgetMax ?? 0) } : null
	);
	const resultRoots = $derived(Array.isArray(result?.results) ? (result.results as unknown[]) : []);
</script>

<div class="mx-auto max-w-4xl space-y-4">
	<div>
		<h1 class="flex items-center gap-1.5 text-2xl font-bold">
			{tr('query_title')}
			<InfoTip
				text={session.signedIn ? tr('query_intro') : `${tr('query_intro')} ${tr('query_anon_hint')}`}
				label={`${tr('query_title')} — ${tr('common_more_info')}`}
				class="mt-1"
			/>
		</h1>
	</div>

	<Section title={tr('query_token_title')} hint={tr('query_token_hint')}>
		<div class="flex flex-wrap items-end gap-2">
			<label class="min-w-64 flex-1 text-sm">
				<span class="text-xs text-muted-foreground">{tr('query_token_label')}</span>
				<Input
					name="query_token"
					type={tokenRevealed ? 'text' : 'password'}
					placeholder="spd_…"
					class="mt-1 w-full font-mono text-xs"
					bind:value={tokenDraft}
					onchange={saveToken}
					onblur={saveToken}
				/>
			</label>
			<Button size="sm" variant="ghost" onclick={() => (tokenRevealed = !tokenRevealed)}>{tokenRevealed ? tr('query_token_hide') : tr('query_token_show')}</Button>
			{#if queryToken.value}<Button size="sm" variant="outline" onclick={clearToken}>{tr('query_token_clear')}</Button>{/if}
		</div>
		<p class="mt-2 text-xs">
			<a class="underline" href="/me">{tr('query_token_mint')}</a>
		</p>
		{#if usingToken}
			<p class="mt-1 text-xs text-emerald-700 dark:text-emerald-300">{tr('query_token_active')}</p>
		{/if}
	</Section>

	<div class="flex flex-wrap gap-2">
		<Button size="xs" variant="outline" href="/query/templates">{tr('query_templates')}</Button>
		<span class="mx-2 border-l"></span>
		{#each PRESETS as p (p.key)}
			<Button size="xs" variant="outline" onclick={() => usePreset(p.key)}>{tr(`query_preset_${p.key}`)}</Button>
		{/each}
		<span class="mx-2 border-l"></span>
		<Button size="xs" variant={mode === 'visual' ? 'secondary' : 'ghost'} onclick={() => switchMode('visual')}>{tr('query_mode_visual')}</Button>
		<Button size="xs" variant={mode === 'json' ? 'secondary' : 'ghost'} onclick={() => switchMode('json')}>{tr('query_mode_json')}</Button>
	</div>

	<Section title={mode === 'visual' ? tr('query_build') : tr('query_input')}>
		{#if mode === 'visual'}
			<div class="space-y-3">
				{#each roots as r, i (i)}
					<div class="space-y-1.5">
						<QueryNodeEditor
							spec={r}
							isRoot
							maxDepth={tier.depth}
							onRemove={roots.length > 1 ? () => roots.splice(i, 1) : undefined}
							onlookup={lookupFor(r)}
						/>
						<p class="font-mono text-xs break-words text-muted-foreground">
							<span class="text-foreground/60">{tr('query_shape')}</span>
							{specShape(r)}
						</p>
					</div>
				{/each}
				{#if roots.length < 25}
					<Button
						size="xs"
						variant="outline"
						onclick={() => roots.push(newSpec('protein'))}
					>＋ {tr('query_add_root')}</Button>
				{/if}
				<InfoTip
					text={tr('query_roots_hint')}
					label={`${tr('query_add_root')} — ${tr('common_more_info')}`}
				/>
			</div>
		{:else}
			<Textarea name="query_raw" bind:value={rawText} spellcheck={false} monospace class="h-64 w-full p-3 text-xs" />
		{/if}

		<div class="mt-3 flex flex-wrap items-center gap-2">
			{#if mode === 'visual'}
				<Badge tone={willBeRejected ? 'bad' : 'muted'}>
					{tr('query_height')}: {maxTreeHeight}/{tier.depth}
				</Badge>
				<Badge tone={minRes > tier.budget ? 'bad' : 'muted'}>
					{tr('query_min_resolutions')}: {minRes}/{tier.budget}
				</Badge>
				{#if usingToken}
					<Badge tone="ok">{tr('query_token_tier_badge')}</Badge>
				{:else}
					<Badge tone="info">{enumLabel('tk', tierFor(session.signedIn))}</Badge>
				{/if}
				{#if willBeRejected}
					<span class="text-xs text-destructive">{tr(session.signedIn ? 'query_reject_depth_signed' : 'query_reject_depth_anon')}</span>
				{/if}
			{/if}
			<Button class="ml-auto" size="sm" onclick={run} disabled={running || (mode === 'visual' && idsMissing)}>
				{tr('query_run')}
			</Button>
		</div>
		{#if mode === 'visual' && trimmed}
			<p class="mt-1 text-xs text-amber-700 dark:text-amber-300">
				{tr('query_trimmed_notice', { from: trimmed.from, to: trimmed.to })}
			</p>
		{/if}
		{#if mode === 'visual' && idsMissing}
			<p class="mt-1 text-xs text-amber-700 dark:text-amber-300">{tr('query_needs_ids')}</p>
		{/if}
	</Section>

	<SavedQueriesPanel current={roots} onload={loadSaved} />

	{#if error}
		<div class="rounded-none border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive whitespace-pre-line">{error}</div>
	{/if}

	{#if result}
		<Section title={tr('query_result')}>
			<div class="mb-3 flex flex-wrap items-center gap-3 text-sm">
				<Badge tone={String(result.tier) === 'unlimited' ? 'ok' : 'info'}>{enumLabel('tk', String(result.tier ?? ''))}</Badge>
				{#if budget}
					<div class="min-w-40 flex-1">
						<StatBar items={[{ label: tr('query_budget'), value: budget.used, hint: `max ${budget.max}` }]} />
					</div>
					<span class="font-mono text-xs text-muted-foreground">{budget.used}/{budget.max}</span>
				{/if}
			</div>
			<div class="space-y-3">
				{#each resultRoots as r, i (i)}
					<ResultTree value={r} onroot={reroot} />
				{/each}
			</div>
			<JsonBlock class="mt-3" label={tr('query_raw')} value={result.results} />
		</Section>
	{/if}

</div>

<svelte:head><title>{tr('query_title')} · SPD</title></svelte:head>

{#if asking}
	<!-- keyed by identity: a second lookup must remount, not reuse the first
	     dialog's rung results -->
	{#key asking}
		<UpstreamResolveDialog
			entityType={asking.entityType}
			query={asking.query}
			open={true}
			onclose={() => (asking = null)}
			onpicked={pickUpstream}
		/>
	{/key}
{/if}
