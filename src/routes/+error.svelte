<script lang="ts">
	import { page } from '$app/state';
	import DnaOffIcon from '@lucide/svelte/icons/dna-off';
	import { tr } from '$lib/i18n';

	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? tr('error_404_title') : tr('error_title'));
	const body = $derived(notFound ? tr('error_404_body') : tr('error_body'));
</script>

<svelte:head>
	<title>{title} · SPD</title>
</svelte:head>

<div class="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
	<p class="font-mono text-xs tracking-[0.2em] text-muted-foreground">
		HTTP {page.status}
	</p>
	<span class="denatured-mark mt-6 block size-16 text-muted-foreground">
		<DnaOffIcon class="size-full" strokeWidth={1.1} />
	</span>
	<h1 class="mt-6 text-2xl font-bold tracking-tight">{title}</h1>
	<p class="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{body}</p>
	<div class="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
		<a class="border bg-primary px-3 py-1.5 text-primary-foreground hover:opacity-90" href="/">
			{tr('error_home')}
		</a>
		<a class="border px-3 py-1.5 hover:bg-accent" href="/search">{tr('error_search')}</a>
	</div>
</div>

<style>
	.denatured-mark {
		animation: denature 3.6s ease-in-out infinite;
	}

	@keyframes denature {
		0%,
		100% {
			opacity: 0.55;
			transform: rotate(0deg);
		}
		45% {
			opacity: 0.9;
			transform: rotate(-5deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.denatured-mark {
			animation: none;
			opacity: 0.7;
		}
	}
</style>
