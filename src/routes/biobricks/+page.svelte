<script lang="ts">
	import CatalogPage from '$lib/components/CatalogPage.svelte';
	import BiobrickRegistrySearch from '$lib/components/BiobrickRegistrySearch.svelte';
	import { catalogConfig } from '$lib/submit/registry';
</script>

<BiobrickRegistrySearch />
<CatalogPage config={catalogConfig('biobricks')} />
