<script lang="ts">
	import { relations } from '$lib/api/client';
	import type { EntityRelation, EntityRef } from '$lib/api/types';
	import { tr, enumLabel } from '$lib/i18n';
	import { shortPublicId } from '$lib/format';
	import Section from './Section.svelte';
	import Badge from './Badge.svelte';
	import IdLink from './IdLink.svelte';

	/**
	 * What this record is connected to, grouped by the type on the far end —
	 * the shape a reader follows when leaving a detail page (its gene, its
	 * sequences, the structures that solved it, the enzymes an EC number ties
	 * it to). The backend resolves each far side's own name, so an edge reads
	 * "Encoded by · Brca1" rather than a public-id tail; the id stays in the
	 * tooltip and as the fallback when a label is missing.
	 *
	 * The panel fetches its own data: the relation graph changes independently
	 * of the record body a detail page already loaded.
	 */
	/**
	 * `onCount` lets a page that already shows this panel supply its own
	 * "connections" counter instead of fetching the same graph a second time
	 * to count it.
	 */
	let {
		entityType,
		entityId,
		onCount
	}: { entityType: string; entityId: string; onCount?: (count: number) => void } = $props();

	let rows = $state<EntityRelation[]>([]);
	let loading = $state(true);
	let error = $state('');
	// A fast id change must not let an older response overwrite the newer one.
	let generation = 0;

	async function load() {
		const run = ++generation;
		loading = true;
		error = '';
		try {
			const res = await relations.forEntity(entityType, entityId);
			if (run !== generation) return;
			rows = Array.isArray(res.relations) ? res.relations : [];
		} catch (e) {
			if (run !== generation) return;
			rows = [];
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (run === generation) {
				loading = false;
				onCount?.(rows.length);
			}
		}
	}

	$effect(() => {
		if (!entityId) {
			rows = [];
			loading = false;
			onCount?.(0);
			return;
		}
		void load();
	});

	type FarSide = EntityRef & { label?: string | null; subtitle?: string | null };

	/** The far end of an edge. Older responses (and manual rows from a stale
	 *  cache) may lack `other`; fall back to the stored endpoint. */
	function otherSide(r: EntityRelation): FarSide {
		if (r.other) return r.other;
		if (r.direction === 'out') return r.to;
		if (r.direction === 'in') return r.from;
		return r.from.type === entityType && r.from.id === entityId ? r.to : r.from;
	}

	// The order a person reads a record: what encodes it, what it is, what was
	// solved from it, then the catalogs that classify or use it.
	const GROUP_ORDER = [
		'gene',
		'gene-region',
		'protein',
		'sequence',
		'pdb-entry',
		'fold',
		'validation',
		'enzyme',
		'restriction-enzyme',
		'reaction',
		'pathway',
		'biobrick',
		'vector',
		'reagent',
		'cell-line',
		'strain',
		'other'
	];

	function rank(type: string): number {
		const index = GROUP_ORDER.indexOf(type);
		return index === -1 ? GROUP_ORDER.length : index;
	}

	const groups = $derived.by(() => {
		const byType = new Map<string, EntityRelation[]>();
		for (const relation of rows) {
			const type = otherSide(relation).type || 'other';
			const bucket = byType.get(type);
			if (bucket) bucket.push(relation);
			else byType.set(type, [relation]);
		}
		return [...byType.entries()]
			.sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
			.map(([type, items]) => ({ type, items }));
	});

	// A gene can own hundreds of regions and a pathway dozens of steps; no
	// page should spend its height on one group. The first screenful shows,
	// the rest stays one click away.
	const PREVIEW = 8;
	let expanded = $state<Record<string, boolean>>({});

	// Catalog types with a detail route. A gene region, a family or an opaque
	// `other` id is shown as text rather than linked to a page that cannot
	// answer it.
	const ROUTABLE = new Set([
		'protein',
		'gene',
		'sequence',
		'fold',
		'pdb-entry',
		'enzyme',
		'restriction-enzyme',
		'reaction',
		'pathway',
		'biobrick',
		'vector',
		'reagent',
		'cell-line',
		'strain',
		'artifact'
	]);
</script>

<Section title={tr('relations_title')} hint={tr('relations_hint')}>
	{#if loading}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else if error}
		<p class="text-sm text-destructive">{tr('relations_error')}</p>
	{:else if rows.length === 0}
		<p class="text-sm text-muted-foreground">{tr('relations_empty')}</p>
	{:else}
		<div class="space-y-4">
			{#each groups as group (group.type)}
				{@const shown = expanded[group.type] ? group.items : group.items.slice(0, PREVIEW)}
				<div>
					<p class="mb-1 text-xs font-semibold text-muted-foreground">
						{enumLabel('et', group.type.replace(/-/g, '_'))} ·
						<span class="tabular-nums">{group.items.length}</span>
					</p>
					<ul class="divide-y">
						{#each shown as r (r.id)}
							{@const far = otherSide(r)}
							<li class="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1.5 text-sm">
								<span class="text-xs text-muted-foreground">{enumLabel('relation', r.relationType)}</span>
								<IdLink
									id={far.id}
									kind={ROUTABLE.has(far.type) ? far.type : undefined}
									label={far.label}
								/>
								{#if far.subtitle}
									<span class="text-xs text-muted-foreground">{far.subtitle}</span>
								{/if}
								{#if far.label}
									<span class="font-mono text-[10px] text-muted-foreground" title={far.id}
										>{shortPublicId(far.id)}</span
									>
								{/if}
								{#if r.source !== 'derived'}
									<Badge tone="muted">{tr('relations_asserted')}</Badge>
								{/if}
								{#if r.note}
									<span class="text-xs text-muted-foreground">{r.note}</span>
								{/if}
							</li>
						{/each}
					</ul>
					{#if group.items.length > PREVIEW}
						<button
							type="button"
							class="mt-1 text-xs text-primary underline-offset-2 hover:underline"
							onclick={() => (expanded[group.type] = !expanded[group.type])}
						>
							{expanded[group.type]
								? tr('relations_show_less')
								: tr('relations_show_more', { count: group.items.length - PREVIEW })}
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</Section>
