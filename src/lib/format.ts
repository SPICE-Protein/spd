import { getLocale } from '$lib/paraglide/runtime';
import { display } from '$lib/state/display.svelte';

/** Unix-seconds timestamps (backend `i32` seconds) → localized date. */
export function fmtTime(unixSeconds: number | null | undefined, withTime = false): string {
	if (unixSeconds == null) return '—';
	const d = new Date(unixSeconds * 1000);
	if (Number.isNaN(d.getTime())) return '—';
	return new Intl.DateTimeFormat(getLocale(), {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
	}).format(d);
}

export function fmtNumber(n: number | null | undefined): string {
	// JSON stores NaN/Infinity as the strings "NaN"/"Infinity" — guard those too
	if (n == null || !Number.isFinite(Number(n))) return '—';
	return new Intl.NumberFormat(getLocale()).format(n);
}

/** `spd:fold:1234abcd…` → `fold:1234abcd`; keeps whatever follows the first two segments.
 * /settings can turn shortening off (display.fullIds) — the whole id comes back. */
export function shortPublicId(id: string | null | undefined, keep = 12): string {
	if (!id) return '—';
	if (display.fullIds) return id;
	const parts = id.split(':');
	const tail = parts.length > 2 ? parts[parts.length - 1] : id;
	const prefix = parts.length > 2 ? `${parts[parts.length - 2]}:` : '';
	return tail.length > keep ? `${prefix}${tail.slice(0, keep)}…` : `${prefix}${tail}`;
}

export type EntityKind =
	| 'protein'
	| 'gene'
	| 'sequence'
	| 'fold'
	| 'validation'
	| 'vector'
	| 'cassette'
	| 'construct'
	| 'biobrick'
	| 'restriction_enzyme'
	| 'protocol'
	| 'reagent'
	| 'measurement'
	| 'mutation_effect'
	| 'interaction'
	| 'family'
	| 'comparison'
	| 'enzyme'
	| 'enzyme_reaction'
	| 'reaction'
	| 'pathway'
	| 'strain'
	| 'cell_line'
	| 'media_recipe'
	| 'condition_template'
	| 'organization'
	| 'user'
	| 'artifact'
	| 'record'
	| 'pdb_entry'
	| 'predicted_fold'
	| 'wet_lab_validation'
	| 'codon_usage'
	| 'genetic_code'
	| 'mutation_set'
	| 'correction'
	| 'retraction'
	| 'benchmark'
	| 'model_feedback'
	| 'contribution';

/** Map a wiki/reference entity type (FEATURE_LIST §27) onto a frontend route. */
const KIND_ROUTE: Record<EntityKind, string> = {
	protein: '/proteins',
	gene: '/genes',
	sequence: '/sequences',
	fold: '/folds',
	validation: '/validations',
	vector: '/vectors',
	cassette: '/cassettes',
	construct: '/constructs',
	biobrick: '/biobricks',
	restriction_enzyme: '/restriction-enzymes',
	protocol: '/protocols',
	reagent: '/reagents',
	measurement: '/measurements',
	mutation_effect: '/mutation-effects',
	interaction: '/interactions',
	family: '/families',
	comparison: '/comparisons',
	enzyme: '/enzymes',
	enzyme_reaction: '/reactions',
	reaction: '/reactions',
	pathway: '/pathways',
	strain: '/strains',
	cell_line: '/cell-lines',
	media_recipe: '/media-recipes',
	condition_template: '/condition-templates',
	organization: '/organizations',
	user: '/users',
	artifact: '/artifacts',
	record: '/records',
	pdb_entry: '/pdb-entries',
	predicted_fold: '/folds',
	wet_lab_validation: '/validations',
	// These five are the shapes the personal feed emits; without a route they
	// would land on /records/{id}, which only resolves api_records rows.
	codon_usage: '/codon-usage',
	genetic_code: '/genetic-codes',
	mutation_set: '/mutation-sets',
	correction: '/corrections',
	retraction: '/retractions',
	benchmark: '/benchmarks',
	model_feedback: '/model-feedback',
	contribution: '/contributions'
};

export function entityHref(kind: EntityKind | string, id: string | null | undefined): string {
	if (!id) return '/';
	// entity types arrive wire-spelled either way (`predicted-fold`,
	// `wet_lab_validation`); the registry table is snake_case.
	const route = KIND_ROUTE[kind.replace(/-/g, '_') as EntityKind] ?? '/records';
	return `${route}/${id}`;
}

