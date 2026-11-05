<script lang="ts">
	/**
	 * One row of the personal Market.
	 *
	 * Notes and tags are edited inline and written straight back to the local
	 * store — there is no server round-trip and no save button. The blur handler
	 * is the commit point, so a half-typed tag never lands in storage.
	 */
	import { tr, enumLabel } from '$lib/i18n';
	import { entityHref, fmtTime, shortPublicId } from '$lib/format';
	import { market, type MarketItem } from '$lib/state/market.svelte';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';
	import Input from './Input.svelte';

	let { item }: { item: MarketItem } = $props();

	const href = $derived(item.href || entityHref(item.entityType, item.id));

	function saveNote(e: Event): void {
		const note = (e.currentTarget as HTMLInputElement).value.trim();
		market.update(item.entityType, item.id, { note });
	}

	function saveTags(e: Event): void {
		const raw = (e.currentTarget as HTMLInputElement).value;
		const tags = raw
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		market.update(item.entityType, item.id, { tags });
	}
</script>

<div class="border p-3">
	<div class="flex flex-wrap items-center gap-2">
		<a {href} class="min-w-0 flex-1 truncate text-sm font-medium hover:underline" title={item.name}>
			{item.name}
		</a>
		<Badge tone="neutral">{enumLabel('et', item.entityType.replace(/-/g, '_'))}</Badge>
		<a {href} class="font-mono text-xs text-muted-foreground hover:underline" title={item.id}>
			{shortPublicId(item.id)}
		</a>
		<span class="text-xs text-muted-foreground">{fmtTime(item.addedAt / 1000)}</span>
		<Button size="xs" variant="ghost" onclick={() => market.remove(item.entityType, item.id)}>
			{tr('market_remove')}
		</Button>
	</div>
	<div class="mt-2 grid gap-2 sm:grid-cols-2">
		<label class="block text-xs">
			<span class="mb-1 block text-muted-foreground">{tr('market_note')}</span>
			<Input
				name={`market-note-${item.entityType}-${item.id}`}
				value={item.note ?? ''}
				placeholder={tr('market_note')}
				aria_label={tr('market_note')}
				onblur={saveNote}
			/>
		</label>
		<label class="block text-xs">
			<span class="mb-1 block text-muted-foreground">{tr('market_tags')}</span>
			<Input
				name={`market-tags-${item.entityType}-${item.id}`}
				value={(item.tags ?? []).join(', ')}
				placeholder={tr('market_tags')}
				aria_label={tr('market_tags')}
				onblur={saveTags}
			/>
		</label>
	</div>
</div>
