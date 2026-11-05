<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { tr } from '$lib/i18n';
	import Button from './Button.svelte';

	/**
	 * Find-in-page for long record pages. Browser find stops being useful when
	 * a record is split across tabs and dense tables; this widget searches the
	 * rendered main content, paints every hit with the CSS Custom Highlight
	 * API (no DOM mutation, so links and Svelte state survive), and opens any
	 * collapsed <details> ancestor before scrolling to the active match.
	 *
	 * The shortcut is Cmd/Ctrl+Shift+F rather than Cmd/Ctrl+F: the native find
	 * box is still the right tool for a quick word, and hijacking it would be
	 * rude. Each category page renders this next to its print action.
	 */
	let open = $state(false);
	let term = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);
	let matches = $state<Range[]>([]);
	let activeIndex = $state(0);
	let searched = $state(false);

	const MAX_MATCHES = 500;
	const HIGHLIGHT_ALL = 'spd-page-find';
	const HIGHLIGHT_ACTIVE = 'spd-page-find-active';

	function highlightSupported() {
		return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
	}

	function clearPaint() {
		if (highlightSupported()) {
			CSS.highlights.delete(HIGHLIGHT_ALL);
			CSS.highlights.delete(HIGHLIGHT_ACTIVE);
		} else {
			window.getSelection()?.removeAllRanges();
		}
	}

	function paint() {
		if (highlightSupported()) {
			CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...matches));
			const active = matches[activeIndex];
			if (active) CSS.highlights.set(HIGHLIGHT_ACTIVE, new Highlight(active));
			else CSS.highlights.delete(HIGHLIGHT_ACTIVE);
			return;
		}
		// Older engines keep a native selection on the current hit so "next"
		// still visibly moves, even without the amber highlights.
		const active = matches[activeIndex];
		const sel = window.getSelection();
		if (active && sel) {
			sel.removeAllRanges();
			sel.addRange(active);
		}
	}

	function visibleTextNode(node: Node): node is Text {
		if (!(node instanceof Text) || !node.nodeValue?.trim()) return false;
		const parent = node.parentElement;
		if (!parent) return false;
		if (parent.closest('script, style, noscript, textarea, [data-page-find-ignore]')) return false;
		return true;
	}

	function collect() {
		const q = term.trim();
		if (!q) {
			matches = [];
			activeIndex = 0;
			searched = false;
			clearPaint();
			return;
		}
		const root = document.querySelector('main');
		if (!root) return;
		const needle = q.toLocaleLowerCase();
		const ranges: Range[] = [];
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) =>
				visibleTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
		});
		while (walker.nextNode() && ranges.length < MAX_MATCHES) {
			const node = walker.currentNode as Text;
			const hay = node.nodeValue?.toLocaleLowerCase() ?? '';
			let from = 0;
			while (ranges.length < MAX_MATCHES) {
				const at = hay.indexOf(needle, from);
				if (at < 0) break;
				const range = document.createRange();
				range.setStart(node, at);
				range.setEnd(node, at + q.length);
				ranges.push(range);
				from = at + needle.length;
			}
		}
		matches = ranges;
		activeIndex = 0;
		searched = true;
		paint();
		if (ranges.length) void scrollToActive();
	}

	function revealDetails(range: Range) {
		let el = range.startContainer.parentElement;
		while (el) {
			if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
			el = el.parentElement;
		}
	}

	async function scrollToActive() {
		const range = matches[activeIndex];
		if (!range) return;
		revealDetails(range);
		await tick();
		// Two frames: the first lets <details> lay out, the second scrolls to
		// the final position instead of the pre-expansion one.
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
		);
		range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	function step(delta: number) {
		if (!matches.length) return;
		activeIndex = (activeIndex + delta + matches.length) % matches.length;
		paint();
		void scrollToActive();
	}

	function openSearch() {
		open = true;
		void tick().then(() => inputEl?.focus());
	}

	function close() {
		open = false;
		clearPaint();
	}

	$effect(() => {
		// A route change replaces <main>; stale Range objects would point into
		// the old document and the count would be a lie.
		page.url.pathname;
		open = false;
		matches = [];
		activeIndex = 0;
		searched = false;
		clearPaint();
	});

	onMount(() => {
		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
				e.preventDefault();
				openSearch();
				return;
			}
			if (e.key === 'Escape' && open) {
				e.preventDefault();
				close();
			}
		}
		window.addEventListener('keydown', onKey);

		// Data arrives after the first paint on almost every record page. While
		// the panel is open, recompute after the DOM settles rather than making
		// the reader press Enter again.
		let timer: ReturnType<typeof setTimeout> | undefined;
		const observer = new MutationObserver(() => {
			if (!open || !term.trim()) return;
			clearTimeout(timer);
			timer = setTimeout(() => collect(), 250);
		});
		const main = document.querySelector('main');
		if (main) observer.observe(main, { childList: true, subtree: true, characterData: true });

		return () => {
			window.removeEventListener('keydown', onKey);
			observer.disconnect();
			clearTimeout(timer);
			clearPaint();
		};
	});
</script>

<Button
	size="xs"
	variant="ghost"
	class="inline-flex whitespace-nowrap text-muted-foreground"
	onclick={openSearch}
	title={`${tr('page_find')} · Ctrl/⌘+Shift+F`}
	aria_label={tr('page_find')}
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 16 16"
		class="h-3.5 w-3.5"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
	>
		<circle cx="7" cy="7" r="4.25" />
		<path d="m10.2 10.2 3 3" />
	</svg>
	<span class="ml-1 hidden md:inline">{tr('page_find')}</span>
</Button>

{#if open}
	<div
		class="fixed right-3 top-14 z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-none border bg-popover p-2 text-popover-foreground shadow-lg"
		role="search"
		data-page-find-ignore
	>
		<div class="flex items-center gap-1.5">
			<input
				bind:this={inputEl}
				bind:value={term}
				oninput={collect}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						if (e.shiftKey) step(-1);
						else step(1);
					}
				}}
				type="search"
				class="h-8 min-w-0 flex-1 rounded-none border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
				placeholder={tr('page_find_placeholder')}
				aria-label={tr('page_find_placeholder')}
			/>
			<span class="min-w-14 text-right text-xs tabular-nums text-muted-foreground">
				{#if term.trim()}
					{matches.length ? `${activeIndex + 1} / ${matches.length}` : tr('page_find_no_matches')}
				{:else}&nbsp;{/if}
			</span>
			<Button
				size="xs"
				variant="ghost"
				disabled={!matches.length}
				onclick={() => step(-1)}
				aria_label={tr('page_find_prev')}
				title={tr('page_find_prev')}>↑</Button
			>
			<Button
				size="xs"
				variant="ghost"
				disabled={!matches.length}
				onclick={() => step(1)}
				aria_label={tr('page_find_next')}
				title={tr('page_find_next')}>↓</Button
			>
			<Button
				size="xs"
				variant="ghost"
				onclick={close}
				aria_label={tr('page_find_close')}
				title={tr('page_find_close')}>×</Button
			>
		</div>
		{#if !searched}
			<p class="mt-1 text-[11px] text-muted-foreground">{tr('page_find_hint')}</p>
		{/if}
	</div>
{/if}
