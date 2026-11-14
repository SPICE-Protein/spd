<script lang="ts">
	import { tr } from '$lib/i18n';
	import { entityHref, shortPublicId } from '$lib/format';
	import { NODE_TYPES } from '$lib/graph/registry';
	// recursive result renderer — self-import (svelte:self is deprecated)
	import ResultTree from './ResultTree.svelte';

	// Kinds with a detail route. A graph node can also be an environment or a
	// model, and those have no page — linking them would land on /records.
	const ROUTED = new Set([
		'protein',
		'gene',
		'sequence',
		'fold',
		'validation',
		'artifact',
		'pathway',
		'reaction',
		'enzyme',
		'restriction-enzyme',
		'biobrick',
		'vector',
		'reagent',
		'cell-line',
		'strain'
	]);

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
		'screeningEvents',
		'reactions',
		'pathways',
		'relations'
	]);

	let {
		value,
		label = '',
		depth = 0,
		onroot
	}: {
		value: unknown;
		label?: string;
		depth?: number;
		/** Take this node as a new query root. Absent on read-only surfaces. */
		onroot?: (kind: string, id: string) => void;
	} = $props();

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

	/** A graph node's SPD address, `spd:<kind>:<rest>`. */
	function addressOf(o: Record<string, unknown>): { kind: string; id: string } | null {
		const raw = o.publicId ?? o.id;
		if (typeof raw !== 'string') return null;
		const parts = raw.split(':');
		if (parts.length < 3 || parts[0] !== 'spd' || !parts[1]) return null;
		return { kind: parts[1], id: raw };
	}

	/** Only graph node types can be a root; a plain record is not addressable. */
	function canRoot(kind: string): boolean {
		return !!onroot && (NODE_TYPES as readonly string[]).includes(kind);
	}

	function scalarText(v: unknown): string {
		if (v === null || v === undefined) return '—';
		if (typeof v === 'boolean') return v ? tr('common_yes') : tr('common_no');
		return String(v);
	}

	const entries = $derived(isPlainObject(value) ? Object.entries(value) : []);
	const title = $derived(isPlainObject(value) ? pickTitle(value) : '');
	const address = $derived(isPlainObject(value) ? addressOf(value) : null);
	const scalars = $derived(entries.filter(([, v]) => v === null || typeof v !== 'object'));
	const branches = $derived(entries.filter(([, v]) => v !== null && typeof v === 'object'));
</script>

{#if Array.isArray(value)}
	<div class="space-y-2">
		{#if label}<p class="text-xs font-medium text-muted-foreground">{label}</p>{/if}
		{#each value as item, i (i)}
			{#if isPlainObject(item)}
				<ResultTree value={item} depth={depth + 1} {onroot} />
			{:else}
				<p class="font-mono text-xs break-words">{scalarText(item)}</p>
			{/if}
		{/each}
	</div>
{:else if isPlainObject(value)}
	<details class="rounded-none border bg-background p-2" open={depth < 2}>
		<summary class="cursor-pointer text-sm">
			{#if title}
				{#if address && ROUTED.has(address.kind)}
					<a
						class="font-medium underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
						href={entityHref(address.kind, address.id)}
						title={address.id}
						onclick={(e) => e.stopPropagation()}>{title}</a
					>
				{:else}
					<span class="font-medium">{title}</span>
				{/if}
			{/if}
			{#if label}<span class="ml-1 text-xs text-muted-foreground">{label}</span>{/if}
			{#if address && canRoot(address.kind)}
				<button
					type="button"
					class="ml-2 text-xs text-muted-foreground underline decoration-primary/30 underline-offset-2 hover:text-foreground"
					onclick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onroot?.(address.kind, address.id);
					}}>{tr('query_reroot')}</button
				>
			{/if}
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
					<ResultTree value={v} label={KNOWN_EDGES.has(k) ? tr(`ge_${k}`) : k} depth={depth + 1} {onroot} />
				{/each}
			</div>
		{/if}
	</details>
{:else}
	<p class="text-xs text-muted-foreground break-words">
		{label ? `${label}: ` : ''}{scalarText(value)}
	</p>
{/if}
