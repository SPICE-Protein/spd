<script lang="ts">
	import { tr } from '$lib/i18n';
	import { seasonNoteKey } from '$lib/seasonal';
	import { seasonal } from '$lib/state/seasonal.svelte';

	const noteKey = $derived(seasonNoteKey(seasonal.season));
</script>

{#if noteKey}
	<p class="seasonal-note" data-season={seasonal.season} role="note">{tr(noteKey)}</p>
{/if}

<style>
	.seasonal-note {
		margin: 0.75rem auto 0;
		max-width: 36rem;
		color: var(--muted-foreground, #666);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.02em;
		text-align: center;
	}
</style>
