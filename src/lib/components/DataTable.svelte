<script lang="ts" generics="T extends Record<string, any>">
	// shadcn Table wrapper — same Column API, now with the library's dense
	// preset typography inside a scroll container.
	import { cn } from '$lib/utils';
	import { fieldLabel, tr } from '$lib/i18n';
	import { jsonPreview } from '$lib/format';
	import type { Snippet } from 'svelte';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { Checkbox as ShadcnCheckbox } from '$lib/components/ui/checkbox';
	import Checkbox from './Checkbox.svelte';
	import type { Column } from './table';

	let {
		rows,
		columns,
		hrefFor = undefined,
		empty = undefined,
		class: klass = '',
		selectable = false,
		selected = undefined,
		rowKey = undefined,
		onToggle = undefined,
		onToggleAll = undefined
	}: {
		rows: T[];
		columns: Column<T>[];
		/** when set, rows become links */
		hrefFor?: (row: T) => string;
		empty?: Snippet;
		class?: string;
		/** prepend a checkbox column; callers supply the key/selection model */
		selectable?: boolean;
		selected?: Set<string>;
		rowKey?: (row: T) => string;
		onToggle?: (key: string) => void;
		onToggleAll?: (keys: string[]) => void;
	} = $props();

	const keyOf = $derived((row: T) => rowKey?.(row) ?? String(row.id ?? ''));
	const keys = $derived(rows.map((row) => keyOf(row)));
	const allSelected = $derived(keys.length > 0 && keys.every((k) => selected?.has(k) === true));
	const someSelected = $derived(!allSelected && keys.some((k) => selected?.has(k) === true));

	function toggleAll(on: boolean) {
		onToggleAll?.(on ? keys : []);
	}

	function cellText(row: T, key: string): string {
		const v = row[key];
		if (v == null) return '—';
		if (typeof v === 'boolean') return v ? tr('common_yes') : tr('common_no');
		if (typeof v === 'object') return jsonPreview(v, 80);
		return String(v);
	}
</script>

<div class={cn('w-full overflow-x-auto rounded-none ring-1 ring-foreground/10', klass)}>
	<Table>
		<TableHeader class="bg-muted/40">
			<TableRow>
				{#if selectable}
					<TableHead class="w-8">
						<ShadcnCheckbox
							checked={allSelected}
							indeterminate={someSelected}
							aria-label={tr('catalog_select_all')}
							onCheckedChange={(v) => toggleAll(v === true)}
						/>
					</TableHead>
				{/if}
				{#each columns as col (col.key)}
					<TableHead class="whitespace-nowrap">
						{col.label ?? fieldLabel(col.key)}
					</TableHead>
				{/each}
			</TableRow>
		</TableHeader>
		<TableBody>
			{#if rows.length === 0}
				<TableRow>
					<TableCell
						colspan={columns.length + (selectable ? 1 : 0)}
						class="h-16 justify-center text-center text-muted-foreground"
					>
						{#if empty}{@render empty()}{:else}{tr('common_empty')}{/if}
					</TableCell>
				</TableRow>
			{:else}
				{#each rows as row, i (i)}
					<TableRow>
						{#if selectable}
							<TableCell class="w-8">
								<Checkbox
									name={`select-${keyOf(row)}`}
									checked={selected?.has(keyOf(row)) ?? false}
									onchange={() => onToggle?.(keyOf(row))}
								/>
							</TableCell>
						{/if}
						{#each columns as col (col.key)}
							<TableCell class={cn('align-middle', col.class ?? '')}>
								{#if col.cell}
									{@render col.cell({ row })}
								{:else if hrefFor && col.key === columns[0].key}
									<a class="text-primary hover:underline" href={hrefFor(row)}
										>{col.format ? col.format(row) : cellText(row, col.key)}</a
									>
								{:else}
									<span class="whitespace-nowrap"
										>{col.format ? col.format(row) : cellText(row, col.key)}</span
									>
								{/if}
							</TableCell>
						{/each}
					</TableRow>
				{/each}
			{/if}
		</TableBody>
	</Table>
</div>
