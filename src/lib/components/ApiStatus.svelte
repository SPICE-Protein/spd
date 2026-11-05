<script lang="ts">
	import { onMount } from 'svelte';
	import { health } from '$lib/api/client';
	import { BASE_URL } from '$lib/api/base';
	import { tr } from '$lib/i18n';
	import { cn } from '$lib/utils';

	let status = $state<'unknown' | 'up' | 'down'>('unknown');
	let version = $state('');

	onMount(async () => {
		try {
			const env = await health.check();
			status = env.data?.status === 'ok' ? 'up' : 'down';
			version = String(env.data?.apiVersion ?? '');
		} catch {
			status = 'down';
		}
	});

	// `GET /docs` (root, not under /api/v1) serves the backend's Redoc HTML.
	const docsUrl = `${BASE_URL}/docs`;
</script>

<span class="inline-flex items-center gap-1" title={`${tr('api_status')} · ${status}`}>
	<span
		class={cn(
			'size-2 rounded-none',
			status === 'up' && 'bg-emerald-500',
			status === 'down' && 'bg-red-500',
			status === 'unknown' && 'bg-muted-foreground'
		)}
	></span>
	<a href={docsUrl} target="_blank" rel="noopener" class="hover:underline">{tr('api_docs')}</a>
	{#if version}<span class="font-mono">{version}</span>{/if}
</span>
