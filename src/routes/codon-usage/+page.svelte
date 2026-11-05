<script lang="ts">
	import { goto } from '$app/navigation';
	import CatalogPage from '$lib/components/CatalogPage.svelte';
	import { catalogConfig } from '$lib/submit/registry';
	import { tr } from '$lib/i18n';

	// CatalogPage's toolbar is a list of action buttons; navigating to the
	// workbench is a screen change, not a data export, but it keeps this route
	// untouched apart from one override.
	const config = catalogConfig('codon-usage', {
		toolbar: [
			{
				label: tr('cw_catalog_link'),
				run: async () => {
					await goto('/codon-workbench');
				}
			}
		]
	});
</script>

<CatalogPage {config} />
