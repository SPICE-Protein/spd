/**
 * Named query shapes, searchable by what the user is trying to find rather
 * than by edge names. Each template builds a fresh tree, so loading one never
 * mutates a shared spec another tab is editing.
 *
 * A template is only useful if it is legal on first click: `templates.test.ts`
 * walks every tree against the same edge registry the builder uses.
 */
import { newSpec, presetMetabolism, type NodeSpec } from './registry';

export interface QueryTemplate {
	id: string;
	titleKey: string;
	descKey: string;
	/** Search-only synonyms, in both UI languages. Never rendered. */
	keywords: string[];
	build: () => NodeSpec[];
}

/** Embedded value edge (reviews, assessment, screeningEvents). */
function embedded(): NodeSpec {
	return newSpec('');
}

function proteinGraph(): NodeSpec[] {
	const protein = newSpec('protein');
	const sequence = newSpec('sequence');
	sequence.select = 'length, mutations';
	const fold = newSpec('fold');
	fold.select = 'verificationLevel, validationStatus';
	sequence.edges.push({ edge: 'folds', child: fold });
	protein.edges.push({ edge: 'sequences', child: sequence });
	return [protein];
}

function foldEvidence(): NodeSpec[] {
	const fold = newSpec('fold');
	const validation = newSpec('validation');
	validation.edges.push({ edge: 'reviews', child: embedded() });
	fold.edges.push(
		{ edge: 'validations', child: validation },
		{ edge: 'assessment', child: embedded() }
	);
	return [fold];
}

function sequenceLineage(): NodeSpec[] {
	const sequence = newSpec('sequence');
	sequence.edges.push(
		{ edge: 'protein', child: newSpec('protein') },
		{ edge: 'parent', child: newSpec('sequence') }
	);
	return [sequence];
}

function sequenceFolds(): NodeSpec[] {
	const sequence = newSpec('sequence');
	const fold = newSpec('fold');
	fold.edges.push(
		{ edge: 'environment', child: newSpec('environment') },
		{ edge: 'model', child: newSpec('model') },
		{ edge: 'artifacts', child: newSpec('artifact') }
	);
	sequence.edges.push({ edge: 'folds', child: fold });
	return [sequence];
}

function validationContext(): NodeSpec[] {
	const validation = newSpec('validation');
	const fold = newSpec('fold');
	fold.edges.push({ edge: 'sequence', child: newSpec('sequence') });
	validation.edges.push({ edge: 'fold', child: fold });
	return [validation];
}

function foldOutputs(): NodeSpec[] {
	const fold = newSpec('fold');
	fold.edges.push(
		{ edge: 'model', child: newSpec('model') },
		{ edge: 'environment', child: newSpec('environment') },
		{ edge: 'artifacts', child: newSpec('artifact') }
	);
	return [fold];
}

function uniprotRoot(): NodeSpec[] {
	const protein = newSpec('protein');
	protein.source = 'uniprot';
	const sequence = newSpec('sequence');
	sequence.select = 'length';
	protein.edges.push({ edge: 'sequences', child: sequence });
	return [protein];
}

function mutationContext(): NodeSpec[] {
	const sequence = newSpec('sequence');
	sequence.select = 'mutations';
	sequence.edges.push({ edge: 'protein', child: newSpec('protein') });
	return [sequence];
}

function screeningHistory(): NodeSpec[] {
	const validation = newSpec('validation');
	validation.edges.push(
		{ edge: 'screeningEvents', child: embedded() },
		{ edge: 'reviews', child: embedded() }
	);
	return [validation];
}

export const QUERY_TEMPLATES: QueryTemplate[] = [
	{
		id: 'protein_structure',
		titleKey: 'qt_protein_structure_title',
		descKey: 'qt_protein_structure_desc',
		keywords: [
			'protein',
			'sequence',
			'fold',
			'structure',
			'mutant',
			'蛋白',
			'序列',
			'折叠',
			'结构',
			'突变'
		],
		build: proteinGraph
	},
	{
		id: 'fold_evidence',
		titleKey: 'qt_fold_evidence_title',
		descKey: 'qt_fold_evidence_desc',
		keywords: [
			'fold',
			'validation',
			'review',
			'evidence',
			'assessment',
			'折叠',
			'验证',
			'评审',
			'证据',
			'评估'
		],
		build: foldEvidence
	},
	{
		id: 'sequence_lineage',
		titleKey: 'qt_sequence_lineage_title',
		descKey: 'qt_sequence_lineage_desc',
		keywords: ['sequence', 'lineage', 'parent', 'protein', '序列', '谱系', '母序列', '蛋白'],
		build: sequenceLineage
	},
	{
		id: 'sequence_folds',
		titleKey: 'qt_sequence_folds_title',
		descKey: 'qt_sequence_folds_desc',
		keywords: [
			'sequence',
			'fold',
			'model',
			'environment',
			'artifact',
			'序列',
			'折叠',
			'模型',
			'环境',
			'文件'
		],
		build: sequenceFolds
	},
	{
		id: 'validation_context',
		titleKey: 'qt_validation_context_title',
		descKey: 'qt_validation_context_desc',
		keywords: ['validation', 'fold', 'sequence', 'context', '验证', '折叠', '序列', '上下文'],
		build: validationContext
	},
	{
		id: 'fold_outputs',
		titleKey: 'qt_fold_outputs_title',
		descKey: 'qt_fold_outputs_desc',
		keywords: [
			'fold',
			'model',
			'environment',
			'artifact',
			'output',
			'折叠',
			'模型',
			'环境',
			'产物'
		],
		build: foldOutputs
	},
	{
		id: 'uniprot_root',
		titleKey: 'qt_uniprot_root_title',
		descKey: 'qt_uniprot_root_desc',
		keywords: [
			'uniprot',
			'accession',
			'import',
			'external',
			'protein',
			'登录号',
			'导入',
			'外部',
			'蛋白'
		],
		build: uniprotRoot
	},
	{
		id: 'mutation_context',
		titleKey: 'qt_mutation_context_title',
		descKey: 'qt_mutation_context_desc',
		keywords: ['mutation', 'variant', 'sequence', 'protein', '突变', '变异', '序列', '蛋白'],
		build: mutationContext
	},
	{
		id: 'screening_history',
		titleKey: 'qt_screening_history_title',
		descKey: 'qt_screening_history_desc',
		keywords: ['screening', 'validation', 'review', 'screeningEvents', '筛选', '验证', '评审'],
		build: screeningHistory
	},
	{
		// Shares the preset tree so the discoverable button and the template
		// list cannot drift into two different definitions of the backbone.
		id: 'metabolism_backbone',
		titleKey: 'qt_metabolism_title',
		descKey: 'qt_metabolism_desc',
		keywords: ['pathway', 'reaction', 'metabolism', 'catalog', '通路', '代谢', '反应', '催化'],
		build: presetMetabolism
	}
];

/** One-line shape for the template list: `protein → sequences → folds`. */
export function templateShape(roots: NodeSpec[]): string {
	const chain = (node: NodeSpec): string => {
		if (!node.edges.length) return '';
		return node.edges
			.map((edge) => {
				const rest = chain(edge.child);
				return rest ? `${edge.edge} → ${rest}` : edge.edge;
			})
			.join(' + ');
	};
	const shape = (root: NodeSpec): string => {
		const label = root.source ? `${root.type}[${root.source}]` : root.type || 'value';
		const rest = chain(root);
		return rest ? `${label} → ${rest}` : label;
	};
	return roots.map(shape).join(' · ');
}
