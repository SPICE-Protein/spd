<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { relations, search } from '$lib/api/client';
	import type { EntityRelation, SearchHit } from '$lib/api/types';
	import { tr, enumLabel } from '$lib/i18n';
	import { entityHref, hitTitle, shortPublicId } from '$lib/format';
	import {
		CHILD_LIMIT,
		MAX_DEPTH,
		NODE_H,
		NODE_W,
		attachRelations,
		hiddenChildren,
		layoutWalk,
		patch,
		rootNode,
		visibleNodes,
		type WalkNode
	} from '$lib/graph/walk';
	import { mapHref, startFromParams, typeFromPublicId, type MapStart } from '$lib/graph/start';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';

	// A walk, not a query: one record on the canvas, one hop per click, one
	// `relations` request per node the reader actually opened. Nothing is
	// prefetched, so the map costs what it looks like it costs.
	let nodes = $state<WalkNode[]>([]);
	let term = $state('');
	let hits = $state<SearchHit[]>([]);
	let resolving = $state(false);
	let message = $state('');

	// A record reached twice (the same gene under two proteins) is rendered as
	// two nodes but read from one cached relation list.
	const cache = new Map<string, EntityRelation[]>();

	let generation = 0;

	async function start(seed: MapStart) {
		generation += 1;
		nodes = [rootNode(seed)];
		cache.clear();
		hits = [];
		message = '';
		void goto(mapHref(seed), { keepFocus: true, noScroll: true, replaceState: true });
		await expand(nodes[0].key);
	}

	async function expand(key: string) {
		const node = nodes.find((n) => n.key === key);
		if (!node) return;
		if (node.expanded) {
			nodes = patch(nodes, key, { expanded: false });
			return;
		}
		if (node.depth >= MAX_DEPTH) {
			// Say it out loud: the walk stopped, the record did not run out.
			nodes = patch(nodes, key, { expanded: true });
			return;
		}
		const cached = cache.get(node.record);
		if (cached) {
			nodes = attachRelations(
				patch(nodes, key, { expanded: true, status: 'loaded', error: null }),
				key,
				cached
			);
			return;
		}
		const run = generation;
		nodes = patch(nodes, key, { expanded: true, status: 'loading', error: null });
		try {
			const res = await relations.forEntity(node.type, node.id);
			if (run !== generation) return;
			const list = Array.isArray(res.relations) ? res.relations : [];
			cache.set(node.record, list);
			nodes = attachRelations(patch(nodes, key, { status: 'loaded' }), key, list);
		} catch (e) {
			if (run !== generation) return;
			nodes = patch(nodes, key, {
				expanded: false,
				status: 'error',
				error: e instanceof Error ? e.message : String(e)
			});
		}
	}

	function showMore(key: string) {
		const node = nodes.find((n) => n.key === key);
		if (!node) return;
		nodes = patch(nodes, key, { childLimit: node.childLimit + CHILD_LIMIT });
	}

	async function submitTerm() {
		const raw = term.trim();
		if (!raw) return;
		const type = typeFromPublicId(raw);
		if (type) {
			await start({ type, id: raw });
			return;
		}
		resolving = true;
		message = '';
		try {
			const env = await search.run({ q: raw, limit: 8 });
			hits = Array.isArray(env.data) ? env.data : [];
			if (hits.length === 0) message = tr('map_no_hits', { q: raw });
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			resolving = false;
		}
	}

	function pick(hit: SearchHit) {
		void start({
			type: hit.entityType,
			id: hit.id,
			label: hitTitle(hit, shortPublicId(hit.id)),
			subtitle: enumLabel('et', hit.entityType.replace(/-/g, '_'))
		});
	}

	function reset() {
		generation += 1;
		nodes = [];
		hits = [];
		message = '';
		cache.clear();
		void goto('/map', { keepFocus: true, noScroll: true, replaceState: true });
	}

	onMount(() => {
		const seed = startFromParams(page.url.searchParams);
		if (seed) {
			void start(seed);
			return;
		}
		// A link from search can arrive with a name instead of an id; show the
		// candidates rather than an empty canvas.
		const named = page.url.searchParams.get('q')?.trim();
		if (named) {
			term = named;
			void submitTerm();
		}
	});

	const visible = $derived(visibleNodes(nodes));
	const layout = $derived(layoutWalk(visible));
	// Edges are drawn between the positions the layout just handed out, so a
	// collapsed branch takes its arrows with it.
	const edges = $derived.by(() => {
		const at = new Map(layout.positions.map((p) => [p.node.key, p]));
		const drawn: { key: string; d: string; repeat: boolean }[] = [];
		for (const p of layout.positions) {
			const from = p.node.parent ? at.get(p.node.parent) : undefined;
			if (!from) continue;
			const x1 = from.x + NODE_W;
			const y1 = from.y + NODE_H / 2;
			const x2 = p.x;
			const y2 = p.y + NODE_H / 2;
			const mid = x1 + (x2 - x1) / 2;
			drawn.push({
				key: p.node.key,
				d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`,
				repeat: p.node.repeat
			});
		}
		return drawn;
	});
	const maxDepthShown = $derived(layout.positions.reduce((acc, p) => Math.max(acc, p.node.depth), 0));

	function relationLabel(node: WalkNode): string {
		if (!node.relation) return enumLabel('et', node.type.replace(/-/g, '_'));
		const verb = enumLabel('relation', node.relation);
		const arrow = node.direction === 'in' ? '←' : '→';
		return `${arrow} ${verb}`;
	}
</script>

<svelte:head>
	<title>{tr('map_title')} · SPD</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-4 p-4">
	<header class="space-y-1">
		<h1 class="font-heading text-xl font-semibold">{tr('map_title')}</h1>
		<p class="max-w-3xl text-sm text-muted-foreground">{tr('map_intro')}</p>
	</header>

	<form
		class="flex flex-wrap items-center gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			void submitTerm();
		}}
	>
		<div class="min-w-0 flex-1 sm:max-w-md">
			<Input name="map-seed" bind:value={term} placeholder={tr('map_input_placeholder')} />
		</div>
		<Button type="submit" disabled={resolving || !term.trim()}>
			{resolving ? tr('common_loading') : tr('map_start')}
		</Button>
		{#if nodes.length > 0}
			<Button variant="ghost" onclick={reset}>{tr('map_reset')}</Button>
		{/if}
	</form>

	{#if message}
		<p class="text-sm text-muted-foreground">{message}</p>
	{/if}

	{#if hits.length > 0}
		<Section title={tr('map_pick')} hint={tr('map_pick_hint')}>
			<ul class="divide-y">
				{#each hits as hit (hit.id)}
					<li>
						<button
							type="button"
							class="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5 text-left hover:bg-muted/50"
							onclick={() => pick(hit)}
						>
							<span class="text-sm font-medium">{hitTitle(hit, shortPublicId(hit.id))}</span>
							<span class="text-xs text-muted-foreground">
								{enumLabel('et', hit.entityType.replace(/-/g, '_'))}
							</span>
							<span class="font-mono text-[10px] text-muted-foreground">{hit.id}</span>
						</button>
					</li>
				{/each}
			</ul>
		</Section>
	{/if}

	{#if nodes.length === 0}
		<p class="text-sm text-muted-foreground">{tr('map_empty')}</p>
	{:else}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
			<span>{tr('map_node_count', { count: visible.length })}</span>
			<span>{tr('map_depth_count', { depth: maxDepthShown, max: MAX_DEPTH })}</span>
			<span>{tr('map_click_hint')}</span>
		</div>

		<div class="overflow-x-auto border bg-muted/20">
			<div
				class="relative m-3"
				style={`width:${layout.width}px;height:${layout.height}px`}
			>
				<svg
					class="pointer-events-none absolute inset-0"
					width={layout.width}
					height={layout.height}
					aria-hidden="true"
				>
					{#each edges as edge (edge.key)}
						<path
							d={edge.d}
							fill="none"
							class={edge.repeat ? 'stroke-foreground/35' : 'stroke-foreground/20'}
							stroke-width="1.25"
							stroke-dasharray={edge.repeat ? '4 3' : undefined}
						/>
					{/each}
				</svg>

				{#each layout.positions as p (p.node.key)}
					{@const n = p.node}
					{@const hidden = hiddenChildren(nodes, n.key)}
					<div
						class="absolute border bg-card {n.repeat
							? 'border-dashed border-foreground/35'
							: 'border-foreground/15'} {n.status === 'error' ? 'border-destructive' : ''}"
						style={`left:${p.x}px;top:${p.y}px;width:${NODE_W}px;height:${NODE_H}px`}
					>
						<button
							type="button"
							class="flex h-full w-full flex-col items-start justify-center gap-0.5 px-2 py-1 pr-7 text-left"
							title={n.label ? `${n.label} — ${n.id}` : n.id}
							onclick={() => void expand(n.key)}
						>
							<span class="w-full truncate text-sm font-medium">
								{n.label || shortPublicId(n.id)}
							</span>
							<span class="w-full truncate text-[11px] text-muted-foreground">
								{relationLabel(n)}
							</span>
							{#if n.subtitle}
								<span class="w-full truncate text-[10px] text-muted-foreground">{n.subtitle}</span>
							{/if}
						</button>

						<a
							class="absolute top-1 right-1 text-xs text-muted-foreground hover:text-foreground"
							href={entityHref(n.type, n.id)}
							title={tr('map_open_record')}
							aria-label={tr('map_open_record')}
						>
							↗
						</a>

						{#if n.status === 'loading'}
							<span class="absolute bottom-1 left-2 font-mono text-[10px] text-muted-foreground">
								…
							</span>
						{:else if n.status === 'error'}
							<span
								class="absolute right-1 bottom-1 max-w-[80%] truncate text-[10px] text-destructive"
								title={n.error ?? ''}
							>
								{tr('map_node_error')}
							</span>
						{:else if n.expanded && hidden > 0}
							<button
								type="button"
								class="absolute right-1 bottom-0.5 text-[10px] text-primary hover:underline"
								onclick={() => showMore(n.key)}
							>
								{tr('map_show_more', { count: hidden })}
							</button>
						{:else if n.depth >= MAX_DEPTH}
							<span
								class="absolute right-1 bottom-0.5 font-mono text-[10px] text-muted-foreground"
							>
								{tr('map_depth_limit')}
							</span>
						{:else if n.expanded}
							<span
								class="absolute right-1 bottom-0.5 text-[10px] text-muted-foreground"
							>
								{tr('map_no_connections')}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
