/**
 * Which detail records have a printable version, and how to load them.
 *
 * Detail pages are tabbed; a printed document cannot be. This registry maps a
 * public route to a single record load plus the handful of secondary reads
 * that belong in the same article (gene regions, protein annotations, review
 * evidence). Community panels are loaded separately by the print page because
 * they apply to every entity type.
 */
import {
	artifacts,
	benchmarks,
	biobricks,
	cassettes,
	cellLines,
	codonUsage,
	comparisons,
	conditionTemplates,
	constructs,
	contributions,
	corrections,
	enzymeReactions,
	enzymes,
	families,
	folds,
	genes,
	graphQuery,
	geneticCodes,
	interactions,
	measurements,
	mediaRecipes,
	modelFeedback,
	mutationEffects,
	mutationSets,
	organizations,
	pathways,
	pdbEntries,
	proteins,
	protocols,
	reagents,
	records,
	restrictionEnzymes,
	retractions,
	sequences,
	strains,
	users,
	validations,
	vectors
} from '$lib/api/client';
import { tr } from '$lib/i18n';
import { asRecord, isRecord } from './format';

export interface PrintExtraSection {
	title: string;
	value?: unknown;
	/** PNG data URLs rendered by the sequence viewer painter. */
	images?: string[];
	/** Lets the print loader find the feature rows for a sequence image. */
	kind?: 'gene-regions' | 'annotations' | 'sequence';
}

export interface PrintPayload {
	record: unknown;
	extras?: PrintExtraSection[];
}

export interface PrintTarget {
	slug: string;
	/** Wiki/reference/relation vocabulary for this entity. */
	type: string;
	titleKey: string;
	/** Records rows carry the target entity type inside the row. */
	typeOf?: (record: Record<string, unknown>) => string | null;
	load: (id: string) => Promise<PrintPayload>;
}

async function quietly<T>(task: Promise<T>): Promise<T | null> {
	try {
		return await task;
	} catch {
		return null;
	}
}

function simple(
	type: string,
	titleKey: string,
	fetch: (id: string) => Promise<unknown>,
	extras?: (record: Record<string, unknown>, id: string) => Promise<PrintExtraSection[]>
): Omit<PrintTarget, 'slug'> {
	return {
		type,
		titleKey,
		load: async (id) => {
			const record = await fetch(id);
			const row = asRecord(record) ?? {};
			return {
				record,
				extras: extras ? await extras(row, id).catch(() => []) : []
			};
		}
	};
}

async function geneRegions(id: string): Promise<PrintExtraSection[]> {
	const data = await quietly(genes.regions.list(id));
	const items = data && Array.isArray(data.items) ? data.items : [];
	return items.length
		? [{ title: tr('gene_regions_title'), value: items, kind: 'gene-regions' }]
		: [];
}

async function proteinExtras(record: Record<string, unknown>): Promise<PrintExtraSection[]> {
	const extras: PrintExtraSection[] = [];
	const proteinId = String(record.id ?? '');

	// A protein record owns sequences through the graph rather than a single
	// sequenceId column; walk that edge so every canonical/mutant chain gets
	// its viewer image in the printable article.
	if (proteinId) {
		const graph = await quietly(
			graphQuery.run({
				root: { type: 'protein', id: proteinId, expand: { sequences: { limit: 100 } } }
			})
		);
		const node = graph && Array.isArray(graph.results) ? asRecord(graph.results[0]) : null;
		const sequenceRefs = node && Array.isArray(node.sequences) ? node.sequences : [];
		const ids = sequenceRefs
			.map((ref) => String(asRecord(ref)?.id ?? ''))
			.filter((id) => id.length > 0);
		const loaded = await Promise.all(ids.map((id) => quietly(sequences.get(id))));
		for (const sequence of loaded) {
			if (sequence) extras.push({ title: tr('sequence_title'), value: sequence });
		}
	}

	const annotations = await quietly(proteins.annotations(proteinId));
	if (annotations && Array.isArray(annotations.annotations) && annotations.annotations.length) {
		extras.push({
			title: tr('protein_tab_evidence'),
			value: annotations.annotations,
			kind: 'annotations'
		});
	}

	return extras;
}

async function sequenceExtras(id: string): Promise<PrintExtraSection[]> {
	const annotations = await quietly(sequences.annotations(id));
	if (annotations && Array.isArray(annotations.annotations) && annotations.annotations.length) {
		return [
			{ title: tr('protein_tab_evidence'), value: annotations.annotations, kind: 'annotations' }
		];
	}
	return [];
}

async function validationExtras(id: string): Promise<PrintPayload> {
	const data = await validations.get(id);
	const extras: PrintExtraSection[] = [];
	if (Array.isArray(data.reviews) && data.reviews.length) {
		extras.push({ title: tr('validation_tab_reviews'), value: data.reviews });
	}
	if (Array.isArray(data.screeningEvents) && data.screeningEvents.length) {
		extras.push({ title: tr('validation_tab_screening'), value: data.screeningEvents });
	}
	return { record: data.validation, extras };
}

async function userRecord(id: string): Promise<PrintPayload> {
	const data = await users.spdFactor(id);
	const record = isRecord(data) ? { ...data } : { id };
	return { record };
}

async function organizationRecord(id: string): Promise<PrintPayload> {
	const data = await organizations.home(id);
	return { record: data };
}

