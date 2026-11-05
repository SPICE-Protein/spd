<script lang="ts">
	import { shortPublicId, entityHref } from '$lib/format';
	import type { EntityKind } from '$lib/format';

	/**
	 * Renders an spd: public id as a short string; links it when a frontend
	 * route exists for the id's `spd:<kind>:` segment.
	 */
	let {
		id,
		kind = undefined,
		showFull = false
	}: {
		id: string | null | undefined;
		kind?: EntityKind | string;
		showFull?: boolean;
	} = $props();

	// spd:<kind> segment → EntityKind that has a real route.
	const LINKABLE: Record<string, EntityKind> = {
		protein: 'protein',
		gene: 'gene',
		sequence: 'sequence',
		fold: 'fold',
		predicted_fold: 'fold',
		measurement: 'measurement',
		mutation_effect: 'mutation_effect',
		wet_lab_validation: 'validation',
		validation: 'validation',
		vector_template: 'vector',
		expression_cassette: 'cassette',
		construct: 'construct',
		biobrick: 'biobrick',
		restriction_enzyme: 'restriction_enzyme',
		protocol: 'protocol',
		reagent: 'reagent',
		enzyme: 'enzyme',
		reaction: 'reaction',
		pathway: 'pathway',
		strain: 'strain',
		cell_line: 'cell_line',
		// relation endpoints spell the catalog types with a dash
		'pdb-entry': 'pdb_entry',
		interaction: 'interaction',
		family: 'family',
		comparison: 'comparison',
		media_recipe: 'media_recipe',
		condition_template: 'condition_template'
	};

	// artifact public ids are the one family outside the spd: namespace
	// (`artifact:<kind>:<uuid>`) — route them too, or every bare artifact id
	// in the app renders as inert text
	// some catalogs spell their public-id segment with a dash where the
	// registry uses an underscore (restriction-enzyme) — try both spellings
	// before declaring the id inert
	const resolvedKind = $derived(
		kind ??
			(id?.startsWith('spd:')
				? (LINKABLE[id.split(':')[1]] ?? LINKABLE[id.split(':')[1].replace(/-/g, '_')] ?? undefined)
				: id?.startsWith('artifact:')
					? 'artifact'
					: undefined)
	);
	const href = $derived(id && resolvedKind ? entityHref(resolvedKind, id) : undefined);
</script>

{#if id}
	{#if href}
		<a
			{href}
			class="font-mono text-xs text-primary underline-offset-2 hover:underline break-all"
			title={id}
		>
			{showFull ? id : shortPublicId(id)}
		</a>
	{:else}
		<span class="font-mono text-xs text-muted-foreground break-all" title={id}
			>{showFull ? id : shortPublicId(id)}</span
		>
	{/if}
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
