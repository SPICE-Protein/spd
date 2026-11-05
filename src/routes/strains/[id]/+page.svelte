<script lang="ts">
	import { page } from '$app/state';
	import EntityDetail from '$lib/components/EntityDetail.svelte';
	import type { EntityDetailConfig } from '$lib/components/EntityDetail.svelte';
	import { strains } from '$lib/api/client';
	import { tr } from '$lib/i18n';

	const id = $derived(page.params.id ?? '');

	const config = $derived.by((): EntityDetailConfig => ({
		title: tr('browse_strains'),
		id,
		get: (i) => strains.get(i),
		scalarKeys: ['id', 'name', 'species', 'genotype', 'background', 'createdAt'],
		route: 'strains',
		entityType: 'strain',
		suppliers: {
			add: (b) => strains.suppliers(id).add(b),
			remove: (sid) => strains.suppliers(id).remove(sid),
		},
	}));
</script>

<EntityDetail {config} />
