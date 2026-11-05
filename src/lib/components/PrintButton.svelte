<script lang="ts">
	// Detail pages print through a separate, re-laid-out document. Opening a
	// new tab is deliberate: the reader keeps their tabs and filters, and the
	// printable page carries every section instead of whichever tab is active.
	import { page } from '$app/state';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import Button from './Button.svelte';
	import { tr } from '$lib/i18n';

	let {
		label = true,
		size = 'sm',
		variant = 'outline'
	}: {
		label?: boolean;
		size?: 'xs' | 'sm' | 'md';
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'link';
	} = $props();

	function openPrintView() {
		const href = `/print${page.url.pathname}?auto=1`;
		const tab = window.open(href, '_blank');
		if (tab) {
			tab.opener = null;
		} else {
			// Popup blocked: still honour the click instead of doing nothing.
			location.assign(href);
		}
	}
</script>

<Button
	{size}
	{variant}
	onclick={openPrintView}
	title={tr('print_page')}
	aria_label={tr('print_page')}
>
	<PrinterIcon class="size-4" />
	{#if label}<span>{tr('print_page')}</span>{/if}
</Button>
