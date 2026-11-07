<script lang="ts">
	// shadcn Field wrapper: same label/hint/error API, now with the library's
	// field typography and destructive-token error color.
	import { Field as FieldRoot, FieldError, FieldLabel } from '$lib/components/ui/field';
	import InfoTip from '$lib/components/InfoTip.svelte';
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
	<div class="flex min-w-0 items-center gap-1">
		<FieldLabel for={`f-${name}`} class="text-xs font-medium text-muted-foreground">
			{label ?? tr(`f_${name}`)}{#if required}<span class="text-destructive"> *</span>{/if}
		</FieldLabel>
		{#if hint && !error}
			<InfoTip text={hint} label={`${label ?? tr(`f_${name}`)} — ${tr('common_more_info')}`} />
		{/if}
	</div>
	{@render children()}
	{#if error}
		<FieldError>{error}</FieldError>
	{/if}
</FieldRoot>
