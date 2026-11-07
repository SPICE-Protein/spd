<script lang="ts">
	// One-line affordance for copy that used to sit in the page as a
	// paragraph. The visible UI stays scannable; the explanation is one
	// hover, focus or tap away.
	import InfoIcon from '@lucide/svelte/icons/info';
	import {
		Content as TooltipContent,
		Root as Tooltip,
		Trigger as TooltipTrigger
	} from '$lib/components/ui/tooltip';

	let {
		text = '',
		label = 'More information',
		side = 'top',
		class: klass = ''
	}: {
		text?: string;
		label?: string;
		side?: 'top' | 'right' | 'bottom' | 'left';
		class?: string;
	} = $props();
</script>

{#if text}
	<Tooltip>
		<TooltipTrigger
			class="inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-none text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground {klass}"
			aria-label={label}
		>
			<InfoIcon class="size-3.5" />
		</TooltipTrigger>
		<TooltipContent {side} class="max-w-72 leading-relaxed">{text}</TooltipContent>
	</Tooltip>
{/if}
