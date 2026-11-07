<script lang="ts">
	// shadcn/bits Dialog wrapper with the old API: bind:open + title + width.
	// Focus trap, Escape handling and scroll lock now belong to the library
	// instead of our hand-rolled overlay.
	import {
		Dialog as DialogRoot,
		DialogContent,
		DialogDescription,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { cn } from '$lib/utils';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import { tr } from '$lib/i18n';

	let {
		open = $bindable(false),
		onclose,
		title = '',
		hint = '',
		width = 'max-w-lg',
		children
	}: {
		open?: boolean;
		onclose?: () => void;
		title?: string;
		/** supporting copy for the dialog title; rendered behind an info affordance */
		hint?: string;
		width?: string;
		children: import('svelte').Snippet;
	} = $props();

	// Dialogs can close from the X, Escape or the backdrop, which only updates
	// the internal open flag. Callers that derive `open` from a nullable target
	// need this hook to clear it, otherwise the same target cannot reopen.
	let wasOpen = $state(false);
	$effect(() => {
		if (open) {
			wasOpen = true;
		} else if (wasOpen) {
			wasOpen = false;
			onclose?.();
		}
	});
</script>

<DialogRoot bind:open>
	<DialogContent class={cn('max-h-[80vh] overflow-y-auto', width)}>
		{#if title}
			<DialogHeader>
				<DialogTitle class="flex items-center gap-1.5">
					<span>{title}</span>
					{#if hint}<InfoTip text={hint} label={`${title} — ${tr('common_more_info')}`} />{/if}
				</DialogTitle>
			</DialogHeader>
		{/if}
		{@render children()}
	</DialogContent>
</DialogRoot>
