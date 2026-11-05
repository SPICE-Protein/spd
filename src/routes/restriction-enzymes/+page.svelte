<script lang="ts">
	import CatalogPage from '$lib/components/CatalogPage.svelte';
	import { catalogConfig } from '$lib/submit/registry';
	import { restrictionEnzymes } from '$lib/api/client';
	import { tr } from '$lib/i18n';

	// The whole catalog can leave the site as one JSON bundle — a page-side
	// concern (export), not a registry concern, so it overrides here.
	const toolbar = [
		{
			label: tr('re_export'),
			run: async () => {
				const b = await restrictionEnzymes.exportBundle();
				const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
				const a = document.createElement('a');
				a.href = URL.createObjectURL(blob);
				a.download = 'spd-restriction-enzymes.json';
				a.click();
			}
		}
	];
</script>

<CatalogPage config={catalogConfig('restriction-enzymes', { toolbar })} />
