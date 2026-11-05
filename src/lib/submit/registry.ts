/**
 * Single source of truth for SPD catalog kinds: the list page
 * (CatalogPage config) and the /submit/[kind] wizard read the SAME entry,
 * so a kind can never exist in one place and not the other. Submittable
 * kinds (create) are what /submit shows, grouped by purpose.
 */
import { benchmarks, biobricks, cassettes, cellLines, codonUsage, comparisons, conditionTemplates, constructs, contributions, corrections, enzymeReactions, enzymes, families, genes, geneticCodes, interactions, measurements, mediaRecipes, modelFeedback, mutationSets, pathways, reagents, restrictionEnzymes, retractions, strains, vectors, protocols } from '$lib/api/client';
import { tr } from '$lib/i18n';
import type { CatalogPageConfig } from '$lib/components/CatalogPage.svelte';
import type { FormField } from '$lib/components/form';

export interface CatalogEntry {
	slug: string;
	titleKey: string;
	descKey: string;
	route: string;
	group: 'wetlab' | 'design' | 'analysis' | 'community' | 'browse-only';
	list: () => Promise<unknown>;
	columns: Array<{
		key: string;
		label?: string;
		/** overrides the default cell text; CSV export still uses the raw value */
		format?: (row: Record<string, unknown>) => string;
	}>;
	create?: (b: Record<string, unknown>) => Promise<unknown>;
	fields?: FormField[];
	/** wizard must resolve targetId via TargetPicker instead of asking for a paste */
	picksTarget?: boolean;
	/** shown under an empty list table, usually pointing at the federated source */
	emptyHint?: { text: string; href: string; label: string };
}

