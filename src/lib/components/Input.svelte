<script lang="ts">
	// shadcn Input wrapper — old id convention (f-<name>) kept so Field labels
	// still point at the right control.
	import { Input as ShadcnInput } from '$lib/components/ui/input';

	let {
		name,
		value = $bindable(''),
		type = 'text',
		placeholder = '',
		required = false,
		disabled = false,
		step = undefined,
		class: klass = '',
		oninput = undefined,
		onchange = undefined,
		onblur = undefined,
		onkeydown = undefined,
		aria_label = undefined,
		maxlength = undefined,
		title = undefined,
		list = undefined,
		min = undefined,
		max = undefined
	}: {
		name: string;
		value?: string;
		type?: string;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		step?: string;
		class?: string;
		oninput?: (e: Event) => void;
		onchange?: (e: Event) => void;
		onblur?: (e: FocusEvent) => void;
		onkeydown?: (e: KeyboardEvent) => void;
		aria_label?: string;
		maxlength?: number;
		title?: string;
		/** datalist id — CorrectionItems offers the target's real field names */
		list?: string;
		min?: number;
		max?: number;
	} = $props();
</script>

<ShadcnInput
	id={`f-${name}`}
	{name}
	type={type as never}
	bind:value
	{placeholder}
	{required}
	{disabled}
	{step}
	{oninput}
	{onchange}
	{onblur}
	{onkeydown}
	aria-label={aria_label}
	{maxlength}
	{min}
	{max}
	{title}
	{list}
	class={klass}
/>
