<script lang="ts">
	import { page } from '$app/state';
	import EntityDetail from '$lib/components/EntityDetail.svelte';
	import type { EntityDetailConfig } from '$lib/components/EntityDetail.svelte';
	import { comparisons } from '$lib/api/client';
	import { tr } from '$lib/i18n';

	const id = $derived(page.params.id ?? '');

	const config = $derived.by((): EntityDetailConfig => ({
		title: tr('browse_comparisons'),
		id,
		get: (i) => comparisons.get(i),
		scalarKeys: ['id', 'foldId', 'referenceKind', 'referenceId', 'method', 'methodVersion', 'notes', 'createdAt'],
		route: 'comparisons',
		entityType: 'comparison',
	}));
</script>

<EntityDetail {config} />
