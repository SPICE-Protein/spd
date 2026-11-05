<script lang="ts">
	// shadcn Textarea wrapper (auto-grow field-sizing comes from the library).
	import { Textarea as ShadcnTextarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';

	let {
		name,
		value = $bindable(''),
		placeholder = '',
		rows = 5,
		required = false,
		monospace = false,
		disabled = false,
		spellcheck = undefined,
		oninput = undefined,
		class: klass = ''
	}: {
		name: string;
		value?: string;
		placeholder?: string;
		rows?: number;
		required?: boolean;
		monospace?: boolean;
		disabled?: boolean;
		spellcheck?: boolean;
		oninput?: (e: Event) => void;
		class?: string;
	} = $props();
</script>

<ShadcnTextarea
	id={`f-${name}`}
	{name}
	bind:value
	{placeholder}
	rows={rows}
	{required}
	{disabled}
	{spellcheck}
	{oninput}
	class={cn(monospace && 'font-mono', klass)}
/>
