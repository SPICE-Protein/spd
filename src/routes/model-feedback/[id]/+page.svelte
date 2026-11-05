<script lang="ts">
	import { page } from '$app/state';
	import EntityDetail from '$lib/components/EntityDetail.svelte';
	import type { EntityDetailConfig } from '$lib/components/EntityDetail.svelte';
	import { modelFeedback } from '$lib/api/client';
	import { tr } from '$lib/i18n';

	const id = $derived(page.params.id ?? '');

	// Same api_record shape as benchmarks: the model, the failing case and the
	// severity are the whole point of the row, so surface them on Overview.
	async function getFeedback(i: string) {
		const row = (await modelFeedback.get(i)) as Record<string, unknown>;
		const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>;
		return { ...row, ...payload };
	}

	const config = $derived.by((): EntityDetailConfig => ({
		title: tr('browse_model_feedback'),
		id,
		get: getFeedback,
		scalarKeys: ['id', 'model', 'case', 'severity', 'notes', 'status', 'createdAt', 'updatedAt'],
		route: 'model-feedback',
		entityType: 'model-feedback',
	}));
</script>

<EntityDetail {config} />
