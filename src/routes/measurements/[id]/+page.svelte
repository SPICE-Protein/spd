<script lang="ts">
	import { page } from '$app/state';
	import EntityDetail from '$lib/components/EntityDetail.svelte';
	import type { EntityDetailConfig } from '$lib/components/EntityDetail.svelte';
	import { measurements } from '$lib/api/client';
	import { tr } from '$lib/i18n';

	const id = $derived(page.params.id ?? '');

	const config = $derived.by((): EntityDetailConfig => ({
		title: tr('browse_measurements'),
		id,
		get: (i) => measurements.get(i),
		scalarKeys: ['id', 'measurementType', 'sequenceId', 'validationId', 'constructId', 'notes', 'createdBy', 'createdAt'],
		route: 'measurements',
		entityType: 'measurement',
	}));
</script>

<EntityDetail {config} />
