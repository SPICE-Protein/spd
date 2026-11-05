<script lang="ts">
	import CatalogPage from '$lib/components/CatalogPage.svelte';
	import { catalogConfig } from '$lib/submit/registry';

	const config = catalogConfig('genes');
</script>

<CatalogPage {config} />
