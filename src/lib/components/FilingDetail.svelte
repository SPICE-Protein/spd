<script lang="ts">
	import { tr, fieldLabel, enumLabel } from '$lib/i18n';
	import { fmtTime, entityHref, payloadTitle } from '$lib/format';
	import { cellText } from './json-coerce';
	import { fetchTargetFields } from '$lib/submit/field-options';
	import Section from './Section.svelte';
	import PageTools from './PageTools.svelte';
	import EntityBreadcrumb from './EntityBreadcrumb.svelte';
	import Badge from './Badge.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import type { ApiRecordRow } from '$lib/api/types';

	/**
	 * A community filing read as what it claims, not as a JSON dump.
	 *
	 * Two write paths have always fed `api_records`, and both stay readable
	 * forever: the record-page door posts the event and the server wraps it
	 * into {entityId, event:{…}}, while the submit wizard files the flat form
	 * directly ({targetId, …}). Older corrections still assert a whole-record
	 * `proposed` map or `proposedFix` sentence — they render under an explicit
	 * "legacy" note instead of pretending to be field patches.
	 */
	let {
		kind,
		id,
		get
	}: {
		kind: 'correction' | 'retraction' | 'contribution';
		id: string;
		get: (i: string) => Promise<ApiRecordRow>;
	} = $props();

	let row = $state<ApiRecordRow | null>(null);
	let error = $state('');
	let loading = $state(true);

	async function load() {
		loading = true;
		try {
			row = await get(id);
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			row = null;
		} finally {
			loading = false;
		}
	}
	$effect(() => void load());

	const payload = $derived((row?.payload ?? {}) as Record<string, unknown>);
	const event = $derived.by(() => {
		const ev = payload.event;
		return (ev && typeof ev === 'object' && !Array.isArray(ev) ? ev : payload) as Record<string, unknown>;
	});
	const targetId = $derived(String(payload.entityId ?? event.targetId ?? ''));
	const reason = $derived(String(event.reason ?? '').trim());
	const summary = $derived(String(event.summary ?? '').trim());
	const role = $derived(String(event.role ?? '').trim());
	const evidenceUrl = $derived(String(event.evidenceUrl ?? '').trim());

	// Canonical field assertions: a row means "field X is currently Y and
	// should be Z" — `proposed` must be PRESENT (null or '' is an assertion
	// to clear the value), exactly the rule filings::validate_filing enforces.
	const items = $derived.by(() => {
		const arr = Array.isArray(event.items) ? event.items : [];
		return arr
			.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, unknown>) : null))
			.filter((r): r is Record<string, unknown> => !!r && String(r.field ?? '').trim() !== '')
			.map((r) => ({
				field: String(r.field ?? ''),
				hasCurrent: 'current' in r && r.current !== undefined,
				current: r.current,
				hasProposed: 'proposed' in r && r.proposed !== undefined,
				proposed: r.proposed,
				note: String(r.note ?? '').trim()
			}));
	});

	// Pre-fieldPatch filings proposed one whole-record fix; keep them legible.
	const legacy = $derived.by(() => {
		if (items.length) return [];
		const p = event.proposed;
		if (p && typeof p === 'object' && !Array.isArray(p)) {
			return Object.entries(p as Record<string, unknown>).map(([k, v]) => ({ field: k, value: cellText(v) }));
		}
		const fix = typeof event.proposedFix === 'string' ? event.proposedFix.trim() : '';
		return fix ? [{ field: '—', value: fix }] : [];
	});

	// The door body names the target's type; the wizard only leaves an id, so
	// ask the record itself — api_records answers, an unresolvable core uuid
	// degrades to a search link rather than a dead route.
	let targetInfo = $state<{ href: string; label: string } | null>(null);
	$effect(() => {
		targetInfo = null;
		const rid = targetId;
		if (!rid || !row) return;
		const t = String(event.entityType ?? '');
		let alive = true;
		void (async () => {
			const tf = await fetchTargetFields(t || undefined, rid);
			if (!alive) return;
			const type = t || tf.entityType || '';
			targetInfo = {
				href: type ? entityHref(type, rid) : `/search?q=${encodeURIComponent(rid)}`,
				label: payloadTitle(tf.scalars) || rid
			};
		})();
		return () => {
			alive = false;
		};
	});

	// Keys no named section renders stay on the page — a filing may assert
	// anything, and silently dropping the rest would hide half the claim.
	const KNOWN = new Set([
		'entityType',
		'targetId',
		'reason',
		'items',
		'proposed',
		'proposedFix',
		'evidenceUrl',
		'summary',
		'role',
		'entityId',
		'event'
	]);
