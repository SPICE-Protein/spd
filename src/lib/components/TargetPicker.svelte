<script lang="ts">
	import { search } from '$lib/api/client';
	import type { SearchHit } from '$lib/api/types';
	import { tr, enumLabel } from '$lib/i18n';
	import { hitTitle, entityHref, shortPublicId } from '$lib/format';
	import Button from './Button.svelte';
	import Input from './Input.svelte';
	import Badge from './Badge.svelte';
	import { searchTermTooLong } from '$lib/search-limit';

	/**
	 * Find-the-record step for statements that talk ABOUT another record
	 * (corrections, retractions, contributions). Nobody should have to paste
	 * an spd: id they got from a URL bar; search for the thing and click it.
	 *
	 * `initial` lets a caller seed a known id (a ?foldId= deep link, a value
	 * carried from a previous wizard) so it renders as the picked chip right
	 * away instead of forcing a re-search — the id is already resolved.
	 */
	let {
		onpick,
		entityType = undefined,
		initial = undefined
	}: {
		onpick: (hit: SearchHit | null) => void;
		entityType?: string;
		initial?: { id: string; label?: string } | undefined;
	} = $props();

	let q = $state('');
	let hits = $state<SearchHit[]>([]);
	// an initial id is treated as already-picked; `touched` gates the chip so
	// clearing it (change()) never resurrects the seed.
	let picked = $state<SearchHit | null>(null);
	let touched = $state(false);
	let loading = $state(false);
	let error = $state('');

	const shown = $derived<SearchHit | null>(
		picked ?? (!touched && initial ? ({ id: initial.id, entityType: entityType ?? '', ...(initial.label ? { preferredName: initial.label } : {}) } as SearchHit) : null)
	);

	async function run() {
		error = '';
		const term = q.trim();
		if (!term) return;
		if (searchTermTooLong(term)) {
			error = tr('search_term_too_long');
			return;
		}
		loading = true;
		try {
			const env = await search.run({ q: term, entityType, limit: 10 });
			hits = Array.isArray(env.data) ? (env.data as SearchHit[]) : [];
			if (!hits.length) error = tr('target_picker_no_results');
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	function choose(h: SearchHit) {
		picked = h;
		touched = true;
		hits = [];
		onpick(h);
	}

	function change() {
		picked = null;
		touched = true;
		onpick(null);
	}
</script>

{#if shown}
	<div class="flex flex-wrap items-center gap-2 rounded-none border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
		<span class="font-medium">{hitTitle(shown, shortPublicId(shown.id))}</span>
		{#if shown.entityType}<Badge class="font-mono text-xs">{enumLabel('et', shown.entityType.replace(/-/g, '_'))}</Badge>{/if}
		{#if shown.entityType}<a class="underline" href={entityHref(shown.entityType, shown.id)}>{tr('common_view')}</a>{/if}
		<Button size="xs" variant="ghost" onclick={change}>{tr('target_picker_change')}</Button>
	</div>
{:else}
	<div class="flex gap-2">
		<Input name="tp_q" type="search" class="h-9 flex-1" placeholder={tr('target_picker_placeholder')} bind:value={q} onkeydown={(e) => e.key === 'Enter' && run()} />
		<Button size="sm" variant="outline" onclick={run} disabled={loading}>{tr('target_picker_find')}</Button>
	</div>
	{#if error && !hits.length}
		<p class="mt-2 text-xs text-destructive">{error}</p>
	{:else if hits.length}
		<ul class="mt-2 divide-y rounded-none border">
			{#each hits as h (h.id)}
				<li>
					<Button variant="ghost" class="h-auto w-full justify-start gap-2 px-3 py-2 text-left" onclick={() => choose(h)}>
						<span class="font-medium">{hitTitle(h, shortPublicId(h.id))}</span>
						<span class="text-xs text-muted-foreground">{enumLabel('et', h.entityType.replace(/-/g, '_'))}</span>
						<span class="ml-auto font-mono text-xs text-muted-foreground">{shortPublicId(h.id)}</span>
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
{/if}
