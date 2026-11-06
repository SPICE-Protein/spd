<script lang="ts">
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SnowflakeIcon from '@lucide/svelte/icons/snowflake';
	import dnaArt from '$lib/assets/seasonal/dna-nih-bioart.svg';
	import lanternArt from '$lib/assets/seasonal/lantern.svg';
	import santaHat from '$lib/assets/seasonal/santa-hat.svg';
	import { seasonal } from '$lib/state/seasonal.svelte';

	const letters = ['S', 'P', 'D'];
</script>

<span class="seasonal-wordmark" data-season={seasonal.season ?? ''}>
	<span class="sr-only">SPD</span>
	<span class="seasonal-letters" aria-hidden="true">
		{#each letters as letter, index (index)}
			<span class="seasonal-letter">
				{letter}
				{#if seasonal.season === 'christmas' && index === letters.length - 1}
					<img class="seasonal-hat" src={santaHat} alt="" />
				{/if}
			</span>
		{/each}
	</span>

	{#if seasonal.season && seasonal.season !== 'christmas'}
		<span class="seasonal-ornament" aria-hidden="true">
			{#if seasonal.season === 'dna-day'}
				<img class="seasonal-dna" src={dnaArt} alt="" />
			{:else if seasonal.season === 'lunar-new-year'}
				<img class="seasonal-lantern" src={lanternArt} alt="" />
			{:else if seasonal.season === 'mid-autumn'}
				<span class="seasonal-moon"><MoonIcon class="size-full" /></span>
			{:else if seasonal.season === 'winter-solstice'}
				<span class="seasonal-snowflake"><SnowflakeIcon class="size-full" /></span>
			{:else if seasonal.season === 'pi-day'}
				<span class="seasonal-pi">π</span>
			{/if}
		</span>
	{/if}
</span>

<style>
	.seasonal-wordmark {
		position: relative;
		display: inline-flex;
		align-items: baseline;
	}

	.seasonal-letters {
		display: inline-flex;
	}

	.seasonal-letter {
		position: relative;
		display: inline-block;
	}

	.seasonal-hat {
		position: absolute;
		top: -0.92em;
		left: 50%;
		width: 1.55em;
		height: auto;
		pointer-events: none;
		transform: translateX(-50%) rotate(10deg);
		transform-origin: 20% 100%;
	}

	.seasonal-ornament {
		position: absolute;
		top: -0.62em;
		right: -0.5em;
		display: grid;
		place-items: center;
		width: 1em;
		height: 1em;
		pointer-events: none;
	}

	.seasonal-dna {
		width: 100%;
		height: 100%;
		object-fit: contain;
		transition: transform 300ms ease;
	}

	.seasonal-lantern {
		width: 100%;
		height: 100%;
		object-fit: contain;
		transition: transform 300ms ease;
	}

	:global(.dark) .seasonal-lantern {
		filter: invert(1) brightness(1.4);
	}

	.seasonal-moon,
	.seasonal-snowflake {
		display: block;
		width: 0.82em;
		height: 0.82em;
	}

	.seasonal-moon {
		color: #d97706;
	}

	.seasonal-snowflake {
		color: #0284c7;
	}

	.seasonal-pi {
		color: var(--muted-foreground, #666);
		font-family: var(--font-mono);
		font-size: 0.82em;
		font-weight: 700;
		line-height: 1;
	}

	@media (hover: hover) and (prefers-reduced-motion: no-preference) {
		.seasonal-wordmark:hover .seasonal-dna {
			transform: rotate(10deg) scale(1.08);
		}

		.seasonal-wordmark:hover .seasonal-lantern {
			transform: rotate(-7deg);
		}

		.seasonal-hat {
			animation: hat-drop 420ms ease-out both;
		}
	}

	@keyframes hat-drop {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-0.35em) rotate(-14deg);
		}
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.seasonal-hat {
			animation: none;
		}

		.seasonal-dna,
		.seasonal-lantern {
			transition: none;
		}
	}
</style>
