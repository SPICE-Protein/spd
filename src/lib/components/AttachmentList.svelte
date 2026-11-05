<script lang="ts">
	import { artifacts } from '$lib/api/client';
	import type { ArtifactRecord } from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import IdLink from './IdLink.svelte';

	let {
		ids = [],
		canDownload = true,
		hint = ''
	}: {
		ids: string[];
		canDownload?: boolean;
		hint?: string;
	} = $props();

	let rows = $state<ArtifactRecord[]>([]);
	let missing = $state<string[]>([]);
	let loading = $state(false);

	$effect(() => {
		const current = [...ids];
		if (!current.length) {
			rows = [];
			missing = [];
			return;
		}
		let cancelled = false;
		loading = true;
		void Promise.allSettled(current.map((id) => artifacts.get(id))).then((results) => {
			if (cancelled) return;
			const nextRows: ArtifactRecord[] = [];
			const nextMissing: string[] = [];
			results.forEach((result, i) => {
				if (result.status === 'fulfilled') nextRows.push(result.value);
				else nextMissing.push(current[i]);
			});
			rows = nextRows;
			missing = nextMissing;
			loading = false;
		});
		return () => {
			cancelled = true;
		};
	});

	function fileName(objectKey: string | undefined): string {
		const base =
			String(objectKey ?? '')
				.split('/')
				.pop() ?? '';
		return base.replace(/^\d+-/, '') || base;
	}

	function fmtBytes(n: number | null | undefined): string {
		const v = Number(n ?? 0);
		if (v < 1024) return `${v} B`;
		if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
		return `${(v / 1024 / 1024).toFixed(2)} MB`;
	}
</script>

{#if ids.length}
	<div class="space-y-1.5">
		{#if loading}
			<p class="text-xs text-muted-foreground">{tr('common_loading')}</p>
		{:else}
			{#each rows as row (row.id)}
				<div class="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-b-0">
					<span class="min-w-0 flex-1 truncate font-mono text-xs" title={fileName(row.objectKey)}>
						{fileName(row.objectKey)}
					</span>
					<span class="shrink-0 text-xs tabular-nums text-muted-foreground"
						>{fmtBytes(row.byteLength)}</span
					>
					{#if canDownload}
						<a
							class="shrink-0 text-xs font-medium underline underline-offset-2"
							href={artifacts.downloadUrl(row.id)}
						>
							{tr('artifact_download')}
						</a>
					{/if}
				</div>
			{/each}
			{#each missing as id (id)}
				<div class="flex items-center gap-2 text-xs">
					<IdLink {id} />
				</div>
			{/each}
			{#if !canDownload}
				<p class="text-xs text-muted-foreground">{tr('supplementary_public_note')}</p>
			{/if}
			{#if hint}
				<p class="text-xs text-muted-foreground">{hint}</p>
			{/if}
		{/if}
	</div>
{/if}
