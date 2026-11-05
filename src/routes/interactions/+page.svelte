<script lang="ts">
	import CatalogPage from '$lib/components/CatalogPage.svelte';
	import { catalogConfig } from '$lib/submit/registry';
</script>

<CatalogPage config={catalogConfig('interactions')} />
