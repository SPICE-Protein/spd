<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import favicon from '$lib/assets/favicon.svg';
	import { session } from '$lib/state/session.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import ApiStatus from '$lib/components/ApiStatus.svelte';
	import DebugPanel from '$lib/components/DebugPanel.svelte';
	import FoldEasterEgg from '$lib/components/FoldEasterEgg.svelte';
	import { seasonal } from '$lib/state/seasonal.svelte';
	import { BASE_URL } from '$lib/api/base';
	import { tr, isZh } from '$lib/i18n';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let { children } = $props();
	const printView = $derived(page.url.pathname.startsWith('/print/'));

	// Seasonal garnish is client-only; `?season=` gives the team a preview
	// switch without waiting for the calendar.
	$effect(() => {
		seasonal.sync(page.url.searchParams.get('season'));
	});

	// A printed record should read top to bottom, including the evidence that
	// normally waits behind a disclosure triangle. Before the browser paints
	// the print preview, open every <details>; put the page back the way the
	// reader left it afterwards.
	let printedOn = $state('');
	onMount(() => {
		if (browser) void session.load();
		printedOn = new Intl.DateTimeFormat(isZh() ? 'zh-CN' : 'en-GB', {
			dateStyle: 'medium'
		}).format(new Date());

		let opened: HTMLDetailsElement[] = [];
		const openAll = () => {
			opened = [...document.querySelectorAll<HTMLDetailsElement>('details:not([open])')];
			for (const d of opened) d.open = true;
		};
		const restore = () => {
			for (const d of opened) d.open = false;
			opened = [];
		};
		window.addEventListener('beforeprint', openAll);
		window.addEventListener('afterprint', restore);
		return () => {
			window.removeEventListener('beforeprint', openAll);
			window.removeEventListener('afterprint', restore);
		};
	});
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={favicon} />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
</svelte:head>

<div class="flex min-h-dvh flex-col">
	{#if !printView}
		<AppHeader />
	{/if}
	<main class={printView ? 'flex-1' : 'mx-auto w-full max-w-7xl flex-1 px-4 py-6'}>
		{@render children()}
	</main>
	{#if !printView}
		<footer class="border-t py-4 text-center text-xs text-muted-foreground" data-print-hide>
			{tr('footer_blurb')} ·
			<a class="underline" href={`${BASE_URL}/api/v1/openapi.json`}>OpenAPI</a> ·
			<a class="underline" href="https://github.com/SPICE-Protein">SPICE-Protein</a> ·
			<ApiStatus />
		</footer>
	{/if}
</div>
{#if !printView}
	<div class="spd-print-footer" aria-hidden="true">
		<span>SPD · {tr('app_tagline')}</span>
		<span>{page.url.pathname}</span>
		<span>{printedOn}</span>
	</div>
{/if}
<Toaster />
{#if !printView}
	<FoldEasterEgg />
{/if}
<DebugPanel />

<div style="display:none">
	{#each locales as loc (loc)}
		<a href={localizeHref(page.url.pathname, { locale: loc })}>{loc}</a>
	{/each}
</div>
