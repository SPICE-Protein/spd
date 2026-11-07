<script lang="ts">
	// shadcn Card/Collapsible wrapper, same API as the hand-rolled Section:
	// title + actions snippet header, and a collapsible variant for
	// progressive disclosure (non-essential content behind a click).
	import { Card, CardAction, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '$lib/components/ui/collapsible';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import { cn } from '$lib/utils';
	import { tr } from '$lib/i18n';

	let { title = undefined, hint = undefined, class: klass = '', actions = undefined, collapsible = false, open = $bindable(false), children }: {
		title?: string;
		/** supporting copy for the title; rendered behind an info affordance */
		hint?: string;
		class?: string;
		actions?: import('svelte').Snippet;
		/** non-essential content hides behind a click — pages lead with the point */
		collapsible?: boolean;
		open?: boolean;
		children: import('svelte').Snippet;
	} = $props();
</script>

{#if collapsible && title}
	<Collapsible bind:open class={cn('rounded-none ring-1 ring-foreground/10 bg-card', klass)}>
		<div class="flex items-center justify-between gap-2 px-4 py-1.5">
			<div class="flex min-w-0 flex-1 items-center gap-1.5">
				<CollapsibleTrigger class="group flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 py-1.5 text-left">
					<span class="font-heading text-sm font-medium truncate">{title}</span>
					<ChevronDownIcon class="size-4 shrink-0 text-muted-foreground transition-transform group-data-open:rotate-180" />
				</CollapsibleTrigger>
				{#if hint}<InfoTip text={hint} label={`${title} — ${tr('common_more_info')}`} />{/if}
			</div>
			{#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
		</div>
		<CollapsibleContent class="border-t px-4 pt-3 pb-4">
			{@render children()}
		</CollapsibleContent>
	</Collapsible>
{:else}
	<Card class={cn(klass)}>
		{#if title || actions}
			<CardHeader>
				{#if title}
					<CardTitle class="flex min-w-0 items-center gap-1.5">
						<span class="truncate">{title}</span>
						{#if hint}<InfoTip text={hint} label={`${title} — ${tr('common_more_info')}`} />{/if}
					</CardTitle>
				{/if}
				{#if actions}
					<CardAction><div class="flex items-center gap-2">{@render actions()}</div></CardAction>
				{/if}
			</CardHeader>
		{/if}
		<CardContent><div class="min-w-0">{@render children()}</div></CardContent>
	</Card>
{/if}
