<script lang="ts">
	import { page } from '$app/state';
	import FilingDetail from '$lib/components/FilingDetail.svelte';
	import { corrections } from '$lib/api/client';

	const id = $derived(page.params.id ?? '');
</script>

<FilingDetail kind="correction" {id} get={(i) => corrections.get(i)} />
