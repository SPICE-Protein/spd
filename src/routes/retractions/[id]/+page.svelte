<script lang="ts">
	import { page } from '$app/state';
	import FilingDetail from '$lib/components/FilingDetail.svelte';
	import { retractions } from '$lib/api/client';

	const id = $derived(page.params.id ?? '');
</script>

<FilingDetail kind="retraction" {id} get={(i) => retractions.get(i)} />
