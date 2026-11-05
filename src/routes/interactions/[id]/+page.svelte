<script lang="ts">
	import { page } from '$app/state';
	import EntityDetail from '$lib/components/EntityDetail.svelte';
	import type { EntityDetailConfig } from '$lib/components/EntityDetail.svelte';
	import { interactions } from '$lib/api/client';
	import { tr } from '$lib/i18n';

	const id = $derived(page.params.id ?? '');

	const config = $derived.by((): EntityDetailConfig => ({
		title: tr('browse_interactions'),
		id,
		get: (i) => interactions.get(i),
		scalarKeys: ['id', 'foldAId', 'foldBId', 'interactionType', 'affinityKd', 'notes', 'createdAt'],
		route: 'interactions',
		entityType: 'interaction',
		deletable: true,
		remove: (i) => interactions.remove(i),
	}));
</script>

<EntityDetail {config} />
