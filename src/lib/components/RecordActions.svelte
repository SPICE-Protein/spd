<script lang="ts">
	/**
	 * Per-record actions shared by the detail pages: copy the public id or the
	 * canonical link, cite, shortlist in the local Market, and continue into the
	 * related submission flows.
	 *
	 * The menu follows ExportMenu's fixed-position + viewport clamp pattern:
	 * these buttons sit on both edges of record headers, and `absolute right-0`
	 * would push the panel off-screen on the left one.
	 */
	import { tick, untrack } from 'svelte';
	import { tr } from '$lib/i18n';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import { market } from '$lib/state/market.svelte';
	import { recent } from '$lib/state/recent.svelte';
	import type { CitationRecord } from '$lib/citation';
	import CitationDialog from './CitationDialog.svelte';

	let {
		entityType,
		id,
		name,
		href,
		record = undefined,
		related = []
	}: {
		entityType: string;
		id: string;
		name: string;
		href: string;
		record?: unknown;
		related?: Array<{ label: string; href: string }>;
	} = $props();

	let open = $state(false);
	let showCite = $state(false);
	let buttonEl = $state<HTMLButtonElement>();
	let menuEl = $state<HTMLDivElement>();
	let position = $state({ left: 0, top: 0, width: 208 });

	// Reads market.items ($state), so the add/remove label follows the store.
	const inMarket = $derived(market.has(entityType, id));
	let citationRecord = $state<CitationRecord | null>(null);

	// A detail page mounting this component is a visit; the local trail backs
	// the "Recently viewed" shelf in /my. Effects never run during SSR.
	// `remember` reads and rewrites recent.items, so the write must stay out
	// of the tracked dependency set — otherwise the effect re-runs forever.
	$effect(() => {
		const visit = { id, entityType, name, href };
		untrack(() => recent.remember(visit));
	});

	async function toggle() {
		open = !open;
		if (!open) return;
		await tick();
		if (!buttonEl || !menuEl) return;
		const pad = 8;
		const width = Math.min(menuEl.offsetWidth || 208, window.innerWidth - pad * 2);
		const anchor = buttonEl.getBoundingClientRect();
		let left = anchor.left;
		if (left + width > window.innerWidth - pad) left = anchor.right - width;
		left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
		let top = anchor.bottom + 4;
		const height = menuEl.offsetHeight;
		if (top + height > window.innerHeight - pad) {
			top = Math.max(pad, anchor.top - height - 4);
		}
		position = { left, top, width };
	}

	function currentUrl(): string {
		return typeof window !== 'undefined' ? window.location.href : href;
	}

	async function copyText(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toastOk(tr('common_copied'));
			open = false;
		} catch {
			toastErr(tr('upload_clipboard_fail'));
		}
	}

	function openCitation() {
		// Freeze the access date here; the dialog must not re-read the clock.
		citationRecord = {
			id,
			entityType,
			name,
			url: currentUrl(),
			accessed: new Date()
		};
		showCite = true;
		open = false;
	}

	function toggleMarket() {
		const wasInMarket = market.has(entityType, id);
		market.toggle({ id, entityType, name, href });
		toastOk(wasInMarket ? tr('action_remove_market') : tr('market_added'));
		open = false;
	}

</script>

<div data-print-hide class="relative inline-block text-left">
	<button
		bind:this={buttonEl}
		type="button"
		class="inline-flex h-7 items-center gap-1.5 border border-input bg-background px-2.5 text-xs font-medium hover:bg-accent"
		aria-expanded={open}
		aria-haspopup="menu"
		onclick={toggle}
	>
		{tr('action_title')}
		<span class="text-muted-foreground" aria-hidden="true">▾</span>
	</button>
	{#if open}
		<div class="fixed inset-0 z-20" aria-hidden="true" onclick={() => (open = false)}></div>
		<div
			bind:this={menuEl}
			class="fixed z-30 border border-border bg-background p-1 shadow-lg"
			role="menu"
			style="left: {position.left}px; top: {position.top}px; width: {position.width}px;"
		>
			<button
				type="button"
				class="flex w-full items-center px-2 py-1.5 text-left text-xs hover:bg-muted"
				role="menuitem"
				onclick={() => void copyText(id)}>{tr('action_copy_id')}</button
			>
			<button
				type="button"
				class="flex w-full items-center px-2 py-1.5 text-left text-xs hover:bg-muted"
				role="menuitem"
				onclick={() => void copyText(currentUrl())}>{tr('action_copy_link')}</button
			>
			<button
				type="button"
				class="flex w-full items-center px-2 py-1.5 text-left text-xs hover:bg-muted"
				role="menuitem"
				onclick={openCitation}>{tr('action_cite')}</button
			>
			<div class="my-1 h-px bg-border"></div>
			<button
				type="button"
				class="flex w-full items-center px-2 py-1.5 text-left text-xs hover:bg-muted"
				role="menuitem"
				onclick={toggleMarket}
			>
				{inMarket ? tr('action_remove_market') : tr('action_add_market')}
				{#if inMarket}
					<span class="ml-auto pl-2 text-muted-foreground">{tr('action_in_market')}</span>
				{/if}
			</button>
			{#if related.length}
				<div class="my-1 h-px bg-border"></div>
				<div class="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
					{tr('action_related')}
				</div>
				{#each related as item (item.href + item.label)}
					<a
						class="flex w-full items-center px-2 py-1.5 text-left text-xs hover:bg-muted"
						role="menuitem"
						href={item.href}
						onclick={() => (open = false)}>{item.label}</a
					>
				{/each}
			{/if}
		</div>
	{/if}
</div>

{#if citationRecord}
	<CitationDialog bind:open={showCite} record={citationRecord} filename={`${name}.bib`} />
{/if}
