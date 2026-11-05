<script lang="ts">
	import { page } from '$app/state';
	import FilingDetail from '$lib/components/FilingDetail.svelte';
	import { contributions } from '$lib/api/client';

	const id = $derived(page.params.id ?? '');
</script>

<FilingDetail kind="contribution" {id} get={(i) => contributions.get(i)} />
