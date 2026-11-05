<script lang="ts">
	import { relations } from '$lib/api/client';
	import type { EntityRelation, EntityRef } from '$lib/api/types';
	import { tr, enumLabel } from '$lib/i18n';
	import Section from './Section.svelte';
	import Badge from './Badge.svelte';
	import IdLink from './IdLink.svelte';

	/**
	 * Typed relation edges around this entity, split by direction. The panel
	 * fetches its own data: the relation graph changes independently of the
	 * record body a detail page already loaded.
	 */
	let { entityType, entityId }: { entityType: string; entityId: string } = $props();

	let rows = $state<EntityRelation[]>([]);
	let loading = $state(true);
	let error = $state('');
	// A fast id change must not let an older response overwrite the newer one.
	let generation = 0;

	async function load() {
		const run = ++generation;
		loading = true;
		error = '';
		try {
			const res = await relations.forEntity(entityType, entityId);
			if (run !== generation) return;
			rows = Array.isArray(res.relations) ? res.relations : [];
		} catch (e) {
			if (run !== generation) return;
			rows = [];
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (run === generation) loading = false;
		}
	}

	$effect(() => {
		if (!entityId) {
			rows = [];
			loading = false;
			return;
		}
		void load();
	});

	const outgoing = $derived(rows.filter((r) => r.direction === 'out'));
	const incoming = $derived(rows.filter((r) => r.direction === 'in'));

	function otherSide(r: EntityRelation): EntityRef {
		if (r.direction === 'out') return r.to;
		if (r.direction === 'in') return r.from;
		return r.from.type === entityType && r.from.id === entityId ? r.to : r.from;
	}

	function sourceVisible(r: EntityRelation): boolean {
		const source = r.source ?? '';
		return source === 'derived' || !source.startsWith('spd');
	}
</script>

<Section title={tr('relations_title')}>
	{#if loading}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else if error}
		<p class="text-sm text-destructive">{tr('relations_error')}</p>
	{:else if rows.length === 0}
		<p class="text-sm text-muted-foreground">{tr('relations_empty')}</p>
	{:else}
		<div class="space-y-3">
			{#each [{ key: 'out', label: tr('relations_outgoing'), items: outgoing }, { key: 'in', label: tr('relations_incoming'), items: incoming }] as group (group.key)}
				{#if group.items.length}
					<div>
						<p class="mb-1 text-xs font-semibold text-muted-foreground">
							{group.label} · <span class="tabular-nums">{group.items.length}</span>
						</p>
						<ul class="divide-y">
							{#each group.items as r (r.id)}
								{@const other = otherSide(r)}
								<li class="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
									<span class="font-medium">{enumLabel('relation', r.relationType)}</span>
									<Badge tone="muted">{enumLabel('et', other.type.replace(/-/g, '_'))}</Badge>
									<IdLink id={other.id} kind={other.type} />
									{#if sourceVisible(r)}
										<Badge tone={r.source === 'derived' ? 'warn' : 'muted'}>
											{r.source === 'derived' ? tr('relations_source_derived') : r.source}
										</Badge>
									{/if}
									{#if r.note}
										<span class="text-xs text-muted-foreground">{r.note}</span>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</Section>
