<script lang="ts">
	import { tr } from '$lib/i18n';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';

	const concepts = [
		{ n: 1, href: '/proteins', icon: '🧬' },
		{ n: 2, href: '/sequences', icon: '🔤' },
		{ n: 3, href: '/folds/query', icon: '🧊' },
		{ n: 4, href: '/validations', icon: '✅' }
	];
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<h1 class="text-2xl font-bold">{tr('help_title')}</h1>
	<p class="text-sm text-muted-foreground">{tr('help_intro')}</p>

	<div class="rounded-none border bg-gradient-to-b from-muted/60 to-transparent p-4">
		<p class="text-center text-sm font-medium">{tr('help_flow_hint')}</p>
		<div class="mt-3 grid gap-2 sm:grid-cols-4">
			{#each concepts as c (c.n)}
				<a href={c.href} class="rounded-none border bg-background p-3 text-center transition-colors hover:border-primary/50">
					<p class="text-sm font-semibold">{c.icon}</p>
					<p class="mt-1 text-sm font-medium">{tr(`help_c${c.n}_title`)}</p>
					<p class="mt-1 text-xs leading-relaxed text-muted-foreground">{tr(`help_c${c.n}_body`)}</p>
				</a>
			{/each}
		</div>
	</div>

	<Section title={tr('help_search_title')}>
		<p class="text-sm leading-relaxed text-muted-foreground">{tr('help_search_body')}</p>
		<div class="mt-2"><Button href="/search" size="sm" variant="outline">{tr('nav_search')}</Button></div>
	</Section>

	<Section title={tr('help_trust_title')}>
		<p class="text-sm leading-relaxed text-muted-foreground">{tr('home_two_tiers_body')}</p>
	</Section>

	<Section title={tr('help_contribute_title')}>
		<p class="text-sm leading-relaxed text-muted-foreground">{tr('help_contribute_body')}</p>
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<Button href="/submit" size="sm">{tr('home_submit_cta')}</Button>
			<a class="text-xs underline text-muted-foreground" href="/">{tr('help_steps_link')}</a>
		</div>
	</Section>

	<Section title={tr('help_fix_title')}>
		<p class="text-sm leading-relaxed text-muted-foreground">{tr('help_fix_body')}</p>
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<Button href="/my" size="sm" variant="outline">{tr('help_fix_cta')}</Button>
			<a class="text-xs underline text-muted-foreground" href="/corrections">{tr('et_correction')}</a>
			<a class="text-xs underline text-muted-foreground" href="/retractions">{tr('et_retraction')}</a>
		</div>
	</Section>

	<Section title={tr('nav_browse')}>
		<p class="text-sm leading-relaxed text-muted-foreground">{tr('browse_intro')}</p>
		<div class="mt-2"><Button href="/browse" size="sm" variant="outline">{tr('nav_browse')}</Button></div>
	</Section>
</div>

<svelte:head><title>{tr('nav_help')} · SPD</title></svelte:head>
