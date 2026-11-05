<script lang="ts">
	import { tr, fieldLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { cn } from '$lib/utils';
	import IdLink from './IdLink.svelte';
	import DataView from '$lib/components/DataView.svelte';

	/**
	 * Field-first renderer for arbitrary record content. Every category detail
	 * page shows data through labeled rows, chip lists and tables — never a
	 * raw JSON dump. Recurses for nested shapes; big arrays are windowed with
	 * an honest count so the page stays readable without hiding truth.
	 */
	let {
		value,
		label = '',
		depth = 0,
		class: klass = ''
	}: { value: unknown; label?: string; depth?: number; class?: string } = $props();

	const CAP = 60;
	const isScalar = (v: unknown) =>
		v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

	const obj = $derived(
		value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null
	);
	const arr = $derived(Array.isArray(value) ? (value as unknown[]) : null);
	const scalar = $derived(!obj && !arr);

	const rows = $derived.by(() => {
		if (!obj) return [] as Array<[string, unknown]>;
		return Object.entries(obj);
	});
	const scalarList = $derived(arr !== null && arr.length > 0 && arr.every(isScalar));
	const objectList = $derived(
		arr !== null &&
			arr.length > 0 &&
			!scalarList &&
			arr.every((x) => x !== null && typeof x === 'object')
	);
	const tableCols = $derived.by(() => {
		if (!objectList || !arr) return [] as string[];
		const seen: string[] = [];
		for (const item of arr) {
			if (Array.isArray(item)) {
				for (let i = 0; i < item.length; i++) if (!seen.includes(String(i))) seen.push(String(i));
			} else {
				for (const k of Object.keys(item as Record<string, unknown>))
					if (!seen.includes(k)) seen.push(k);
			}
		}
		return seen.slice(0, 8);
	});
	function cellOf(item: unknown, col: string): unknown {
		if (Array.isArray(item)) return item[Number(col)];
		return (item as Record<string, unknown>)[col];
	}
	const shownArr = $derived(arr ? arr.slice(0, CAP) : []);
	const colHeader = (c: string) =>
		isFinite(Number(c)) && String(Number(c)) === c ? `#${c}` : fieldLabel(c);
	const longText = $derived(typeof value === 'string' && value.length > 120);
</script>

{#if scalar}
	<span class={cn('break-words', klass)}>
		{#if value === null || value === undefined || value === ''}—
		{:else if typeof value === 'boolean'}{value ? tr('common_yes') : tr('common_no')}
		{:else if String(value).startsWith('spd:')}<IdLink id={String(value)} />
		{:else if typeof value === 'number'}<span class="tabular-nums">{value}</span>
		{:else}{String(value)}{/if}
	</span>
{:else if longText}
	<details class={cn(klass)}>
		<summary class="cursor-pointer text-xs text-muted-foreground"
			>{label || tr('dv_long_text', { n: (value as string).length })}</summary
		>
		<pre
			class="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-none bg-muted/40 p-2 font-mono text-xs">{String(
				value
			)}</pre>
	</details>
{:else if obj}
	<div class={cn('space-y-1.5', klass)}>
		{#if label}<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{label}
			</p>{/if}
		{#if rows.length === 0}
			<p class="text-xs text-muted-foreground">{tr('dv_empty_object')}</p>
		{:else}
			<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				{#each rows as [k, v] (k)}
					<dt class="text-muted-foreground">{fieldLabel(k)}</dt>
					<dd class="min-w-0">
						{#if k.endsWith('At') && typeof v !== 'object'}
							{fmtTime(Number(v))}
						{:else if isScalar(v)}
							<DataView value={v} />
						{:else}
							<div class="ml-0 border-l-2 border-muted pl-2 md:pl-3">
								<DataView value={v} depth={depth + 1} />
							</div>
						{/if}
					</dd>
				{/each}
			</dl>
		{/if}
	</div>
{:else if arr}
	<div class={cn('space-y-1.5', klass)}>
		{#if label}<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{label}
			</p>{/if}
		{#if arr.length === 0}
			<p class="text-xs text-muted-foreground">{tr('dv_empty_object')}</p>
		{:else if scalarList}
			<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				{#each shownArr as v, i (i)}
					{#if i === CAP}<span class="text-xs text-muted-foreground"
							>{tr('dv_more', { n: arr.length - CAP })}</span
						>{:else}
						<span
							class="min-w-0 break-words after:ml-2 after:text-muted-foreground after:content-['·'] last:after:content-none"
							><DataView value={v} /></span
						>
					{/if}
				{/each}
			</div>
		{:else if objectList}
			<div class="overflow-x-auto rounded-none border">
				<table class="w-full text-sm">
					<thead>
						<tr class="bg-muted/40 text-left text-xs text-muted-foreground">
							{#each tableCols as c (c)}<th class="px-2 py-1 font-medium">{colHeader(c)}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each shownArr as item, i (i)}
							{#if i === CAP}
								<tr class="border-t"
									><td colspan={tableCols.length} class="px-2 py-1 text-xs text-muted-foreground"
										>{tr('dv_more', { n: arr.length - CAP })}</td
									></tr
								>
							{:else}
								<tr class="border-t">
									{#each tableCols as c (c)}
										<td class="px-2 py-1 align-top">
											{#if isScalar(cellOf(item, c))}
												<DataView value={cellOf(item, c)} />
											{:else}
												<div class="text-xs">
													<DataView value={cellOf(item, c)} depth={depth + 1} />
												</div>
											{/if}
										</td>
									{/each}
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<ol class="list-decimal space-y-2 pl-5 text-sm">
				{#each shownArr as v, i (i)}
					<li>
						{#if i === CAP}{tr('dv_more', { n: arr.length - CAP })}{:else}<DataView
								value={v}
								depth={depth + 1}
							/>{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</div>
{/if}
