<script lang="ts">
	// Per-page reader tools. Find-in-page is useful everywhere; printing is a
	// detail-page action, so catalog and other list toolbars disable it.
	import PageSearch from './PageSearch.svelte';
	import PrintButton from './PrintButton.svelte';

	let { withPrint = true }: { withPrint?: boolean } = $props();
</script>

<div class="flex flex-wrap items-center gap-2" data-print-hide>
	<PageSearch />
	{#if withPrint}
		<PrintButton />
	{/if}
</div>
