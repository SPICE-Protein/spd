<script lang="ts">
	// Declared mutations joined to overlapping annotations, measured effects and
	// exact-match structure availability. `inStructure` is deliberately strict:
	// only an exact-match PDB entity makes residue numbering 1:1, so candidate
	// structures never feed this column.
	import type {
		SequenceMutationAnnotation,
		SequenceMutationMapData,
		SequenceMutationMapping
	} from '$lib/api/types';
	import { tr, enumLabel } from '$lib/i18n';
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';

	let {
		data,
		loading = false,
		sequenceId
	}: {
		data: SequenceMutationMapData | null;
		loading?: boolean;
		sequenceId: string;
	} = $props();

	const rows = $derived(data?.mutations ?? []);

	const counts = $derived({
		mutations: rows.length,
		inDomain: rows.filter((m) => m.inDomain).length,
		inStructure: rows.filter((m) => m.inStructure).length,
		annotated: rows.filter((m) => (m.annotations?.length ?? 0) > 0).length
	});

	function changeLabel(m: SequenceMutationMapping): string {
		return `${m.from ?? '?'}${m.position}${m.to ?? '?'}`;
	}

	function featureTypes(m: SequenceMutationMapping): SequenceMutationAnnotation[] {
		const seen = new Set<string>();
		const out: SequenceMutationAnnotation[] = [];
		for (const a of m.annotations ?? []) {
			const key = a.featureType || a.id || '';
			if (!key || seen.has(key)) continue;
			seen.add(key);
			out.push(a);
		}
		return out;
	}
</script>

<Section title={tr('protein_mutation_map_title')}>
	{#snippet actions()}
		{#if sequenceId}
			<Button size="xs" variant="ghost" href={`/sequences/${sequenceId}`}>
				{tr('protein_mutation_map_open_sequence')}
			</Button>
		{/if}
	{/snippet}

	{#if loading && !data}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else if !data || rows.length === 0}
		<p class="text-sm text-muted-foreground">{tr('protein_mutation_map_none')}</p>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			<Badge tone="muted">{tr('protein_mutation_map_total')} {counts.mutations}</Badge>
			<Badge tone={counts.inDomain > 0 ? 'info' : 'muted'}>
				{tr('protein_mutation_map_in_domain')}
				{counts.inDomain}
			</Badge>
			<Badge tone={counts.inStructure > 0 ? 'ok' : 'muted'}>
				{tr('protein_mutation_map_in_structure')}
				{counts.inStructure}
			</Badge>
			<Badge tone={counts.annotated > 0 ? 'info' : 'muted'}>
				{tr('protein_mutation_map_annotated')}
				{counts.annotated}
			</Badge>
			<span class="text-xs text-muted-foreground">
				{tr('protein_mutation_map_length', { n: data.length })}
			</span>
		</div>

		<p class="mt-1.5 text-xs text-muted-foreground">{tr('protein_mutation_map_structure_hint')}</p>

		{#if data.structures.length}
			<div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
				<span class="text-muted-foreground">{tr('protein_mutation_map_structure_entities')}:</span>
				{#each data.structures as s (`${s.pdbId}:${s.entityId}`)}
					<a class="font-mono underline" href={`/pdb-entries/${s.pdbId}`}>{s.pdbId}</a>
					<span class="text-muted-foreground">
						{#if s.chainNames.length}· {s.chainNames.join(', ')}{/if}
					</span>
				{/each}
			</div>
		{/if}

		<div class="mt-2 overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b text-left text-xs text-muted-foreground">
						<th class="py-1 pr-2">{tr('protein_mutation_map_position')}</th>
						<th class="pr-2">{tr('protein_mutation_map_change')}</th>
						<th class="pr-2">{tr('protein_mutation_map_features')}</th>
						<th class="pr-2">{tr('protein_mutation_map_effect')}</th>
						<th>{tr('protein_mutation_map_structure')}</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as m (m.index)}
						<tr class="border-b align-top last:border-0">
							<td class="py-1 pr-2 font-mono">
								<a class="underline" href={`/sequences/${sequenceId}`}>{m.position}</a>
							</td>
							<td class="pr-2 font-mono">{changeLabel(m)}</td>
							<td class="pr-2">
								{#if featureTypes(m).length}
									<div class="flex flex-wrap gap-1">
										{#each featureTypes(m) as a, i (`${a.featureType}-${a.id ?? i}`)}
											<Badge tone="muted" title={a.description ?? undefined}>
												{enumLabel('ft', a.featureType)}
											</Badge>
										{/each}
									</div>
								{:else}
									<span class="text-xs text-muted-foreground">—</span>
								{/if}
							</td>
							<td class="pr-2">
								{#if m.effectClass || m.effectCount != null}
									<span class="inline-flex flex-wrap items-center gap-1">
										{#if m.effectClass}
											<Badge tone="muted">{enumLabel('ec', m.effectClass)}</Badge>
										{/if}
										{#if m.effectCount != null}
											<span class="text-xs text-muted-foreground">×{m.effectCount}</span>
										{/if}
									</span>
								{:else}
									<span class="text-xs text-muted-foreground">—</span>
								{/if}
							</td>
							<td>
								{#if m.inStructure}
									<Badge tone="ok">{tr('protein_mutation_map_structure_1to1')}</Badge>
								{:else}
									<span class="text-xs text-muted-foreground">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Section>
