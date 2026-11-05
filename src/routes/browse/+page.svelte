<script lang="ts">
	import { tr } from '$lib/i18n';
	import Section from '$lib/components/Section.svelte';

	const groups: Array<{
		id: string;
		titleKey: string;
		descKey: string;
		items: Array<{ href: string; key: string; descKey?: string }>;
	}> = [
		{
			id: 'science',
			titleKey: 'browse_group_science',
			descKey: 'browse_desc_science',
			items: [
				{ href: '/proteins', key: 'nav_proteins' },
				{ href: '/genes', key: 'browse_genes' },
				{ href: '/folds/query', key: 'browse_folds_query' },
				{ href: '/validations', key: 'browse_validations' },
				{ href: '/leaderboard', key: 'lb_title' },
				{ href: '/measurements', key: 'browse_measurements' },
				{ href: '/mutation-effects', key: 'browse_mutation_effects' },
				{ href: '/interactions', key: 'browse_interactions' },
				{ href: '/families', key: 'browse_families' },
				{ href: '/comparisons', key: 'browse_comparisons' },
				{ href: '/mutation-sets', key: 'browse_mutation_sets' },
				{ href: '/codon-usage', key: 'browse_codon_usage' },
				{ href: '/genetic-codes', key: 'browse_genetic_codes' },
				{
					href: '/codon-workbench',
					key: 'cw_nav',
					descKey: 'cw_nav_desc'
				}
			]
		},
		{
			id: 'design',
			titleKey: 'browse_group_design',
			descKey: 'browse_desc_design',
			items: [
				{ href: '/vectors', key: 'browse_vectors' },
				{ href: '/cassettes', key: 'browse_cassettes' },
				{ href: '/constructs', key: 'browse_constructs' },
				{ href: '/biobricks', key: 'browse_biobricks' },
				{ href: '/restriction-enzymes', key: 'browse_restriction_enzymes' }
			]
		},
		{
			id: 'catalogs',
			titleKey: 'browse_group_catalogs',
			descKey: 'browse_desc_catalogs',
			items: [
				{ href: '/enzymes', key: 'browse_enzymes' },
				{ href: '/reactions', key: 'browse_reactions' },
				{ href: '/pathways', key: 'browse_pathways' },
				{ href: '/strains', key: 'browse_strains' },
				{ href: '/cell-lines', key: 'browse_cell_lines' },
				{ href: '/media-recipes', key: 'browse_media_recipes' },
				{ href: '/condition-templates', key: 'browse_condition_templates' },
				{ href: '/reagents', key: 'browse_reagents' }
			]
		},
		{
			id: 'community',
			titleKey: 'browse_group_community',
			descKey: 'browse_desc_community',
			items: [
				{ href: '/protocols', key: 'nav_protocols' },
				{ href: '/contributions', key: 'browse_contributions' },
				{ href: '/corrections', key: 'browse_corrections' },
				{ href: '/retractions', key: 'browse_retractions' },
				{ href: '/benchmarks', key: 'browse_benchmarks' },
				{ href: '/model-feedback', key: 'browse_model_feedback' },
				{ href: '/organizations', key: 'nav_organizations' },
				{ href: '/stats', key: 'nav_stats' },
				{ href: '/schema', key: 'browse_schema' }
			]
		},
		{
			id: 'reference',
			titleKey: 'browse_group_reference',
			descKey: 'browse_desc_reference',
			items: [
				{ href: '/pdb-entries', key: 'browse_pdb_entries' },
				{ href: '/feature-labels', key: 'feature_label_nav' }
			]
		},
		{
			id: 'tools',
			titleKey: 'browse_group_tools',
			descKey: 'browse_desc_tools',
			items: [
				{ href: '/query', key: 'browse_query' },
				{ href: '/me', key: 'browse_tokens' }
			]
		}
	];
</script>

<div class="space-y-4">
	<h1 class="text-2xl font-bold">{tr('nav_browse')}</h1>
	<p class="text-sm text-muted-foreground">{tr('browse_intro')}</p>
	{#each groups as g (g.id)}
		<Section title={tr(g.titleKey)}>
			<p class="mb-3 text-sm text-muted-foreground">{tr(g.descKey)}</p>
			<div class="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
				{#each g.items as item (item.href)}
					<a
						href={item.href}
						class="rounded-none border px-3 py-2 text-sm hover:border-primary/50 hover:bg-accent/40"
					>
						<span class="block">{tr(item.key)}</span>
						{#if item.descKey}
							<span class="mt-0.5 block text-[11px] text-muted-foreground">{tr(item.descKey)}</span>
						{/if}
					</a>
				{/each}
			</div>
		</Section>
	{/each}
</div>

<svelte:head><title>{tr('nav_browse')} · SPD</title></svelte:head>
