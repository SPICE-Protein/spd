<script lang="ts">
	import { page } from '$app/state';
	import EntityDetail from '$lib/components/EntityDetail.svelte';
	import type { EntityDetailConfig } from '$lib/components/EntityDetail.svelte';
	import { mutationSets } from '$lib/api/client';
	import { tr } from '$lib/i18n';

	const id = $derived(page.params.id ?? '');

	const config = $derived.by((): EntityDetailConfig => ({
		title: tr('browse_mutation_sets'),
		id,
		get: (i) => mutationSets.get(i),
		scalarKeys: ['id', 'baseSequenceId', 'resultSequenceId', 'createdAt'],
		route: 'mutation-sets',
		entityType: 'mutation_set',
	}));
</script>

<EntityDetail {config} />
