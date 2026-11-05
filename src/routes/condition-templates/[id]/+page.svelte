<script lang="ts">
	import { page } from '$app/state';
	import EntityDetail from '$lib/components/EntityDetail.svelte';
	import type { EntityDetailConfig } from '$lib/components/EntityDetail.svelte';
	import { conditionTemplates } from '$lib/api/client';
	import { tr } from '$lib/i18n';

	const id = $derived(page.params.id ?? '');

	const config = $derived.by((): EntityDetailConfig => ({
		title: tr('browse_condition_templates'),
		id,
		get: (i) => conditionTemplates.get(i),
		scalarKeys: ['id', 'name', 'kind', 'description', 'createdAt'],
		route: 'condition-templates',
		entityType: 'condition_template',
	}));
</script>

<EntityDetail {config} />