/**
 * Human title for any record payload: the first meaningful name we find.
 * Search results and lists use this so users see "Green fluorescent protein"
 * instead of a hex id — the entry point that decides whether SPD reads as
 * usable or as "another PDB".
 */
const TITLE_KEYS = [
	'preferredName',
	'name',
	'title',
	'symbol',
	'geneName',
	'pdbId',
	'cloneName',
	'constructName',
	'templateName',
	'designName',
	'locus',
	'reactionType'
];

/**
 * Imported records used to carry their upstream address in `name` because the
 * catalog's name column is UNIQUE (`TP53 (NM_000546.6)`, `Aspirin (CID 2244)`).
 * Identity is the SPD public id everywhere — links, regions, search and the
 * record chain all match by id — so the address belongs in the source plate,
 * not in the title. Strip only the shapes the importers produced; a name a
 * contributor wrote stays untouched.
 */
export function displayRecordName(name: string | null | undefined, symbol?: string | null): string {
	const text = (name ?? '').trim();
	if (!text) return '';
	const preferred = symbol?.trim();
	if (preferred) return preferred;
	const m = text.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
	const inner = m?.[2]?.trim() ?? '';
	if (m && (/^[A-Z]{1,6}_?\d+(\.\d+)?$/i.test(inner) || /^CID\s+\d+$/i.test(inner))) {
		return m[1].trim();
	}
	return text;
}

export function payloadTitle(payload: unknown, fallback = ''): string {
	if (!payload || typeof payload !== 'object') return fallback;
	const o = payload as Record<string, unknown>;
	for (const k of TITLE_KEYS) {
		const v = o[k];
		if (typeof v === 'string' && v.trim()) return v.trim();
	}
	const d = o.description;
	if (typeof d === 'string' && d.trim()) return d.trim().slice(0, 80);
	return fallback;
}

/**
 * A /search hit carries its fields two ways: api_records rows nest them under
 * `payload`, while the core tables (protein/sequence/fold) are projected flat
 * onto the hit itself. Read fields through this so neither shape renders as a
 * bare hex id.
 */
export function hitFields(hit: { payload?: unknown } & Record<string, unknown>): Record<string, unknown> {
	return (hit.payload ?? hit) as Record<string, unknown>;
}

export function hitTitle(hit: { id?: string; payload?: unknown } & Record<string, unknown>, fallback = ''): string {
	const fields = hitFields(hit);
	const symbol = typeof fields.symbol === 'string' ? fields.symbol : null;
	return displayRecordName(payloadTitle(fields, fallback), symbol);
}

/** Collapse JSON columns to a short single-line preview. */
export function jsonPreview(v: unknown, max = 160): string {
	if (v == null) return '—';
	const s = typeof v === 'string' ? v : JSON.stringify(v);
	return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function boolCell(v: unknown): string {
	if (v === true || v === 1) return '✓';
	if (v === false || v === 0) return '✗';
	return '—';
}

export const VALIDATION_TYPES = [
	'fold_stability',
	'structure_observation',
	'expression',
	'solubility',
	'activity',
	'localization',
	'oligomerization',
	'degradation',
	'construct_verification',
	'negative_result'
] as const;

export const RELATIONSHIPS = ['supports', 'contradicts', 'partially_supports', 'is_inconclusive'] as const;

export const ENVIRONMENT_MATCHES = ['exact', 'approximate', 'not_matched'] as const;

export const REVIEW_DECISIONS = ['supportive', 'critical', 'inconclusive', 'request_revision'] as const;

export const REVIEW_RATINGS = ['good', 'bad', 'mixed', 'uncertain'] as const;

export const MEASUREMENT_TYPES = [
	'kinetic_km',
	'kinetic_kcat',
	'kinetic_specificity',
	'binding_kd',
	'binding_ic50',
	'expression_yield',
	'dsf_tm',
	'cd_molar_ellipticity',
	'activity',
	'other'
] as const;

export const EFFECT_CLASSES = [
	'stabilizing',
	'destabilizing',
	'neutral',
	'functional',
	'pathogenic',
	'benign'
] as const;

export const INTERACTION_TYPES = ['complex', 'transient', 'oligomer', 'other'] as const;

export const REFERENCE_KINDS = ['pdb', 'afdb', 'other'] as const;

export const ASSESSMENT_STATUSES = [
	'computational_only',
	'experimentally_supported',
	'experimentally_contradicted',
	'partially_supported',
	'community_validated',
	'inconclusive',
	'superseded',
	'retracted'
] as const;

export const LICENSES = ['CC-BY-4.0'] as const;

export const BIOMOLECULE_CHARS = 'ABCDEFGHIKLMNPQRSTVWXYZOU';
