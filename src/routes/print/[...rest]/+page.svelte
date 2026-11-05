<script lang="ts">
	import { page } from '$app/state';
	import { tr } from '$lib/i18n';
	import PrintDocument from '$lib/components/PrintDocument.svelte';
	import { parsePrintPath } from '$lib/print/registry';
	import { loadPrintDocument, type PrintDocumentData } from '$lib/print/load';

	const auto = $derived(page.url.searchParams.get('auto') === '1');

	let data = $state<PrintDocumentData | null>(null);
	let error = $state('');
	let loading = $state(true);
	let generation = 0;
	let printed = $state(false);

	async function load(rest: string | undefined) {
		const run = ++generation;
		loading = true;
		error = '';
		data = null;
		printed = false;

		const target = parsePrintPath(rest);
		if (!target) {
			if (run === generation) {
				error = tr('print_not_found');
				loading = false;
			}
			return;
		}

		try {
			const doc = await loadPrintDocument(target.target, target.id);
			if (run !== generation) return;
			data = doc;
		} catch (e) {
			if (run !== generation) return;
			error = e instanceof Error ? e.message : tr('print_error');
		} finally {
			if (run === generation) loading = false;
		}
	}

	$effect(() => {
		const rest = page.params.rest;
		void load(rest);
	});

	// The button opens this page with ?auto=1. Wait for the document and the
	// serif face to paint before handing the page to the browser dialog.
	$effect(() => {
		if (!data || !auto || printed || typeof window === 'undefined') return;
		printed = true;
		const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
		const images = [...document.images].map((img) =>
			img.complete
				? Promise.resolve()
				: new Promise<void>((resolve) => {
						img.addEventListener('load', () => resolve(), { once: true });
						img.addEventListener('error', () => resolve(), { once: true });
					})
		);
		void Promise.all([fonts, ...images]).then(() => {
			setTimeout(() => window.print(), 250);
		});
	});
</script>

<svelte:head>
	<title>{data ? `${data.title} · ${tr('print_view_title')}` : tr('print_view_title')} · SPD</title>
</svelte:head>

{#if loading}
	<div class="print-loading">{tr('print_preparing')}</div>
{:else if error}
	<div class="print-loading">{error}</div>
{:else if data}
	<PrintDocument
		title={data.title}
		category={data.category}
		publicId={data.publicId}
		sourceHref={data.sourceHref}
		record={data.record}
		extras={data.extras}
		wiki={data.wiki}
		references={data.references}
		identifiers={data.identifiers}
		relations={data.relations}
		importProvenance={data.importProvenance}
		generatedAt={data.generatedAt}
	/>
{/if}

<style>
	.print-loading {
		margin: 15vh auto;
		max-width: 32rem;
		padding: 1rem;
		text-align: center;
		color: #555;
		font-family: var(--font-serif);
		font-size: 0.95rem;
	}
</style>
