<script lang="ts">
	import type { NodeSpec } from '$lib/graph/registry';
	import { tr } from '$lib/i18n';
	import { getLocale } from '$lib/paraglide/runtime';
	import { savedQueries } from '$lib/state/saved-queries.svelte';
	import Section from './Section.svelte';
	import Input from './Input.svelte';
	import Button from './Button.svelte';

	/** `current` is the builder's live roots, so save captures exactly what is
	 *  on screen right now; `onload` hands a fresh copy back to the builder. */
	let { current, onload }: { current: NodeSpec[]; onload: (roots: NodeSpec[]) => void } = $props();

	let name = $state('');
	let saved = $state(false);

	// The store hydrates from localStorage in its constructor, before the first
	// client render. Wait one effect before showing anything derived from it so
	// the server markup (always empty) and the browser agree. Same approach as
	// AppHeader's `marketReady`.
	let ready = $state(false);
	$effect(() => {
		ready = true;
	});

	$effect(() => {
		if (!saved) return;
		const timer = setTimeout(() => (saved = false), 2400);
		return () => clearTimeout(timer);
	});

	const canSave = $derived(name.trim().length > 0 && current.length > 0);

	function save() {
		if (!canSave) return;
		if (!savedQueries.save(name, current)) return;
		name = '';
		saved = true;
	}

	function load(id: string) {
		const roots = savedQueries.load(id);
		if (roots) onload(roots);
	}

	/** Short date; the list only renders after hydration, so locale/timezone
	 *  cannot produce a server/client mismatch. */
	function dateLabel(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '—';
		return new Intl.DateTimeFormat(getLocale(), { month: 'short', day: 'numeric' }).format(d);
	}
</script>

<Section collapsible title={tr('query_saved_title')}>
	<p class="text-xs text-muted-foreground">{tr('query_saved_hint')}</p>

	<div class="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
		<label class="min-w-52 flex-1 text-sm">
			<span class="text-xs text-muted-foreground">{tr('query_saved_name')}</span>
			<Input
				name="saved_query_name"
				bind:value={name}
				placeholder={tr('query_saved_name_placeholder')}
				class="mt-1 h-8 w-full rounded-none"
				maxlength={80}
				aria_label={tr('query_saved_name')}
				onkeydown={(e) => {
					if (e.key === 'Enter') save();
				}}
			/>
		</label>
		<Button size="sm" class="rounded-none" onclick={save} disabled={!canSave}>{tr('query_saved_save')}</Button>
		{#if saved}<span class="pb-1.5 text-xs text-muted-foreground">{tr('query_saved_done')}</span>{/if}
	</div>

	{#if ready}
		{#if savedQueries.views.length === 0}
			<p class="mt-3 text-sm text-muted-foreground">{tr('query_saved_empty')}</p>
		{:else}
			<ul class="mt-3 divide-y border-t">
				{#each savedQueries.views as view (view.id)}
					<li class="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
						<span class="min-w-0 flex-1 truncate">{view.name}</span>
						<span class="text-xs text-muted-foreground">{dateLabel(view.savedAt)}</span>
						<Button size="xs" variant="outline" class="rounded-none" onclick={() => load(view.id)}>
							{tr('query_saved_load')}
						</Button>
						<Button
							size="xs"
							variant="ghost"
							class="rounded-none text-destructive hover:text-destructive"
							onclick={() => savedQueries.remove(view.id)}
						>
							{tr('query_saved_remove')}
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</Section>
