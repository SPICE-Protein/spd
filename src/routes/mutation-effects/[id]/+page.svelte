<script lang="ts">
	import { page } from '$app/state';
	import { mutationEffects } from '$lib/api/client';
	import EntityDetail from '$lib/components/EntityDetail.svelte';
	import type { EntityDetailConfig } from '$lib/components/EntityDetail.svelte';
	import { tr } from '$lib/i18n';

	const id = $derived(page.params.id ?? '');

	const config = $derived.by((): EntityDetailConfig => ({
		title: tr('browse_mutation_effects'),
		id,
		get: (i) => mutationEffects.get(i),
		scalarKeys: ['id', 'sequenceId', 'effectClass', 'dgValue', 'interactionTerm', 'confidence', 'createdAt'],
		// positions / fromResidues / toResidues are arrays: union tables or
		// chips in the structured section, not "more fields" strings.
		route: 'mutation-effects',
		entityType: 'mutation_effect'
	}));
</script>

<EntityDetail {config} />
