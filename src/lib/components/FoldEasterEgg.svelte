<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import SplineIcon from '@lucide/svelte/icons/spline';
	import { tr } from '$lib/i18n';
	import { KONAMI_SEQUENCE, nextKonamiIndex } from '$lib/konami';

	let open = $state(false);
	let closeButton = $state<HTMLButtonElement | null>(null);
	let matched = 0;

	function dismiss() {
		open = false;
	}

	onMount(() => {
		if (page.url.searchParams.get('egg') === 'fold') open = true;

		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && open) {
				dismiss();
				return;
			}
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				target.closest('input, textarea, select, [contenteditable="true"]')
			) {
				return;
			}

			matched = nextKonamiIndex(matched, event.key.toLowerCase());
			if (matched === KONAMI_SEQUENCE.length) {
				matched = 0;
				open = true;
			}
		};

		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	$effect(() => {
		if (!open) return;
		const timer = setTimeout(dismiss, 8000);
		void tick().then(() => closeButton?.focus());
		return () => clearTimeout(timer);
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-background/75 p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="fold-title"
		tabindex="-1"
		onclick={(event) => {
			if (event.target === event.currentTarget) dismiss();
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') dismiss();
		}}
	>
		<div class="w-full max-w-sm border bg-card p-6 text-center shadow-lg" data-print-hide>
			<span class="fold-mark mx-auto block size-20 text-primary">
				<SplineIcon class="size-full" strokeWidth={1.25} />
			</span>
			<p id="fold-title" class="mt-4 text-lg font-semibold">{tr('egg_fold_title')}</p>
			<p class="mt-1 text-sm text-muted-foreground">{tr('egg_fold_body')}</p>
			<button
				bind:this={closeButton}
				type="button"
				class="mt-5 border px-3 py-1.5 text-sm hover:bg-accent"
				onclick={dismiss}
			>
				{tr('common_close')}
			</button>
		</div>
	</div>
{/if}

<style>
	.fold-mark {
		animation: fold-in 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}

	@keyframes fold-in {
		from {
			opacity: 0;
			transform: rotate(-140deg) scale(0.45);
		}
		65% {
			transform: rotate(8deg) scale(1.06);
		}
		to {
			opacity: 1;
			transform: rotate(0deg) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fold-mark {
			animation: none;
		}
	}
</style>
