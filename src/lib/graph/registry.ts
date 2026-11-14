/**
 * Frontend mirror of the backend graph edge registry (spd_backend
 * src/modules/query/graph.rs) plus the §41 tier ladder. The builder can only
 * offer edges this table knows, which keeps generated queries legal by
 * construction — the wire contract says unknown edges/type are 400s anyway.
 */
import type { GraphQueryInput } from '$lib/api/types';

export const NODE_TYPES = ['gene', 'protein', 'sequence', 'fold', 'validation', 'environment', 'model', 'artifact'] as const;

export interface EdgeInfo {
	/** Edge name as it appears in `expand`. */
	edge: string;
	/** Child node type, or null for embedded value edges (no expansion). */
	child: string | null;
	/** List edge → the builder exposes a per-node `limit`. */
	many: boolean;
}

export const EDGES: Record<string, EdgeInfo[]> = {
	// A gene reaches the proteins its CDS regions declare. This is the edge
	// that keeps the graph on the model's own backbone: gene → CDS → protein
	// is how a record actually arrives, and without it the graph could only
	// describe the structural half of the collection.
	gene: [{ edge: 'proteins', child: 'protein', many: true }],
	protein: [{ edge: 'sequences', child: 'sequence', many: true }],
	sequence: [
		{ edge: 'protein', child: 'protein', many: false },
		{ edge: 'parent', child: 'sequence', many: false },
		{ edge: 'folds', child: 'fold', many: true }
	],
	fold: [
		{ edge: 'sequence', child: 'sequence', many: false },
		{ edge: 'environment', child: 'environment', many: false },
		{ edge: 'model', child: 'model', many: false },
		{ edge: 'artifacts', child: 'artifact', many: true },
		{ edge: 'validations', child: 'validation', many: true },
		{ edge: 'assessment', child: null, many: false }
	],
	validation: [
		{ edge: 'fold', child: 'fold', many: false },
		{ edge: 'reviews', child: null, many: true },
		{ edge: 'screeningEvents', child: null, many: true }
	],
	environment: [],
	model: [],
	artifact: []
};

export function edgeInfo(entity: string, field: string): EdgeInfo | undefined {
	return EDGES[entity]?.find((e) => e.edge === field);
}

/**
 * One-line outline of a tree: `gene → proteins → sequences`. The builder
 * shows a form per node, which says what each level is but not how the whole
 * tree reads; this is the summary that stays legible past two levels.
 */
export function specShape(root: NodeSpec): string {
	const chain = (node: NodeSpec): string => {
		if (!node.edges.length) return '';
		return node.edges
			.map((edge) => {
				const rest = chain(edge.child);
				return rest ? `${edge.edge} → ${rest}` : edge.edge;
			})
			.join(' + ');
	};
	const label = root.source ? `${root.type}[${root.source}]` : root.type || 'value';
	const rest = chain(root);
	return rest ? `${label} → ${rest}` : label;
}

/** limits_for() in the backend token service: depth = max ancestors count. */
export const TIERS: Record<string, { depth: number; budget: number }> = {
	anonymous: { depth: 2, budget: 20 },
	standard: { depth: 3, budget: 40 },
	unlimited: { depth: 10, budget: 2000 }
};

export function tierFor(signedIn: boolean): 'anonymous' | 'standard' {
	return signedIn ? 'standard' : 'anonymous';
}

// ------------------------------------------------------------- builder AST --

export interface NodeSpec {
	type: string;
	/** Record id (spd:… or uuid). A protein root may instead carry a
	 *  UniProt accession; `source` makes that explicit, and an empty source
	 *  lets the server infer UniProt from the accession's shape. */
	id: string;
	/** Upstream catalog for an external protein root (currently `uniprot`). */
	source: string;
	limit: string;
	select: string;
	edges: EdgeSpec[];
}

export interface EdgeSpec {
	edge: string;
	child: NodeSpec;
}

let uidSeq = 0;
const uidBag = new WeakMap<NodeSpec, number>();
/** Stable component keys for the recursive editor (no Date.now/Math.random rules). */
export function specUid(spec: NodeSpec): number {
	let n = uidBag.get(spec);
	if (n === undefined) {
		n = ++uidSeq;
		uidBag.set(spec, n);
	}
	return n;
}

export function newSpec(type: string, id = ''): NodeSpec {
	return { type, id, source: '', limit: '', select: '', edges: [] };
}

/** Tree height: root alone is 1. A node is reachable iff height <= tier.depth. */
export function specHeight(spec: NodeSpec): number {
	let best = 0;
	for (const e of spec.edges) best = Math.max(best, specHeight(e.child));
	return 1 + best;
}

/**
 * Copy a tree with expansions below `maxDepth` removed. Seed links can carry a
 * template built for a signed-in tier; an anonymous reader still gets the
 * shallow part instead of a builder that refuses to run.
 */