export const PRINT_TARGETS: Record<string, PrintTarget> = {
	genes: {
		slug: 'genes',
		...simple('gene', 'browse_genes', genes.get, (_r, id) => geneRegions(id))
	},
	proteins: {
		slug: 'proteins',
		...simple('protein', 'nav_proteins', proteins.get, (record) => proteinExtras(record))
	},
	sequences: {
		slug: 'sequences',
		...simple('sequence', 'sequence_title', sequences.get, (_r, id) => sequenceExtras(id))
	},
	folds: { slug: 'folds', ...simple('fold', 'fold_title', folds.get) },
	validations: {
		slug: 'validations',
		type: 'validation',
		titleKey: 'validations_title',
		load: validationExtras
	},
	artifacts: { slug: 'artifacts', ...simple('artifact', 'artifact_title', artifacts.get) },
	cassettes: { slug: 'cassettes', ...simple('cassette', 'browse_cassettes', cassettes.get) },
	vectors: { slug: 'vectors', ...simple('vector', 'browse_vectors', vectors.get) },
	constructs: { slug: 'constructs', ...simple('construct', 'browse_constructs', constructs.get) },
	'enzyme-reactions': {
		slug: 'enzyme-reactions',
		...simple('reaction', 'browse_reactions', enzymeReactions.get)
	},
	reactions: {
		slug: 'reactions',
		...simple('reaction', 'browse_reactions', enzymeReactions.get)
	},
	enzymes: { slug: 'enzymes', ...simple('enzyme', 'browse_enzymes', enzymes.get) },
	'restriction-enzymes': {
		slug: 'restriction-enzymes',
		...simple('restriction_enzyme', 'browse_restriction_enzymes', restrictionEnzymes.get)
	},
	'codon-usage': {
		slug: 'codon-usage',
		...simple('codon_usage', 'browse_codon_usage', codonUsage.get)
	},
	'genetic-codes': {
		slug: 'genetic-codes',
		...simple('genetic_code', 'browse_genetic_codes', geneticCodes.get)
	},
	'mutation-sets': {
		slug: 'mutation-sets',
		...simple('mutation_set', 'browse_mutation_sets', mutationSets.get)
	},
	biobricks: { slug: 'biobricks', ...simple('biobrick', 'browse_biobricks', biobricks.get) },
	pathways: { slug: 'pathways', ...simple('pathway', 'browse_pathways', pathways.get) },
	strains: { slug: 'strains', ...simple('strain', 'browse_strains', strains.get) },
	'cell-lines': { slug: 'cell-lines', ...simple('cell_line', 'browse_cell_lines', cellLines.get) },
	'media-recipes': {
		slug: 'media-recipes',
		...simple('media_recipe', 'browse_media_recipes', mediaRecipes.get)
	},
	'condition-templates': {
		slug: 'condition-templates',
		...simple('condition_template', 'browse_condition_templates', conditionTemplates.get)
	},
	reagents: { slug: 'reagents', ...simple('reagent', 'browse_reagents', reagents.get) },
	measurements: {
		slug: 'measurements',
		...simple('measurement', 'browse_measurements', measurements.get)
	},
	'mutation-effects': {
		slug: 'mutation-effects',
		...simple('mutation_effect', 'browse_mutation_effects', mutationEffects.get)
	},
	interactions: {
		slug: 'interactions',
		...simple('interaction', 'browse_interactions', interactions.get)
	},
	families: { slug: 'families', ...simple('family', 'browse_families', families.get) },
	comparisons: {
		slug: 'comparisons',
		...simple('comparison', 'browse_comparisons', comparisons.get)
	},
	protocols: { slug: 'protocols', ...simple('protocol', 'nav_protocols', protocols.get) },
	records: {
		slug: 'records',
		type: 'record',
		titleKey: 'records_title',
		typeOf: (record) => (typeof record.entityType === 'string' ? record.entityType : null),
		load: async (id) => ({ record: await records.get(id) })
	},
	contributions: {
		slug: 'contributions',
		...simple('contribution', 'browse_contributions', contributions.get)
	},
	corrections: {
		slug: 'corrections',
		...simple('correction', 'browse_corrections', corrections.get)
	},
	retractions: {
		slug: 'retractions',
		...simple('retraction', 'browse_retractions', retractions.get)
	},
	benchmarks: { slug: 'benchmarks', ...simple('benchmark', 'browse_benchmarks', benchmarks.get) },
	'model-feedback': {
		slug: 'model-feedback',
		...simple('model_feedback', 'browse_model_feedback', modelFeedback.get)
	},
	organizations: {
		slug: 'organizations',
		type: 'organization',
		titleKey: 'org_dir_title',
		load: organizationRecord
	},
	users: { slug: 'users', type: 'user', titleKey: 'user_factor_title', load: userRecord },
	'pdb-entries': { slug: 'pdb-entries', ...simple('pdb_entry', 'pdb_title', pdbEntries.get) }
};

/** `/print/genes/spd:gene:…` → target + id. */
export function parsePrintPath(
	rest: string | undefined
): { target: PrintTarget; id: string } | null {
	const raw = (rest ?? '').split('/').filter(Boolean);
	if (raw.length < 2) return null;
	const slug = decodeURIComponent(raw[0]);
	const id = decodeURIComponent(raw.slice(1).join('/'));
	const target = PRINT_TARGETS[slug];
	return target && id ? { target, id } : null;
}
