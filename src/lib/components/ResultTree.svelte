<script lang="ts">
	import { tr } from '$lib/i18n';
	import { shortPublicId } from '$lib/format';
	// recursive result renderer — self-import (svelte:self is deprecated)
	import ResultTree from './ResultTree.svelte';

	// expand-edge names that come back as object keys in results — these get
	// localized; plain payload fields keep their wire names.
	const KNOWN_EDGES = new Set([
		'sequences',
		'protein',
		'parent',
		'folds',
		'sequence',
		'environment',
		'model',
		'artifacts',
		'validations',
		'assessment',
		'reviews',
		'screeningEvents'
	]);

	let {
		value,
		label = '',
		depth = 0
	}: { value: unknown; label?: string; depth?: number } = $props();

	const NAME_KEYS = [
		'preferredName',
		'name',
		'title',
		'symbol',
		'geneName',
		'pdbId',
		'modelIdentity',
		'hash'
	];

	function pickTitle(o: Record<string, unknown>): string {
		for (const k of NAME_KEYS) {
			const v = o[k];
			if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 60);
		}
		const id = o.publicId ?? o.id;
		if (typeof id === 'string') return shortPublicId(id);
		return '';
	}

	function isPlainObject(v: unknown): v is Record<string, unknown> {
		return !!v && typeof v === 'object' && !Array.isArray(v);
	}

	function scalarText(v: unknown): string {
		if (v === null || v === undefined) return '—';
		if (typeof v === 'boolean') return v ? tr('common_yes') : tr('common_no');
		return String(v);
	}

	const entries = $derived(isPlainObject(value) ? Object.entries(value) : []);
	const title = $derived(isPlainObject(value) ? pickTitle(value) : '');
	const scalars = $derived(entries.filter(([, v]) => v === null || typeof v !== 'object'));
	const branches = $derived(entries.filter(([, v]) => v !== null && typeof v === 'object'));
</script>

{#if Array.isArray(value)}
	<div class="space-y-2">
		{#if label}<p class="text-xs font-medium text-muted-foreground">{label}</p>{/if}
		{#each value as item, i (i)}
			{#if isPlainObject(item)}
				<ResultTree value={item} depth={depth + 1} />
			{:else}
				<p class="font-mono text-xs break-words">{scalarText(item)}</p>
			{/if}
		{/each}
	</div>
{:else if isPlainObject(value)}
	<details class="rounded-none border bg-background p-2" open={depth < 2}>
		<summary class="cursor-pointer text-sm">
			{#if title}<span class="font-medium">{title}</span>{/if}
			{#if label}<span class="ml-1 text-xs text-muted-foreground">{label}</span>{/if}
		</summary>
		{#if scalars.length}
			<dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
				{#each scalars as [k, v] (k)}
					<dt class="text-muted-foreground">{k}</dt>
					<dd class="font-mono break-all">{scalarText(v)}</dd>
				{/each}
			</dl>
		{/if}
		{#if branches.length}
			<div class="mt-2 space-y-2 border-l-2 border-primary/20 pl-3">
				{#each branches as [k, v] (k)}
					<ResultTree value={v} label={KNOWN_EDGES.has(k) ? tr(`ge_${k}`) : k} depth={depth + 1} />
				{/each}
			</div>
		{/if}
	</details>
{:else}
	<p class="text-xs text-muted-foreground break-words">
		{label ? `${label}: ` : ''}{scalarText(value)}
	</p>
{/if}
