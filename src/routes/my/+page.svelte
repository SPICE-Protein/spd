<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { artifacts as artifactApi, auth } from '$lib/api/client';
	import type { MySubmission, MyActionItem, MyReviewItem, MyWikiEdit } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime, entityHref, shortPublicId } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import Select from '$lib/components/Select.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import { listDrafts, draftStamp } from '$lib/state/drafts.svelte';
	import { market } from '$lib/state/market.svelte';
	import { savedViews } from '$lib/state/saved-views.svelte';
	import { recent } from '$lib/state/recent.svelte';
	import { migrateLegacyImports } from '$lib/import/legacy-imports';

	type DraftRow = { key: string; at: number; label: string };

	/**
	 * The personal workspace, reflowed around progressive disclosure.
	 *
	 * The page used to stack every shelf — drafts, market, views, recents,
	 * actions, review, submissions, files, wiki — into one column, so the
	 * question "what needs me now?" was buried under record lists. The tabs
	 * separate five different intents (overview, authored records, batch
	 * imports, community threads, browser-local scratch) and the record lists
	 * stay grouped and collapsed until asked for.
	 *
	 * "My submissions" means records the user authored. Rows created by the
	 * batch importer carry `origin='batch-import'` on the server, so the feed
	 * returns them in a separate `imports` list. The old browser-local mark is
	 * migrated once through the claim endpoint and then removed; the workbench
	 * never depends on localStorage for this distinction.
	 */

	let tab = $state('overview');
	let mounted = $state(false);
	let filesOpen = $state(false);
	let showAllActions = $state(false);
	let showAllImports = $state(false);

	let drafts = $state<DraftRow[]>([]);

	// localStorage is read only in the browser; SSR renders the empty shelf.
	$effect(() => {
		if (!browser) return;
		mounted = true;
		drafts = listDrafts();
	});
	// Re-read when the local tab opens, so a draft saved in another tab of
	// this browser is not a stale list.
	$effect(() => {
		if (!browser || tab !== 'local') return;
		drafts = listDrafts();
	});

	let submissions = $state<MySubmission[]>([]);
	let imports = $state<MySubmission[]>([]);
	let needsAction = $state<MyActionItem[]>([]);
	let inReview = $state<MyReviewItem[]>([]);
	let wikiEdits = $state<MyWikiEdit[]>([]);
	let error = $state('');
	let loaded = $state(false);

	$effect(() => {
		if (session.ready && !session.signedIn) goto('/');
	});

	async function load() {
		if (!session.signedIn) return;
		error = '';
		try {
			// Pre-0057 import marks lived only in this browser. Claim them
			// before reading the feed so the first render already shows them
			// in the right tab; a failed claim leaves the key for a retry.
			// Claiming writes to records, which the API reserves for researchers;
			// retrying from an ordinary account would only 403.
			if (browser && session.canWrite) {
				try {
					await migrateLegacyImports((ids) => auth.claimImports(ids));
				} catch {
					// The feed still loads; the old key can be retried later.
				}
			}
			const d = await auth.activity();
			submissions = Array.isArray(d.submissions) ? d.submissions : [];
			imports = Array.isArray(d.imports) ? d.imports : [];
			needsAction = Array.isArray(d.needsAction) ? d.needsAction : [];
			inReview = Array.isArray(d.inReview) ? d.inReview : [];
			wikiEdits = Array.isArray(d.wikiEdits) ? d.wikiEdits : [];
			loaded = true;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}
	$effect(() => {
		if (session.signedIn) void load();
	});

	const catalogSubmissions = $derived(submissions.filter((s) => s.entityType !== 'artifact'));
	const myFiles = $derived(submissions.filter((s) => s.entityType === 'artifact'));

	let subTerm = $state('');
	let subType = $state('all');

	const subTypes = $derived(
		Array.from(new Set(catalogSubmissions.map((s) => s.entityType))).sort()
	);
	const subTypeOptions = $derived([
		{ value: 'all', label: tr('search_all_types') },
		...subTypes.map((type) => ({
			value: type,
			label: enumLabel('et', type.replace(/-/g, '_'))
		}))
	]);

	const subFiltering = $derived(subTerm.trim() !== '' || subType !== 'all');
	const filteredSubmissions = $derived.by(() => {
		const needle = subTerm.trim().toLowerCase();
		return catalogSubmissions
			.filter((s) => subType === 'all' || s.entityType === subType)
			.filter((s) => {
				if (!needle) return true;
				return [s.title, s.id, s.entityType, s.status ?? '']
					.join(' ')
					.toLowerCase()
					.includes(needle);
			})
			.sort((a, b) => b.createdAt - a.createdAt);
	});

	const visibleGroups = $derived.by(() => {
		const map = new Map<string, MySubmission[]>();
		for (const s of filteredSubmissions) {
			const arr = map.get(s.entityType) ?? [];
			arr.push(s);
			map.set(s.entityType, arr);
		}
		return [...map.entries()]
			.map(([type, items]) => ({ type, items }))
			.sort((a, b) => (b.items[0]?.createdAt ?? 0) - (a.items[0]?.createdAt ?? 0));
	});

	const localCount = $derived(
		mounted
			? drafts.length + market.items.length + savedViews.views.length + recent.items.length
			: 0
	);

	const tabItems = $derived([
		{
			key: 'overview',
			label: tr('my_tab_overview'),
			badge: needsAction.length || undefined
		},
		{
			key: 'submissions',
			label: tr('my_submissions'),
			badge: catalogSubmissions.length || undefined
		},
		{
			key: 'imports',
			label: tr('my_tab_imports'),
			badge: imports.length || undefined
		},
		{
			key: 'community',
			label: tr('my_tab_community'),
			badge: inReview.length + wikiEdits.length || undefined
		},
		{
			key: 'local',
			label: tr('my_tab_local'),
			badge: localCount || undefined
		}
	]);

	const shownActions = $derived(
		showAllActions ? needsAction : needsAction.slice(0, 3)
	);
	const shownImports = $derived(showAllImports ? imports : imports.slice(0, 10));

	// An api_records correction/retraction sits at status 'active' while the
	// editorial office still holds it — "启用" would read as a verdict, not a
	// queue position, so the workspace says who is holding the ball instead.
	// A correction that left the queue left it by DECISION (§53): applied
	// means its fields now live on the target record, rejected means the
	// claim stands declined and nothing moved.
	function reviewBadge(r: MyReviewItem): { text: string; tone: string } | null {
		if ((r.entityType === 'correction' || r.entityType === 'retraction') && r.status === 'active') {
			return { text: tr('my_pending_office'), tone: 'warn' };
		}
		if (r.entityType === 'correction' && r.status === 'applied') {
			return { text: tr('my_applied'), tone: 'ok' };
		}
		if (r.entityType === 'correction' && r.status === 'rejected') {
			return { text: tr('my_rejected'), tone: 'bad' };
		}
		return null;
	}

	const actionTone: Record<string, string> = {
		needs_revision: 'bad',
		rejected_with_reason: 'bad',
		pending_screening: 'warn'
	};

	function openFiles() {
		filesOpen = true;
		tab = 'submissions';
	}
</script>

{#snippet submissionRow(s: MySubmission, showType: boolean)}
	<li class="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
		{#if showType}
			<Badge tone="muted">{enumLabel('et', s.entityType.replace(/-/g, '_'))}</Badge>
		{/if}
		<a
			class="min-w-0 truncate underline decoration-primary/40 hover:decoration-primary"
			href={entityHref(s.entityType, s.id)}>{s.title}</a
		>
		{#if s.status}<StatusBadge status={s.status} ns="st" />{:else}<Badge tone="muted">{tr('my_on_file')}</Badge>{/if}
		<span class="ml-auto font-mono text-[11px] text-muted-foreground">{shortPublicId(s.id)}</span>
		<span class="text-xs text-muted-foreground">{fmtTime(s.createdAt)}</span>
	</li>
{/snippet}

{#snippet fileRow(f: MySubmission)}
	<li class="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
		<a class="underline" href={entityHref('artifact', f.id)}>{enumLabel('ak', f.title)}</a>
		{#if f.status}<StatusBadge status={f.status} ns="st" />{:else}<Badge tone="muted">{tr('my_on_file')}</Badge>{/if}
		<span class="font-mono text-[11px] text-muted-foreground">{shortPublicId(f.id)}</span>
		{#if f.status === 'completed'}
			<a class="ml-auto text-xs font-medium text-primary underline" href={artifactApi.downloadUrl(f.id)}
				>⬇ {tr('artifact_download')}</a
			>
		{:else}
			<span class="ml-auto text-xs text-muted-foreground">{fmtTime(f.createdAt)}</span>
		{/if}
	</li>
{/snippet}

<div class="mx-auto max-w-4xl space-y-4">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div>
			<h1 class="flex items-center gap-1.5 text-2xl font-bold">
				{tr('my_title')}
				<InfoTip
					text={tr('my_intro')}
					label={`${tr('my_title')} — ${tr('common_more_info')}`}
					class="mt-1"
				/>
			</h1>
		</div>
		<div class="flex gap-2">
			{#if session.canWrite}<Button size="sm" variant="outline" href="/submit">{tr('nav_submit')}</Button>{/if}
			{#if session.isResearcher}<Button size="sm" variant="outline" href="/reviews">{tr('nav_reviews')}</Button>{/if}
			<Button size="sm" variant="ghost" href="/me">{tr('my_account_link')}</Button>
		</div>
	</div>

	{#if !session.signedIn}
		<div
			class="flex items-center gap-3 rounded-none border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
		>
			{tr('submit_login_needed')}
			<Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		</div>
	{:else if error}
		<p class="rounded-none bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
	{:else if !loaded}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else}
		<Tabs items={tabItems} bind:active={tab} />

		{#if tab === 'overview'}
			<div class="space-y-3">
				{#if needsAction.length > 0}
					<Section title={`${tr('my_needs_action')} · ${needsAction.length}`}>
						{#snippet actions()}
							{#if needsAction.length > 3}
								<Button size="xs" variant="ghost" onclick={() => (showAllActions = !showAllActions)}>
									{showAllActions ? tr('common_close') : tr('common_view_all')}
								</Button>
							{/if}
						{/snippet}
						<ul class="divide-y">
							{#each shownActions as a (a.id)}
								<li class="flex flex-wrap items-center gap-2 py-2 text-sm">
									<Badge tone={actionTone[a.status] ?? 'muted'}>{enumLabel('vs', a.status)}</Badge>
									<span class="text-muted-foreground">{enumLabel('vt', a.validationType)}</span>
									<a class="underline font-mono" href="/validations/{a.id}">{shortPublicId(a.id)}</a>
									<span class="text-xs text-muted-foreground">r{a.revisionNumber}</span>
									{#if a.status === 'needs_revision' || a.status === 'rejected_with_reason'}
										<a
											class="text-xs font-medium text-amber-700 underline dark:text-amber-400"
											href="/validations/{a.id}?tab=ledger">{tr('my_read_letter')} →</a
										>
									{/if}
									<a
										class="ml-auto text-xs font-medium text-primary underline"
										href="/validations/{a.id}">{tr('my_revise_cta')} →</a
									>
								</li>
							{/each}
						</ul>
					</Section>
				{:else}
					<p class="border p-3 text-sm text-muted-foreground">{tr('my_needs_action_empty')}</p>
				{/if}

				<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					<button
						type="button"
						class="border p-3 text-left transition-colors hover:bg-muted/40"
						onclick={() => (tab = 'submissions')}
					>
						<span class="flex items-baseline justify-between gap-2">
							<span class="text-xs text-muted-foreground">{tr('my_submissions')}</span>
							<span class="text-2xl font-bold tabular-nums">{catalogSubmissions.length}</span>
						</span>
						<span class="mt-1 block text-[11px] text-muted-foreground">{tr('my_overview_submissions_hint')}</span>
					</button>

					<button
						type="button"
						class="border p-3 text-left transition-colors hover:bg-muted/40"
						onclick={() => (tab = 'community')}
					>
						<span class="flex items-baseline justify-between gap-2">
							<span class="text-xs text-muted-foreground">{tr('my_in_review')}</span>
							<span class="text-2xl font-bold tabular-nums">{inReview.length}</span>
						</span>
						<span class="mt-1 block text-[11px] text-muted-foreground">{tr('my_overview_review_hint')}</span>
					</button>

					<button
						type="button"
						class="border p-3 text-left transition-colors hover:bg-muted/40"
						onclick={() => (tab = 'community')}
					>
						<span class="flex items-baseline justify-between gap-2">
							<span class="text-xs text-muted-foreground">{tr('my_wiki')}</span>
							<span class="text-2xl font-bold tabular-nums">{wikiEdits.length}</span>
						</span>
						<span class="mt-1 block text-[11px] text-muted-foreground">{tr('my_overview_wiki_hint')}</span>
					</button>

					<button
						type="button"
						class="border p-3 text-left transition-colors hover:bg-muted/40"
						onclick={openFiles}
					>
						<span class="flex items-baseline justify-between gap-2">
							<span class="text-xs text-muted-foreground">{tr('my_files')}</span>
							<span class="text-2xl font-bold tabular-nums">{myFiles.length}</span>
						</span>
						<span class="mt-1 block text-[11px] text-muted-foreground">{tr('my_overview_files_hint')}</span>
					</button>

					<button
						type="button"
						class="border p-3 text-left transition-colors hover:bg-muted/40"
						onclick={() => (tab = 'local')}
					>
						<span class="flex items-baseline justify-between gap-2">
							<span class="text-xs text-muted-foreground">{tr('my_drafts')}</span>
							<span class="text-2xl font-bold tabular-nums">{mounted ? drafts.length : 0}</span>
						</span>
						<span class="mt-1 block text-[11px] text-muted-foreground">{tr('my_overview_drafts_hint')}</span>
					</button>

					<a href="/market" class="border p-3 transition-colors hover:bg-muted/40">
						<span class="flex items-baseline justify-between gap-2">
							<span class="text-xs text-muted-foreground">{tr('my_market')}</span>
							<span class="text-2xl font-bold tabular-nums">{mounted ? market.items.length : 0}</span>
						</span>
						<span class="mt-1 block text-[11px] text-muted-foreground">{tr('my_overview_market_hint')}</span>
					</a>

					{#if imports.length > 0}
						<button
							type="button"
							class="border border-dashed p-3 text-left transition-colors hover:bg-muted/40"
							onclick={() => (tab = 'imports')}
						>
							<span class="flex items-baseline justify-between gap-2">
								<span class="text-xs text-muted-foreground">{tr('my_imports')}</span>
								<span class="text-2xl font-bold tabular-nums">{imports.length}</span>
							</span>
							<span class="mt-1 block text-[11px] text-muted-foreground">{tr('my_overview_imports_hint')}</span>
						</button>
					{/if}
				</div>

				<p class="text-xs text-muted-foreground">{tr('my_append_only_note')}</p>
			</div>
		{:else if tab === 'submissions'}
			<div class="space-y-3">
				<div class="flex flex-wrap items-end gap-2">
					<label class="block min-w-48 flex-1 text-xs">
						<span class="mb-1 block text-muted-foreground">{tr('nav_search')}</span>
						<Input
							name="my-submission-search"
							type="search"
							bind:value={subTerm}
							placeholder={tr('my_filter_placeholder')}
							aria_label={tr('my_filter_placeholder')}
						/>
					</label>
					<label class="block min-w-40 text-xs">
						<span class="mb-1 block text-muted-foreground">{tr('market_filter_type')}</span>
						<Select name="my-submission-type" bind:value={subType} options={subTypeOptions} />
					</label>
				</div>

				{#if catalogSubmissions.length === 0}
					<p class="border p-3 text-sm text-muted-foreground">{tr('my_submissions_empty')}</p>
				{:else if subFiltering}
					<div class="divide-y border">
						{#each filteredSubmissions as s (s.id)}
							{@render submissionRow(s, true)}
						{/each}
						{#if filteredSubmissions.length === 0}
							<p class="p-3 text-sm text-muted-foreground">{tr('common_empty')}</p>
						{/if}
					</div>
				{:else}
					<div class="space-y-2">
						{#each visibleGroups as g, i (g.type)}
							<details class="border" open={i === 0}>
								<summary
									class="flex cursor-pointer flex-wrap items-center gap-2 bg-muted/30 px-3 py-2 text-sm font-medium"
								>
									<span>{enumLabel('et', g.type.replace(/-/g, '_'))}</span>
									<Badge tone="muted">{g.items.length}</Badge>
								</summary>
								<ul class="divide-y border-t">
									{#each g.items as s (s.id)}
										{@render submissionRow(s, false)}
									{/each}
								</ul>
							</details>
						{/each}
					</div>
				{/if}

				{#if myFiles.length > 0}
					<Section collapsible bind:open={filesOpen} title={`${tr('my_files')} · ${myFiles.length}`}>
						<ul class="divide-y">
							{#each myFiles as f (f.id)}
								{@render fileRow(f)}
							{/each}
						</ul>
						<p class="mt-2 text-xs text-muted-foreground">{tr('my_files_note')}</p>
					</Section>
				{/if}
			</div>
		{:else if tab === 'imports'}
			<div class="space-y-3">
				<p class="border border-dashed p-2 text-xs text-muted-foreground">
					{tr('my_imports_server_note')}
				</p>
				{#if imports.length === 0}
					<p class="border p-3 text-sm text-muted-foreground">{tr('my_imports_empty')}</p>
				{:else}
					<Section title={`${tr('my_imports')} · ${imports.length}`}>
						<ul class="divide-y">
							{#each shownImports as item (item.id)}
								<li class="flex flex-wrap items-center gap-2 py-1.5 text-sm">
									<Badge tone="muted">{enumLabel('et', item.entityType.replace(/-/g, '_'))}</Badge>
									<a class="underline" href={entityHref(item.entityType, item.id)}>{item.title}</a>
									<span class="font-mono text-[11px] text-muted-foreground"
										>{shortPublicId(item.id)}</span
									>
									<span class="ml-auto text-xs text-muted-foreground">{fmtTime(item.createdAt)}</span>
								</li>
							{/each}
						</ul>
						{#if imports.length > shownImports.length}
							<button
								type="button"
								class="mt-2 text-xs text-muted-foreground underline"
								onclick={() => (showAllImports = true)}
							>
								{tr('common_view_all')} · {imports.length}
							</button>
						{/if}
					</Section>
				{/if}
			</div>
		{:else if tab === 'community'}
			<div class="space-y-3">
				{#if inReview.length + wikiEdits.length === 0}
					<p class="border p-3 text-sm text-muted-foreground">{tr('common_empty')}</p>
				{:else}
					{#if inReview.length > 0}
						<Section
							collapsible
							open={inReview.length <= 5}
							title={`${tr('my_in_review')} · ${inReview.length}`}
							hint={tr('my_in_review_note')}
						>
							<ul class="divide-y">
								{#each inReview as r (r.id)}
									<li class="flex flex-wrap items-center gap-2 py-1.5 text-sm">
										<Badge tone="muted">{enumLabel('et', r.entityType.replace(/-/g, '_'))}</Badge>
										<a class="underline" href={entityHref(r.entityType, r.id)}
											>{r.title || shortPublicId(r.id)}</a
										>
										{#if reviewBadge(r)}
											<Badge tone={reviewBadge(r)!.tone}>{reviewBadge(r)!.text}</Badge>
										{:else}
											<StatusBadge status={r.status} ns="st" />
										{/if}
										<span class="ml-auto text-xs text-muted-foreground">{fmtTime(r.updatedAt)}</span>
									</li>
								{/each}
							</ul>
						</Section>
					{/if}

					{#if wikiEdits.length > 0}
						<Section
							collapsible
							open={wikiEdits.length <= 5}
							title={`${tr('my_wiki')} · ${wikiEdits.length}`}
						>
							<ul class="divide-y">
								{#each wikiEdits as w (w.id)}
									<li class="flex flex-wrap items-center gap-2 py-1.5 text-sm">
										<Badge tone="muted">{enumLabel('et', w.entityType.replace(/-/g, '_'))}</Badge>
										<a class="underline" href={entityHref(w.entityType, w.entityId)}
											>{w.title || shortPublicId(w.entityId)}</a
										>
										<span class="text-xs text-muted-foreground">r{w.revisionNumber}</span>
										<span class="ml-auto text-xs text-muted-foreground">{fmtTime(w.updatedAt)}</span>
									</li>
								{/each}
							</ul>
						</Section>
					{/if}
				{/if}
			</div>
		{:else}
			<div class="space-y-3">
				<p class="border border-dashed p-2 text-xs text-muted-foreground">{tr('my_local_only_note')}</p>

				{#if !mounted}
					<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
				{:else if localCount === 0}
					<p class="border p-3 text-sm text-muted-foreground">{tr('my_local_empty')}</p>
				{:else}
					{#if drafts.length > 0}
						<Section collapsible open={true} title={`${tr('my_drafts')} · ${drafts.length}`}>
							<ul class="divide-y">
								{#each drafts as d (d.key)}
									<li class="flex flex-wrap items-center gap-2 py-1.5 text-sm">
										<span class="font-medium">{d.label}</span>
										<span class="text-xs text-muted-foreground"
											>{tr('draft_saved_at')} · {draftStamp(d.at)}</span
										>
										<a
											class="ml-auto text-xs font-medium text-primary underline"
											href={`/${d.key}`}>{tr('draft_resume')} →</a
										>
									</li>
								{/each}
							</ul>
						</Section>
					{/if}

					{#if market.items.length > 0}
						<Section collapsible title={`${tr('my_market')} · ${market.items.length}`}>
							{#snippet actions()}
								<Button size="xs" variant="outline" href="/market">{tr('my_open_market')}</Button>
							{/snippet}
							<ul class="divide-y">
								{#each market.items.slice(0, 5) as item (`${item.entityType}:${item.id}`)}
									<li class="flex flex-wrap items-center gap-2 py-1.5 text-sm">
										<Badge tone="muted">{enumLabel('et', item.entityType.replace(/-/g, '_'))}</Badge>
										<a class="underline" href={item.href}>{item.name}</a>
									</li>
								{/each}
							</ul>
						</Section>
					{/if}

					{#if savedViews.views.length > 0}
						<Section collapsible title={`${tr('view_saved_title')} · ${savedViews.views.length}`}>
							<ul class="divide-y">
								{#each savedViews.views as v (v.id)}
									<li class="flex flex-wrap items-center gap-2 py-1.5 text-sm">
										<a class="underline" href={v.path}>{v.name}</a>
										<span class="truncate font-mono text-xs text-muted-foreground">{v.path}</span>
										<Button
											class="ml-auto"
											size="xs"
											variant="ghost"
											onclick={() => savedViews.remove(v.id)}>{tr('view_remove')}</Button
										>
									</li>
								{/each}
							</ul>
						</Section>
					{/if}

					{#if recent.items.length > 0}
						<Section collapsible title={`${tr('my_recent')} · ${recent.items.length}`}>
							<ul class="divide-y">
								{#each recent.items.slice(0, 5) as item (`${item.entityType}:${item.id}`)}
									<li class="flex flex-wrap items-center gap-2 py-1.5 text-sm">
										<Badge tone="muted">{enumLabel('et', item.entityType.replace(/-/g, '_'))}</Badge>
										<a class="underline" href={item.href}>{item.name}</a>
									</li>
								{/each}
							</ul>
						</Section>
					{/if}
				{/if}

				<p class="text-xs text-muted-foreground">{tr('my_append_only_note')}</p>
			</div>
		{/if}
	{/if}
</div>

<svelte:head><title>{tr('my_title')} · SPD</title></svelte:head>
