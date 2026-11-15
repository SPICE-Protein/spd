<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { relations, search } from '$lib/api/client';
	import type { EntityRelation, SearchHit } from '$lib/api/types';
	import { tr, enumLabel } from '$lib/i18n';
	import { hitTitle, shortPublicId } from '$lib/format';
	import {
		CHILD_LIMIT,
		MAX_DEPTH,
		attachRelations,
		patchNode,
		startWalk,
		visibleNodes,
		type WalkState
	} from '$lib/graph/walk';
	import { mapHref, startFromParams, typeFromPublicId, type MapStart } from '$lib/graph/start';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import MapCanvas from '$lib/components/map/MapCanvas.svelte';

	// A walk, not a query: one record on the canvas, one hop per click, one
	// `relations` request per node the reader actually opened. Nothing is
	// prefetched, so the map costs what it looks like it costs.
	let walk = $state<WalkState>({ nodes: [], edges: [] });
	let term = $state('');
	let hits = $state<SearchHit[]>([]);
	let resolving = $state(false);
	let message = $state('');

	// A record only ever expands once; the cache makes a collapse/expand pair
	// free and keeps a backlink from ever costing a second request.
	const cache = new Map<string, EntityRelation[]>();

	// Nodes the reader moved by hand. Tidy throws them away and the layout
	// takes over again.
	let pinned = $state<Record<string, { x: number; y: number }>>({});
	// Bumped when the view should re-frame after a tidy.
	let fitToken = $state(0);

	let generation = 0;

	async function start(seed: MapStart) {
		generation += 1;
		walk = startWalk(seed);
		cache.clear();
		pinned = {};
		hits = [];
		message = '';
		void goto(mapHref(seed), { keepFocus: true, noScroll: true, replaceState: true });
		await expand(walk.nodes[0].key);
	}

	async function expand(key: string) {
		const node = walk.nodes.find((n) => n.key === key);
		if (!node) return;
		if (node.expanded) {
			walk = patchNode(walk, key, { expanded: false });
			return;
		}
		if (node.depth >= MAX_DEPTH) {
			// Say it out loud: the walk stopped, the record did not run out.
			walk = patchNode(walk, key, { expanded: true });
			return;
		}
		const cached = cache.get(node.key);
		if (cached) {
			walk = attachRelations(
				patchNode(walk, key, { expanded: true, status: 'loaded', error: null }),
				key,
				cached
			);
			return;
		}
		const run = generation;
		walk = patchNode(walk, key, { expanded: true, status: 'loading', error: null });
		try {
			const res = await relations.forEntity(node.type, node.id);
			if (run !== generation) return;
			const list = Array.isArray(res.relations) ? res.relations : [];
			cache.set(node.key, list);
			walk = attachRelations(patchNode(walk, key, { status: 'loaded' }), key, list);
		} catch (e) {
			if (run !== generation) return;
			walk = patchNode(walk, key, {
				expanded: false,
				status: 'error',
				error: e instanceof Error ? e.message : String(e)
			});
		}
	}

	function showMore(key: string) {
		const node = walk.nodes.find((n) => n.key === key);
		if (!node) return;
		walk = patchNode(walk, key, { childLimit: node.childLimit + CHILD_LIMIT });
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
		walk = { nodes: [], edges: [] };
		pinned = {};
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

	const visible = $derived(visibleNodes(walk.nodes));
	const maxDepthShown = $derived(visible.reduce((acc, n) => Math.max(acc, n.depth), 0));
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
		{#if walk.nodes.length > 0}
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

	{#if walk.nodes.length === 0}
		<p class="text-sm text-muted-foreground">{tr('map_empty')}</p>
	{:else}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
			<span>{tr('map_node_count', { count: visible.length })}</span>
			<span>{tr('map_depth_count', { depth: maxDepthShown, max: MAX_DEPTH })}</span>
			<span>{tr('map_click_hint')}</span>
		</div>

		<MapCanvas
			{walk}
			{pinned}
			{fitToken}
			onToggle={(key) => void expand(key)}
			onMore={showMore}
			onPlace={(key, position) => (pinned = { ...pinned, [key]: position })}
			onTidy={() => {
				pinned = {};
				fitToken += 1;
			}}
		/>
	{/if}
</div>
