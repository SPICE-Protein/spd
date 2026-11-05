<script lang="ts">
	// shadcn Field wrapper: same label/hint/error API, now with the library's
	// field typography and destructive-token error color.
	import { Field as FieldRoot, FieldDescription, FieldError, FieldLabel } from '$lib/components/ui/field';
	import { cn } from '$lib/utils';
	import { tr } from '$lib/i18n';

	let {
		name,
		label = undefined,
		hint = undefined,
		error = undefined,
		required = false,
		class: klass = '',
		children
	}: {
		name: string;
		label?: string;
		hint?: string;
		error?: string;
		required?: boolean;
		class?: string;
		children: import('svelte').Snippet;
	} = $props();
</script>

<FieldRoot class={cn('gap-1', klass)}>
	<FieldLabel for={`f-${name}`} class="text-xs font-medium text-muted-foreground">
		{label ?? tr(`f_${name}`)}{#if required}<span class="text-destructive"> *</span>{/if}
	</FieldLabel>
	{@render children()}
	{#if hint && !error}
		<FieldDescription>{hint}</FieldDescription>
	{/if}
	{#if error}
		<FieldError>{error}</FieldError>
	{/if}
</FieldRoot>
