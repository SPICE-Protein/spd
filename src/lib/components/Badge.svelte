<script lang="ts">
	// shadcn Badge wrapper. The app's tone vocabulary maps onto the library
	// badge variants plus token-based color overrides, so every chip now
	// derives from the preset palette instead of raw red/sky hues.
	//
	// Badge is for status, role, type and enum values only. Measured or
	// descriptive data (lengths, EC numbers, organism names, synonyms, tags)
	// is prose or <code> — a chip clips long values and implies a state that
	// the value does not have.
	import { Badge as ShadcnBadge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';

	let {
		tone = 'neutral',
		class: klass = '',
		title,
		children
	}: {
		/** neutral | ok | warn | bad | info | muted */
		tone?: string;
		class?: string;
		/** native tooltip for status/type chips */
		title?: string;
		children: import('svelte').Snippet;
	} = $props();

	const tones: Record<string, string> = {
		neutral: 'bg-muted/60 text-muted-foreground',
		ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 dark:text-emerald-300',
		warn: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 dark:text-amber-300',
		bad: 'border-destructive/30 bg-destructive/10 text-destructive',
		info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 dark:text-sky-300',
		muted: 'border-transparent bg-muted/60 text-muted-foreground'
	};
</script>

<ShadcnBadge variant={tone === 'bad' ? 'destructive' : tone === 'muted' ? 'secondary' : 'outline'} {title} class={cn(tones[tone] ?? tones.neutral, klass)}>
	{@render children()}
</ShadcnBadge>
