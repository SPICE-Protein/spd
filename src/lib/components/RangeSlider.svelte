<script lang="ts">
	/**
	 * Dual-thumb range over one numeric axis, now on the shadcn (bits) Slider:
	 * proper slider ARIA, keyboard steps and thumb clamping come from the
	 * library instead of the stacked-input trick this file used to hand-roll.
	 */
	import { Slider } from '$lib/components/ui/slider';

	let {
		label,
		min,
		max,
		step = 1,
		value = $bindable([min, max] as [number, number]),
		format = undefined
	}: {
		label: string;
		min: number;
		max: number;
		step?: number;
		value?: [number, number];
		format?: (n: number) => string;
	} = $props();

	const show = (n: number) => (format ? format(n) : String(n));

	function changed(v: number | (number | null)[] | null) {
		if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number') {
			value = [v[0], v[1]];
		}
	}
</script>

<div class="space-y-1.5">
	<div class="flex items-baseline justify-between text-xs">
		<span class="text-muted-foreground">{label}</span>
		<span class="font-mono">{show(value[0])} – {show(value[1])}</span>
	</div>
	<Slider type="multiple" {min} {max} {step} value={[value[0], value[1]]} onValueChange={changed} />
</div>