export function trimToDepth(spec: NodeSpec, maxDepth: number): NodeSpec {
	if (maxDepth <= 1) return { ...spec, edges: [] };
	return {
		...spec,
		edges: spec.edges.map((e) => ({ ...e, child: trimToDepth(e.child, maxDepth - 1) }))
	};
}

/**
 * Conservative minimum of resolutions the walk will charge: every structural
 * node counts 1, every list edge pays 1 for the fetch itself. Unknown child
 * cardinality is what makes this a floor, not a prediction.
 */
export function specMinResolutions(spec: NodeSpec, roots = 0): number {
	let total = roots === 0 ? 1 : 0; // batch roots are counted by the caller
	for (const e of spec.edges) {
		total += 1; // the fetch itself
		total += specMinResolutions(e.child);
	}
	return total;
}

export function treesMinResolutions(roots: NodeSpec[]): number {
	return roots.reduce((t, r) => t + specMinResolutions(r, 1), 0);
}

// ------------------------------------------------------------- wire mapping --

export function specToNodeQuery(spec: NodeSpec): Record<string, unknown> {
	const q: Record<string, unknown> = {};
	const sel = spec.select.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
	if (sel.length) q.select = sel;
	if (spec.limit.trim() && /^\d+$/.test(spec.limit.trim())) q.limit = Number(spec.limit.trim());
	if (spec.edges.length) {
		const expand: Record<string, unknown> = {};
		for (const e of spec.edges) expand[e.edge] = specToNodeQuery(e.child);
		q.expand = expand;
	}
	return q;
}

export function specsToInput(roots: NodeSpec[]): GraphQueryInput {
	const single = roots.length === 1;
	const root = (r: NodeSpec) => ({
		type: r.type,
		id: r.id.trim(),
		...(r.source.trim() ? { source: r.source.trim() } : {}),
		...specToNodeQuery(r)
	});
	return single ? { root: root(roots[0]) as never } : { roots: roots.map((r) => root(r) as never) };
}

// ------------------------------------------------------------- presets ----

/**
 * The starting trees behind the three preset buttons. They live here so the
 * legality rules can be tested: a preset that names a field the backend does
 * not project, or that is deeper than the signed-in tier, is a dead end on
 * first click.
 */
export function presetProtein(): NodeSpec[] {
	const p = newSpec('protein');
	const seqs = newSpec('sequence');
	seqs.select = 'length, mutations';
	const folds = newSpec('fold');
	// `confidence` used to be here, but the fold projection has no such key —
	// the server answers 400 before running anything.
	folds.select = 'verificationLevel, validationStatus';
	seqs.edges.push({ edge: 'folds', child: folds });
	p.edges.push({ edge: 'sequences', child: seqs });
	return [p];
}

export function presetFoldEvidence(): NodeSpec[] {
	const f = newSpec('fold');
	const v = newSpec('validation');
	v.edges.push({ edge: 'reviews', child: newSpec('') });
	f.edges.push({ edge: 'validations', child: v }, { edge: 'assessment', child: newSpec('') });
	return [f];
}

export function presetLineage(): NodeSpec[] {
	const s = newSpec('sequence');
	s.edges.push({ edge: 'protein', child: newSpec('protein') }, { edge: 'parent', child: newSpec('sequence') });
	return [s];
}

export function inputToSpecs(body: unknown): NodeSpec[] | null {
	if (!body || typeof body !== 'object') return null;
	const b = body as Record<string, unknown>;
	const hasRoot = b.root && typeof b.root === 'object';
	const hasRoots = Array.isArray(b.roots) && (b.roots as unknown[]).length > 0;
	if (hasRoot === hasRoots) return null; // exactly one required
	const list = (hasRoot ? [b.root] : (b.roots as unknown[])) as Record<string, unknown>[];
	return list.map((r) => nodeFromQuery(r, String(r.type ?? ''), String(r.id ?? '')));
}

function nodeFromQuery(q: Record<string, unknown>, type: string, id: string): NodeSpec {
	const spec = newSpec(type, id);
	if (typeof q.source === 'string') spec.source = q.source;
	if (typeof q.limit === 'number') spec.limit = String(q.limit);
	if (Array.isArray(q.select)) spec.select = (q.select as unknown[]).map(String).join(', ');
	const expand = q.expand;
	if (expand && typeof expand === 'object') {
		for (const [edge, child] of Object.entries(expand as Record<string, unknown>)) {
			const info = edgeInfo(type, edge);
			const c = (child ?? {}) as Record<string, unknown>;
			spec.edges.push({ edge, child: nodeFromQuery(c, info?.child ?? '', '') });
		}
	}
	return spec;
}