</script>

{#if loading}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{:else if error}
	<div class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
{:else if row}
	<div class="space-y-4">
		<div>
			<EntityBreadcrumb
				listHref={`/${kind}s`}
				listLabel={tr(`browse_${kind}s`)}
				current={tr(`filing_title_${kind}`)}
			/>
			<h1 class="mt-1 text-xl font-bold">{tr(`filing_title_${kind}`)}</h1>
			<p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<code class="font-mono break-all">{String(row.id ?? id)}</code>
				{#if row.status}<StatusBadge status={String(row.status)} ns="st" />{/if}
				<span>{fmtTime(Number(row.createdAt), true)}</span>
			</p>
			{#if row.status === 'applied' || row.status === 'rejected'}
				<p class="mt-2 text-xs text-muted-foreground">
					{row.status === 'applied' ? tr('filing_applied_note') : tr('filing_rejected_note')}
				</p>
			{/if}
		</div>

		<div class="flex justify-end"><PageTools /></div>

		<Section title={tr('filing_target')}>
			{#if !targetId}
				<span class="text-sm text-muted-foreground">—</span>
			{:else if targetInfo}
				<span class="flex flex-wrap items-center gap-2 text-sm">
					<a class="underline" href={targetInfo.href}>{targetInfo.label}</a>
					{#if targetInfo.label !== targetId}
						<code class="font-mono text-xs break-all">{targetId}</code>
					{/if}
				</span>
			{:else}
				<span class="text-sm text-muted-foreground">{tr('common_loading')}</span>
			{/if}
		</Section>

		{#if kind === 'contribution'}
			<Section title={tr('filing_summary')}>
				<div class="space-y-2 text-sm">
					{#if role}<Badge tone="info">{enumLabel('role', role)}</Badge>{/if}
					<p class="whitespace-pre-wrap break-words">{summary || '—'}</p>
				</div>
			</Section>
		{/if}
		{#if reason}
			<Section title={tr('filing_reason')}>
				<p class="whitespace-pre-wrap break-words text-sm">{reason}</p>
			</Section>
		{/if}

		{#if items.length}
			<Section title={`${tr('filing_items_title')} · ${items.length}`}>
				<div class="overflow-x-auto">
					<table class="w-full text-left text-xs">
						<thead>
							<tr class="border-b text-muted-foreground">
								<th class="py-1.5 pr-3 font-medium">{tr('ci_field')}</th>
								<th class="py-1.5 pr-3 font-medium">{tr('ci_current')}</th>
								<th class="py-1.5 pr-3 font-medium">{tr('ci_proposed')}</th>
								<th class="py-1.5 font-medium">{tr('ci_note')}</th>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each items as it, i (i)}
								<tr>
									<td class="py-1.5 pr-3"><code class="font-mono">{it.field}</code></td>
									<td class="py-1.5 pr-3 break-all">
										{#if it.hasCurrent}{cellText(it.current)}{:else}—{/if}
									</td>
									<td class="py-1.5 pr-3 break-all font-medium">
										{#if it.hasProposed}{cellText(it.proposed)}{:else}—{/if}
									</td>
									<td class="py-1.5 break-words text-muted-foreground">{it.note || '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Section>
		{:else if legacy.length}
			<Section title={tr('filing_items_title')}>
				<p class="mb-2 text-xs text-muted-foreground">{tr('filing_legacy_proposed')}</p>
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
					{#each legacy as l, i (i)}
						<dt class="text-muted-foreground">
							{l.field === '—' ? tr('filing_legacy_proposed') : l.field}
						</dt>
						<dd class="break-all">{l.value}</dd>
					{/each}
				</dl>
			</Section>
		{/if}

		{#if evidenceUrl}
			<Section title={tr('filing_evidence')}>
				<a class="text-sm underline break-all" href={evidenceUrl} target="_blank" rel="noopener">{evidenceUrl}</a>
			</Section>
		{/if}

	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('page_not_found')}</p>
{/if}

<svelte:head><title>{tr(`filing_title_${kind}`)} · SPD</title></svelte:head>
