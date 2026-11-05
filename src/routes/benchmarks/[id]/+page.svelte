<script lang="ts">
	import { page } from '$app/state';
	import EntityDetail from '$lib/components/EntityDetail.svelte';
	import type { EntityDetailConfig } from '$lib/components/EntityDetail.svelte';
	import { benchmarks } from '$lib/api/client';
	import { tr } from '$lib/i18n';

	const id = $derived(page.params.id ?? '');

	// A benchmark's name, models and dataset live in the api_record payload;
	// lifting them here keeps the Overview readable instead of burying the
	// whole record behind "Structured data".
	async function getBenchmark(i: string) {
		const row = (await benchmarks.get(i)) as Record<string, unknown>;
		const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>;
		return { ...row, ...payload };
	}

	const config = $derived.by((): EntityDetailConfig => ({
		title: tr('browse_benchmarks'),
		id,
		get: getBenchmark,
		scalarKeys: ['id', 'name', 'dataset', 'notes', 'status', 'createdAt', 'updatedAt'],
		route: 'benchmarks',
		entityType: 'benchmark',
	}));
</script>

<EntityDetail {config} />
