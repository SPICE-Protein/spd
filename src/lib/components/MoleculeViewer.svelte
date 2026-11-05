<script lang="ts">
	import { onMount } from 'svelte';
	import { tr } from '$lib/i18n';
	import { loadKekuleViewer } from '$lib/kekule';

	let {
		smiles,
		height = '320px',
		caption = '',
		bare = false
	}: { smiles: string; height?: string; caption?: string; bare?: boolean } = $props();

	let Viewer = $state<any>(null);
	let failed = $state(false);
	let ready = $state(false);

	/**
	 * Kekule's canvas bridge paints at CSS resolution by default, which is
	 * half-resolution on a Retina display (canvas backing 582px wide while
	 * the element is 582 CSS px at devicePixelRatio 2). Ask the displayer
	 * for an oversampled context and resize it once the first paint is done;
	 * Kekule then scales the canvas back down with a CSS transform, giving
	 * crisp bonds and atom labels instead of a fuzzy raster.
	 */
	function sharpen(viewer: any) {
		const configs = viewer?.getDisplayerEnvironmentConfigs?.();
		if (!configs) return;
		const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
		configs.setAntialias?.(true);
		configs.setOverSamplingRatio?.(ratio);
		const dimension = viewer.getContextDimension?.();
		if (dimension) viewer.changeContextDimension?.(dimension);
		viewer.repaint?.();
	}

	onMount(async () => {
		try {
			Viewer = await loadKekuleViewer();
		} catch {
			failed = true;
		}
	});
</script>

<div
	class={bare ? 'w-full' : 'w-full border bg-background'}
	data-molecule-ready={ready}
	data-molecule-failed={failed}
>
	{#if Viewer}
		<Viewer
			{smiles}
			{height}
			showToolbar={false}
			interactive={false}
			background="transparent"
			onReady={(viewer: unknown) => {
				sharpen(viewer);
				ready = true;
			}}
			onError={() => (failed = true)}
		>
			{#snippet loading()}
				<div class="px-3 text-xs text-muted-foreground">{tr('common_loading')}</div>
			{/snippet}
			{#snippet error()}
				<div class="px-3 text-xs text-muted-foreground">{tr('molecule_viewer_failed')}</div>
			{/snippet}
		</Viewer>
	{:else if failed}
		<div class="flex h-32 items-center justify-center px-3 text-xs text-muted-foreground">
			{tr('molecule_viewer_failed')}
		</div>
	{:else}
		<div class="flex h-32 items-center justify-center px-3 text-xs text-muted-foreground">
			{tr('common_loading')}
		</div>
	{/if}
	{#if caption}
		<p class="border-t px-3 py-1.5 font-mono text-[11px] break-all text-muted-foreground">
			{caption}
		</p>
	{/if}
</div>
