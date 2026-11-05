<script lang="ts">
	import { page } from '$app/state';
	import EntityDetail from '$lib/components/EntityDetail.svelte';
	import type { EntityDetailConfig } from '$lib/components/EntityDetail.svelte';
	import { mediaRecipes } from '$lib/api/client';
	import { tr } from '$lib/i18n';

	const id = $derived(page.params.id ?? '');

	const config = $derived.by((): EntityDetailConfig => ({
		title: tr('browse_media_recipes'),
		id,
		get: (i) => mediaRecipes.get(i),
		scalarKeys: ['id', 'name', 'category', 'ph', 'notes', 'createdAt'],
		route: 'media-recipes',
		entityType: 'media_recipe',
	}));
</script>

<EntityDetail {config} />
