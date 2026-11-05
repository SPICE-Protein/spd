<script lang="ts">
	import { page } from '$app/state';
	import EntityDetail from '$lib/components/EntityDetail.svelte';
	import type { EntityDetailConfig } from '$lib/components/EntityDetail.svelte';
	import { cassettes } from '$lib/api/client';
	import { tr } from '$lib/i18n';

	const id = $derived(page.params.id ?? '');

	const config = $derived.by((): EntityDetailConfig => ({
		title: tr('browse_cassettes'),
		id,
		get: (i) => cassettes.get(i),
		scalarKeys: ['id'],
		route: 'cassettes',
		entityType: 'cassette',
	}));
</script>

<EntityDetail {config} />
