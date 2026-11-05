<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		value,
		label = 'JSON',
		open = false,
		class: klass = ''
	}: {
		value: unknown;
		label?: string;
		open?: boolean;
		class?: string;
	} = $props();

	const text = $derived(value == null ? '—' : JSON.stringify(value, null, 2));
</script>

<details {open} class={cn('rounded-none border bg-muted/30', klass)}>
	<summary class="cursor-pointer select-none px-3 py-1.5 text-xs font-medium text-muted-foreground">{label}</summary>
	<pre class="max-h-96 overflow-auto px-3 pb-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">{text}</pre>
</details>
