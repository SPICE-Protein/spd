<script lang="ts">
	import { taxonomy } from '$lib/api/client';
	import type { TaxonomyLookupData } from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';
	import Input from './Input.svelte';

	/**
	 * The organism pair (scientific name + NCBI TaxId) is ONE piece of
	 * knowledge, not two quizzes. NCBI Taxonomy is the authority that owns
	 * the mapping, so typing either half and pressing Resolve fills both —
	 * SPD retrieves the pair, it does not compute it and never creates a
	 * record from a name. Resolution is a convenience: an unreachable NCBI
	 * shows "not resolved" and the boxes stay hand-typable, so the form is
	 * never blocked by somebody else's uptime.
	 *
	 * `name` may be a throwaway (fields that store only a taxId, like the
	 * codon table's taxon) — FormFields decides that wiring. `name` arrives
	 * as a prop and leaves through `onname` (the storage slot may be a
	 * companion key or a throwaway, which only the caller can resolve);
	 * `taxId` is the field's own value, so it binds straight through.
	 */
	let {
		name = '',
		onname = undefined,
		taxId = $bindable('')
	}: {
		name?: string;
		onname?: (v: string) => void;
		taxId?: string;
	} = $props();

	let card = $state<TaxonomyLookupData | null>(null);
	let busy = $state(false);
	let err = $state('');

	const q = $derived(String(name ?? '').trim() || String(taxId ?? '').trim());

	// a stale resolution card under edited inputs would lie
	let lastKey = $state('');
	$effect(() => {
		const key = `${name}|${taxId}`;
		if (key !== lastKey) {
			lastKey = key;
			card = null;
			err = '';
		}
	});

	function setName(v: string) {
		onname?.(v);
	}

	async function resolve() {
		if (!q) return;
		busy = true;
		err = '';
		card = null;
		try {
			const d = await taxonomy.lookup(q);
			card = d;
			if (d.resolved) {
				if (d.scientificName) setName(String(d.scientificName));
				if (d.taxId != null) taxId = String(d.taxId);
			}
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="space-y-1.5">
	<div class="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2">
		<label class="block">
			<span class="mb-0.5 block text-[11px] text-muted-foreground">{tr('organism_field_name')}</span>
			<!-- one-way value + oninput: the storage slot lives with the caller -->
			<Input
				name="org_name"
				class="h-8 w-full"
				placeholder="Homo sapiens"
				value={name}
				oninput={(e) => setName(String((e.target as HTMLInputElement).value))}
			/>
		</label>
		<label class="block">
			<span class="mb-0.5 block text-[11px] text-muted-foreground">{tr('organism_field_taxid')}</span>
			<Input name="org_taxid" class="h-8 w-full font-mono" placeholder="9606" bind:value={taxId} />
		</label>
		<Button size="sm" variant="outline" onclick={resolve} disabled={busy || !q}>{busy ? tr('organism_resolving') : tr('organism_resolve')}</Button>
	</div>
	{#if err}
		<p class="text-xs text-destructive">{err}</p>
	{:else if card}
		{#if card.resolved}
			<p class="flex flex-wrap items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-300">
				<Badge tone="ok">{tr('organism_resolved')}</Badge>
				<span>{card.scientificName} · TaxId {card.taxId}{card.rank ? ` · ${card.rank}` : ''}{card.commonName ? ` · ${card.commonName}` : ''}</span>
			</p>
		{:else}
			<p class="flex flex-wrap items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
				<Badge tone="warn">{tr('organism_unresolved')}</Badge>
				<span>{tr('organism_unresolved_hint')}</span>
			</p>
		{/if}
	{/if}
</div>
