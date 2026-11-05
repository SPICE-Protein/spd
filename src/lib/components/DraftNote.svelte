<script lang="ts">
	import { draft, draftStamp } from '$lib/state/drafts.svelte';
	import { tr } from '$lib/i18n';

	/**
	 * Keeps an unfinished form in this browser and offers to resume it.
	 *
	 * Mount it next to a `values` record and the typing survives a reload;
	 * the page clears the slot itself once the submission actually lands
	 * (`draft(key).clear()`), so a saved draft can never be mistaken for a
	 * filed record. Nothing is ever sent anywhere — see $lib/state/drafts.
	 */
	let {
		k,
		values,
		blank = undefined,
		disabled = false
	}: {
		k: string;
		values: Record<string, string>;
		/** the form's untouched state (seeded defaults) — never worth a draft */
		blank?: Record<string, string>;
		disabled?: boolean;
	} = $props();

	// `k` is captured on purpose: the page re-keys this component (see the
	// kinded `{#each}` in submit/[kind]) whenever the slot should change.
	// svelte-ignore state_referenced_locally
	const dr = draft(k);
	let restored = $state(false);
	let hint = $state('');
	let last = $state('');

	function filled(v: Record<string, string>): Array<[string, string]> {
		return Object.entries(v).filter(([, x]) => String(x ?? '').trim() !== '');
	}
	function isBlank(v: Record<string, string>): boolean {
		const base = blank ? filled(blank) : [];
		const now = filled(v);
		return now.length === base.length && base.every(([key, val]) => v[key] === val);
	}

	// Restore once, before children mount, so the first paint already shows
	// the resumed values instead of a jump.
	$effect.pre(() => {
		if (disabled || restored) return;
		restored = true;
		if (dr.restore(values)) hint = draftStamp(dr.savedAt());
	});

	$effect(() => {
		if (disabled || !restored) return;
		const snapshot = JSON.stringify(filled(values));
		if (snapshot === last) return;
		last = snapshot;
		if (isBlank(values)) dr.clear();
		else dr.save(values);
	});
</script>

{#if hint}
	<p class="text-xs text-muted-foreground">
		{tr('draft_restored', { when: hint })}
		<button class="underline" type="button" onclick={() => (dr.clear(), (hint = ''))}>{tr('draft_forget')}</button>
	</p>
{/if}
