<script lang="ts">
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from './Section.svelte';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import IdLink from './IdLink.svelte';
	import TargetPicker from './TargetPicker.svelte';

	/**
	 * The §54 enzyme→protein assertion. A signed-in user may bind, rebind or
	 * withdraw it through a search picker; the server proves the protein
	 * exists before accepting the claim. Links are never inferred from names.
	 */
	let {
		current = '',
		bind,
		unbind,
		onchanged
	}: {
		current?: string;
		bind: (proteinId: string) => Promise<unknown>;
		unbind: () => Promise<unknown>;
		onchanged: () => Promise<unknown>;
	} = $props();

	let showProtein = $state(false);
	let proteinPick = $state('');

	function openProteinDialog() {
		proteinPick = current;
		showProtein = true;
	}

	async function confirmProteinBind() {
		if (!proteinPick) return;
		try {
			await bind(proteinPick);
			toastOk(tr('protein_link_bound'));
			showProtein = false;
			await onchanged();
		} catch (e) {
			toastErr(e);
		}
	}

	async function removeProteinLink() {
		if (!current) return;
		if (!confirm(tr('protein_link_unbind_confirm'))) return;
		try {
			await unbind();
			toastOk(tr('protein_link_unbound'));
			await onchanged();
		} catch (e) {
			toastErr(e);
		}
	}
</script>

<Section title={tr('protein_link_title')}>
	<div class="flex flex-wrap items-center gap-2 text-sm">
		{#if current}
			<IdLink id={current} />
		{:else}
			<span class="text-muted-foreground">{tr('protein_link_none')}</span>
		{/if}
		{#if session.signedIn}
			{#if current}
				<Button size="xs" variant="outline" onclick={openProteinDialog}>{tr('protein_link_rebind')}</Button>
				<Button size="xs" variant="ghost" onclick={removeProteinLink}>{tr('protein_link_unbind')}</Button>
			{:else}
				<Button size="xs" onclick={openProteinDialog}>{tr('protein_link_bind')}</Button>
			{/if}
		{/if}
	</div>
	<p class="mt-1 text-xs text-muted-foreground">{tr('protein_link_hint')}</p>
</Section>

<Dialog bind:open={showProtein} title={current ? tr('protein_link_rebind') : tr('protein_link_bind')}>
	<div class="space-y-3">
		<p class="text-xs text-muted-foreground">{tr('protein_link_hint')}</p>
		<TargetPicker
			entityType="protein"
			initial={current ? { id: current } : undefined}
			onpick={(h) => (proteinPick = h?.id ?? '')}
		/>
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showProtein = false)}>{tr('common_cancel')}</Button>
			<Button onclick={confirmProteinBind} disabled={!proteinPick}>{tr('common_save')}</Button>
		</div>
	</div>
</Dialog>
