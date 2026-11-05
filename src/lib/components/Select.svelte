<script lang="ts">
	// shadcn/bits Select wrapper — same options/value API as the old native
	// <select>. Forms here are JS-driven, so losing native form participation
	// costs nothing; keyboard combobox semantics come from bits for free.
	// The Root is taken straight from bits (not the generated re-export)
	// because destructuring bits' single/multi discriminated union into
	// $props pins TS to the wrong branch.
	import { Select as SelectPrimitive, type SelectSingleRootProps } from 'bits-ui';
	import {
		SelectContent,
		SelectItem,
		SelectTrigger,
		SelectValue
	} from '$lib/components/ui/select';
	import { cn } from '$lib/utils';

	let {
		name,
		value = $bindable(''),
		options,
		placeholder = undefined,
		required = false,
		disabled = false,
		class: klass = '',
		onchange = undefined
	}: {
		name: string;
		value?: string;
		/** value → label pairs (already localized) */
		options: Array<{ value: string; label: string }>;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		class?: string;
		/** fired after the bound value updates — filter selects reload on change */
		onchange?: (value: string) => void;
	} = $props();

	// bits-ui 2.x reads `items` as an array (`.find`/`.filter` in
	// select.svelte.js) — the 1.x Map form crashes SelectValue the moment a
	// value is preselected, which is every wizard with a default license.
	const items = $derived(options.map((o) => ({ value: o.value, label: o.label })));
	// Spread as one blob: bits' single/multi discriminated union can't be
	// narrowed through Svelte's per-prop checks, but this wrapper is
	// single-select by construction (array items + scalar value).
	const rootProps = $derived({
		// explicit discriminator for bits' single/multi union
		type: 'single',
		value: value === '' ? null : value,
		items,
		name,
		disabled,
		required,
		onValueChange: (nv: string | string[] | null) => {
			const next = typeof nv === 'string' ? nv : '';
			value = next;
			onchange?.(next);
		}
	});
</script>

<!-- '' means "nothing picked" to the old API; bits uses null so the
     placeholder renders -->
<SelectPrimitive.Root {...(rootProps as unknown as SelectSingleRootProps)}>
	<SelectTrigger id={`f-${name}`} class={cn('w-full', klass)}>
		<SelectValue placeholder={placeholder ?? ''} />
	</SelectTrigger>
	<SelectContent>
		{#each options as opt (opt.value)}
			<SelectItem value={opt.value}>{opt.label}</SelectItem>
		{/each}
	</SelectContent>
</SelectPrimitive.Root>