export const CATALOGS: CatalogEntry[] = [
	{
			slug: 'genes',
			titleKey: 'browse_genes',
			descKey: 'submit_genes_desc',
			route: 'genes',
			group: 'wetlab',
			list: () => genes.list(),
			columns: [{"key": "id"}, {"key": "name"}, {"key": "symbol"}, {"key": "geneType"}, {"key": "organismScientificName"}, {"key": "dnaLength"}, {"key": "rnaLength"}],
			// the flat organism pair becomes the nested assertion the BE
			// contract wants — the same assembly the protein wizard does
			create: (b) => {
				const body = { ...b };
				if (body.organism_scientificName || body.organism_taxId) {
					body.organism = { scientificName: body.organism_scientificName ?? null, taxId: body.organism_taxId ?? null };
				}
				delete body.organism_scientificName;
				delete body.organism_taxId;
				return genes.create(body as never);
			},
			fields: [ { name: 'name', required: true, hint: tr('gene_hint_one_model') }, { name: 'symbol' }, { name: 'geneType', kind: 'select', options: ['protein_coding','non_coding','regulatory','other'], ns: 'gt' }, { name: 'organism_taxId', kind: 'organism', companion: 'organism_scientificName', label: tr('submit_organism_name'), hint: tr('organism_hint_pair') }, { name: 'dnaSequence', kind: 'textarea', rows: 6, hint: tr('gene_hint_dna_seq') }, { name: 'rnaSequence', kind: 'textarea', rows: 6, hint: tr('gene_hint_rna_seq') }, { name: 'description' }, { name: 'metadata', kind: 'json' } ]
	},
	{
			slug: 'enzymes',
			titleKey: 'browse_enzymes',
			descKey: 'submit_enzymes_desc',
			route: 'enzymes',
			group: 'wetlab',
			list: () => enzymes.list(),
			columns: [
				{ key: 'id' },
				{ key: 'name' },
				{ key: 'ecNumber' },
				{ key: 'enzymeClass' },
				// BRENDA imports are EC-level rows, so they legitimately carry no
				// single source organism; show where the row came from instead of a
				// column that is "—" for every imported enzyme.
				{
					key: 'source',
					label: tr('f_source'),
					format: (r) => {
						const organism = typeof r.sourceOrganism === 'string' ? r.sourceOrganism : '';
						if (organism) return organism;
						const source = typeof r.source === 'string' ? r.source : '';
						return source === 'brenda' ? 'BRENDA' : source || '—';
					}
				},
				{ key: 'targetMolecule' }
			],
			emptyHint: {
				text: tr('enzyme_catalog_empty'),
				href: '/search?entityType=enzyme',
				label: tr('enzyme_catalog_search_brenda')
			},
			create: (b) => enzymes.create(b as never),
			fields: [ { name: 'name', required: true }, { name: 'ecNumber' }, { name: 'enzymeClass', kind: 'select', required: true, options: ['oxidoreductase','transferase','hydrolase','lyase','isomerase','ligase','translocase','other'], ns: 'ec' }, { name: 'sourceOrganism' }, { name: 'substrate' }, { name: 'product' }, { name: 'optimalPh', kind: 'number' }, { name: 'optimalTemperature', kind: 'number' }, { name: 'targetMolecule', kind: 'select', options: ['dna','rna','other'], ns: 'tm' }, { name: 'proteinId', picker: 'protein', hint: tr('protein_picker_hint') }, { name: 'metadata', kind: 'json' } ]
	},
	{
			slug: 'reactions',
			titleKey: 'browse_reactions',
			descKey: 'submit_reactions_desc',
			route: 'reactions',
			group: 'wetlab',
			list: () => enzymeReactions.list(),
			columns: [{"key": "id"}, {"key": "name"}, {"key": "ecNumber"}, {"key": "equation"}, {"key": "reversible"}],
			create: (b) => enzymeReactions.create(b as never),
			fields: [ { name: 'name', required: true }, { name: 'ecNumber' }, { name: 'substrates', kind: 'list' }, { name: 'products', kind: 'list' }, { name: 'cofactors', kind: 'list' }, { name: 'reversible', kind: 'checkbox' }, { name: 'equation' }, { name: 'source', kind: 'json' } ]
	},
	{
			slug: 'pathways',
			titleKey: 'browse_pathways',
			descKey: 'submit_pathways_desc',
			route: 'pathways',
			group: 'wetlab',
			list: () => pathways.list(),
			columns: [{"key": "id"}, {"key": "name"}, {"key": "description"}],
			create: (b) => pathways.create(b as never),
			fields: [ { name: 'name', required: true }, { name: 'description' }, { name: 'source', kind: 'json' } ]
	},
	{
			slug: 'reagents',
			titleKey: 'browse_reagents',
			descKey: 'submit_reagents_desc',
			route: 'reagents',
			group: 'wetlab',
			list: () => reagents.list(),
			columns: [{ key: 'id' }, { key: 'name' }, { key: 'casNumber' }, { key: 'reagentType' }, { key: 'catalogIdentifier' }],
			create: (b) => reagents.create(b as never),
			fields: [ { name: 'name', required: true }, { name: 'reagentType', kind: 'select', required: true, options: ['kit','chemical','enzyme','buffer','consumable','other'], ns: 'rgt' }, { name: 'catalogIdentifier' }, { name: 'description' }, { name: 'attributes', kind: 'json' } ]
	},
	{
			slug: 'strains',
			titleKey: 'browse_strains',
			descKey: 'submit_strains_desc',
			route: 'strains',
			group: 'wetlab',
			list: () => strains.list(),
			columns: [{"key": "id"}, {"key": "name"}, {"key": "species"}, {"key": "genotype"}],
			create: (b) => strains.create(b as never),
			fields: [ { name: 'name', required: true }, { name: 'species' }, { name: 'genotype' }, { name: 'resistanceMarkers', kind: 'list' }, { name: 'background' }, { name: 'metadata', kind: 'json' } ]
	},
	{
			slug: 'cell-lines',
			titleKey: 'browse_cell_lines',
			descKey: 'submit_cell_lines_desc',
			route: 'cell-lines',
			group: 'wetlab',
			list: () => cellLines.list(),
			columns: [{"key": "id"}, {"key": "name"}, {"key": "species"}, {"key": "source"}],
			create: (b) => cellLines.create(b as never),
			fields: [ { name: 'name', required: true }, { name: 'species' }, { name: 'source' }, { name: 'growthConditions', kind: 'json' }, { name: 'metadata', kind: 'json' } ]
	},
	{
			slug: 'media-recipes',
			titleKey: 'browse_media_recipes',
			descKey: 'submit_media_recipes_desc',
			route: 'media-recipes',
			group: 'wetlab',
			list: () => mediaRecipes.list(),
			columns: [{"key": "id"}, {"key": "name"}, {"key": "category"}, {"key": "ph"}, {"key": "notes"}],
			create: (b) => mediaRecipes.create(b as never),
			fields: [ { name: 'name', required: true }, { name: 'category', kind: 'select', required: true, options: ['buffer','media','solution','other'], ns: 'mc' }, { name: 'composition', kind: 'objectList', hint: tr('recipe_hint_composition'), itemFields: [{ key: 'component', required: true }, { key: 'amount' }, { key: 'unit' }] }, { name: 'ph', kind: 'number' }, { name: 'notes' }, { name: 'source', kind: 'json' } ]
	},
	{
			slug: 'condition-templates',
			titleKey: 'browse_condition_templates',
			descKey: 'submit_condition_templates_desc',
			route: 'condition-templates',
			group: 'wetlab',
			list: () => conditionTemplates.list(),
			columns: [{"key": "id"}, {"key": "name"}, {"key": "kind"}, {"key": "description"}],
			create: (b) => conditionTemplates.create(b as never),
			fields: [ { name: 'name', required: true }, { name: 'kind', required: true }, { name: 'template', kind: 'json', required: true, rows: 6 }, { name: 'description' } ]
	},
	{
			slug: 'biobricks',
			titleKey: 'browse_biobricks',
			descKey: 'submit_biobricks_desc',
			route: 'biobricks',
			group: 'design',
			list: () => biobricks.list(),
			columns: [{"key": "id"}, {"key": "name"}, {"key": "partType"}, {"key": "length", "label": "length"}, {"key": "description"}],
			create: (b) => biobricks.create(b as never),
			fields: [ { name: 'name', required: true }, { name: 'partType', kind: 'select', required: true, options: ['promoter','rbs','terminator','cds','protein_tag','regulatory','other'], ns: 'pt' }, { name: 'sequence', kind: 'textarea', required: true, rows: 6, hint: tr('biobrick_hint_seq') }, { name: 'description' }, { name: 'categories', kind: 'list' }, { name: 'metadata', kind: 'json' }, { name: 'parameters', kind: 'json' }, { name: 'crossReferences', kind: 'objectList', itemFields: [{ key: 'source' }, { key: 'url' }] } ]
	},
	{
			slug: 'restriction-enzymes',
			titleKey: 'browse_restriction_enzymes',
			descKey: 'submit_restriction_enzymes_desc',
			route: 'restriction-enzymes',
			group: 'design',
			list: () => restrictionEnzymes.list(),
			columns: [{"key": "id"}, {"key": "name"}, {"key": "recognitionSite"}, {"key": "cutPosition"}, {"key": "enzymeType"}, {"key": "targetMolecule"}],
			create: (b) => restrictionEnzymes.create(b as never),
			fields: [ { name: 'name', required: true, hint: tr('re_hint_name') }, { name: 'recognitionSite', required: true, hint: tr('re_hint_site') }, { name: 'cutPosition', required: true, hint: tr('re_hint_cut') }, { name: 'enzymeType', kind: 'select', options: ['type_ii','type_iis','type_iii','other'], ns: 'ret' }, { name: 'targetMolecule', kind: 'select', options: ['dna','rna','other'], ns: 'tm' }, { name: 'proteinId', picker: 'protein', hint: tr('protein_picker_hint') }, { name: 'metadata', kind: 'json' } ]
	},
	{
			slug: 'measurements',
			titleKey: 'browse_measurements',
			descKey: 'submit_measurements_desc',
			route: 'measurements',
			group: 'analysis',
			list: () => measurements.list(),
			columns: [{"key": "id"}, {"key": "measurementType"}, {"key": "sequenceId"}, {"key": "validationId"}, {"key": "value"}],
			create: (b) => measurements.create(b as never),
			fields: [ { name: 'measurementType', kind: 'select', required: true, options: ['kinetic_km','kinetic_kcat','kinetic_specificity','binding_kd','binding_ic50','expression_yield','dsf_tm','cd_molar_ellipticity','activity','other'], ns: 'mt' }, { name: 'sequenceId', required: true, picker: 'sequence' }, { name: 'validationId', required: true, picker: 'wet-lab-validation' }, { name: 'constructId', picker: 'construct' }, { name: 'value', kind: 'json', required: true, hint: tr('measurement_hint_value') }, { name: 'ligand', kind: 'json' }, { name: 'conditions', kind: 'json' }, { name: 'notes' }, { name: 'provenance', kind: 'json' } ]
	},
	{
			slug: 'families',
			titleKey: 'browse_families',
			descKey: 'submit_families_desc',
			route: 'families',
			group: 'analysis',
			list: () => families.list(),
			columns: [{"key": "id"}, {"key": "name"}, {"key": "description"}],
			create: (b) => families.create(b as never),
			fields: [ { name: 'name', required: true }, { name: 'description' }, { name: 'source', kind: 'objectList' } ]
	},
	{
			slug: 'mutation-sets',
			titleKey: 'browse_mutation_sets',
			descKey: 'submit_mutation_sets_desc',
			route: 'mutation-sets',
			group: 'analysis',
			list: () => mutationSets.list(),
			columns: [{"key": "id"}, {"key": "baseSequenceId"}, {"key": "resultSequenceId"}, {"key": "mutations"}, {"key": "createdAt"}],
			create: (b) => mutationSets.create(b as never),
			fields: [ { name: 'base_sequence_id', required: true, picker: 'sequence', hint: tr('ms_hint_base') }, { name: 'mutations', kind: 'objectList', required: true, hint: tr('ms_hint_mutations'), itemFields: [{ key: 'position' }, { key: 'from' }, { key: 'to' }] }, { name: 'result_sequence_id' }, { name: 'provenance', kind: 'json' } ]
	},
	{
			slug: 'contributions',
			titleKey: 'browse_contributions',
			descKey: 'submit_contributions_desc',
			route: 'contributions',
			group: 'community',
			list: () => contributions.list(),
			columns: [{"key": "id"}, {"key": "target", "label": tr("col_target")}, {"key": "headline", "label": tr("col_summary")}, {"key": "status"}, {"key": "createdAt"}],
			create: (b) => contributions.create(b as never),
			picksTarget: true,
		fields: [ { name: 'targetId', required: true, picker: '*', hint: tr('submit_hint_target_pick') }, { name: 'role', kind: 'select', required: true, options: ['measured','modeled','curated','reviewed','funded','other'], ns: 'role' }, { name: 'summary', kind: 'textarea', required: true, rows: 3 } ]
	},
	{
			slug: 'corrections',
			titleKey: 'browse_corrections',
			descKey: 'submit_corrections_desc',
			route: 'corrections',
			group: 'community',
			list: () => corrections.list(),
			columns: [{"key": "id"}, {"key": "target", "label": tr("col_target")}, {"key": "headline", "label": tr("col_summary")}, {"key": "status"}, {"key": "createdAt"}],
			create: (b) => corrections.create(b as never),
			picksTarget: true,
		fields: [ { name: 'targetId', required: true, picker: '*', hint: tr('submit_hint_target_pick') }, { name: 'reason', kind: 'textarea', required: true, rows: 4 }, { name: 'items', kind: 'fieldPatch', required: true, itemsOf: 'targetId' } ]
	},
	{
			slug: 'retractions',
			titleKey: 'browse_retractions',
			descKey: 'submit_retractions_desc',
			route: 'retractions',
			group: 'community',
			list: () => retractions.list(),
			columns: [{"key": "id"}, {"key": "target", "label": tr("col_target")}, {"key": "headline", "label": tr("col_summary")}, {"key": "status"}, {"key": "createdAt"}],
			create: (b) => retractions.create(b as never),
			picksTarget: true,
		fields: [ { name: 'targetId', required: true, picker: '*', hint: tr('submit_hint_target_pick') }, { name: 'reason', kind: 'textarea', required: true, rows: 4 }, { name: 'evidenceUrl', hint: tr('submit_hint_evidence_url') } ]
	},
	{
			slug: 'benchmarks',
			titleKey: 'browse_benchmarks',
			descKey: 'submit_benchmarks_desc',
			route: 'benchmarks',
			group: 'community',
			list: () => benchmarks.list(),
			columns: [{"key": "id"}, {"key": "target", "label": tr("col_target")}, {"key": "headline", "label": tr("col_summary")}, {"key": "status"}, {"key": "createdAt"}],
			create: (b) => benchmarks.create(b as never),
			fields: [ { name: 'name', required: true }, { name: 'models', kind: 'list', hint: tr('form_hint_comma_list') }, { name: 'dataset' }, { name: 'notes', kind: 'textarea', rows: 3 } ]
	},
	{
			slug: 'model-feedback',
			titleKey: 'browse_model_feedback',
			descKey: 'submit_model_feedback_desc',
			route: 'model-feedback',
			group: 'community',
			list: () => modelFeedback.list(),
			columns: [{"key": "id"}, {"key": "target", "label": tr("col_target")}, {"key": "headline", "label": tr("col_summary")}, {"key": "status"}, {"key": "createdAt"}],
			create: (b) => modelFeedback.create(b as never),
			fields: [ { name: 'model', required: true }, { name: 'case', kind: 'textarea', required: true, rows: 4 }, { name: 'severity', kind: 'select', options: ['low','medium','high'], ns: 'sev' }, { name: 'notes', kind: 'textarea', rows: 3 } ]
	},
	{
			slug: 'vectors',
			titleKey: 'browse_vectors',
			descKey: 'submit_vectors_desc',
			route: 'vectors',
			group: 'browse-only',
			list: () => vectors.list(),
			columns: [{"key": "id"}, {"key": "name"}, {"key": "topology"}, {"key": "format"}]
	},
	{
			slug: 'cassettes',
			titleKey: 'browse_cassettes',
			descKey: 'submit_cassettes_desc',
			route: 'cassettes',
			group: 'browse-only',
			list: () => cassettes.list(),
			columns: [{"key": "id"}, {"key": "parts"}]
	},
	{
			slug: 'constructs',
			titleKey: 'browse_constructs',
			descKey: 'submit_constructs_desc',
			route: 'constructs',
			group: 'browse-only',
			list: () => constructs.list(),
			columns: [{"key": "id"}, {"key": "vectorId"}, {"key": "cassetteId"}, {"key": "validationStatus"}]
	},
	{
			slug: 'codon-usage',
			titleKey: 'browse_codon_usage',
			descKey: 'submit_codon_usage_desc',
			route: 'codon-usage',
			group: 'browse-only',
			list: () => codonUsage.list(),
			columns: [{"key": "id"}, {"key": "source"}, {"key": "taxonId"}, {"key": "selectionMode"}, {"key": "createdAt"}]
	},
	{
			slug: 'genetic-codes',
			titleKey: 'browse_genetic_codes',
			descKey: 'submit_genetic_codes_desc',
			route: 'genetic-codes',
			group: 'browse-only',
			list: () => geneticCodes.list(),
			columns: [{"key": "id"}, {"key": "ncbiTableId"}, {"key": "name"}, {"key": "source"}]
	},
	{
			slug: 'comparisons',
			titleKey: 'browse_comparisons',
			descKey: 'submit_comparisons_desc',
			route: 'comparisons',
			group: 'browse-only',
			list: () => comparisons.list(),
			columns: [{"key": "id"}, {"key": "foldId"}, {"key": "referenceKind"}, {"key": "referenceId"}, {"key": "method"}]
	},
	{
			slug: 'interactions',
			titleKey: 'browse_interactions',
			descKey: 'submit_interactions_desc',
			route: 'interactions',
			group: 'browse-only',
			list: () => interactions.list(),
			columns: [{"key": "id"}, {"key": "foldAId", "label": "Fold A"}, {"key": "foldBId", "label": "Fold B"}, {"key": "interactionType"}, {"key": "affinityKd"}]
	},
	{
		slug: 'protocols',
		titleKey: 'nav_protocols',
		descKey: 'submit_protocols_desc',
		route: 'protocols',
		group: 'wetlab',
		list: () => protocols.list(),
		columns: [{ key: 'id' }, { key: 'title' }, { key: 'status' }, { key: 'updatedAt' }],
		create: (b) => protocols.create(b),
		fields: [
			{ name: 'title', required: true },
			{ name: 'summary' },
			{ name: 'bodyMarkdown', kind: 'textarea', required: true, rows: 10, hint: tr('wiki_hint_markdown') },
			{ name: 'steps', kind: 'objectList', hint: tr('protocol_hint_steps'), itemFields: [{ key: 'order' }, { key: 'description' }] },
			{ name: 'reagents', kind: 'objectList', hint: tr('protocol_hint_reagents'), itemFields: [{ key: 'name' }, { key: 'amount' }, { key: 'unit' }] },
			{ name: 'targets', kind: 'list' },
			{ name: 'tags', kind: 'list' },
			{ name: 'changeSummary', required: true }
		]
	},
];

export function catalogBy(slug: string | undefined): CatalogEntry | undefined {
	return CATALOGS.find((c) => c.slug === slug);
}

/** config assembly for catalog pages; overrides (e.g. a toolbar) merge last. */
export function catalogConfig(slug: string, overrides: Partial<CatalogPageConfig> = {}): CatalogPageConfig {
	const e = catalogBy(slug)!;
	return {
		title: tr(e.titleKey),
		list: e.list,
		columns: e.columns,
		route: e.route,
		...(e.create ? { create: e.create, createFields: e.fields } : {}),
		...(e.emptyHint ? { emptyHint: e.emptyHint } : {}),
		...overrides
	};
}

export const SUBMITTABLE = CATALOGS.filter((c) => c.create && c.group !== 'browse-only');
