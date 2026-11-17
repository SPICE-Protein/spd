<script lang="ts">
	import CatalogPage from '$lib/components/CatalogPage.svelte';
	import BiobrickRegistryImport from '$lib/components/BiobrickRegistryImport.svelte';
	import { catalogConfig } from '$lib/submit/registry';
</script>

<BiobrickRegistryImport />
<CatalogPage config={catalogConfig('biobricks')} />
