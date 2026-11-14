import { describe, expect, it } from 'vitest';
import {
	EDGES,
	NODE_TYPES,
	newSpec,
	presetFoldEvidence,
	presetLineage,
	presetMetabolism,
	presetProtein,
	specHeight,
	specShape,
	type NodeSpec
} from './registry';

function walk(spec: NodeSpec, visit: (node: NodeSpec) => void) {
	visit(spec);
	for (const edge of spec.edges) walk(edge.child, visit);
}

describe('graph presets', () => {
	it('stay inside the standard tier depth', () => {
		for (const make of [presetProtein, presetFoldEvidence, presetLineage, presetMetabolism]) {
			expect(specHeight(make()[0])).toBeLessThanOrEqual(3);
		}
	});

	it('only expand edges the backend registry knows', () => {
		for (const make of [presetProtein, presetFoldEvidence, presetLineage, presetMetabolism]) {
			walk(make()[0], (node) => {
				for (const edge of node.edges) {
					expect(EDGES[node.type]?.some((e) => e.edge === edge.edge)).toBe(true);
				}
			});
		}
	});

	it('reads the whole tree in one line', () => {
		// The editor shows a form per node, so a three-level tree otherwise
		// reads as three unrelated panels.
		expect(specShape(presetProtein()[0])).toBe('protein → sequences → folds');
		expect(specShape(presetFoldEvidence()[0])).toBe('fold → validations → reviews + assessment');
	});

	it('marks an external source on the root', () => {
		const spec = newSpec('protein', 'P12345');
		spec.source = 'uniprot';
		expect(specShape(spec)).toBe('protein[uniprot]');
	});

	it('does not select fold fields the projection does not expose', () => {
		// `confidence` was the historical mistake: the fold node answers 400
		// with "unknown field confidence", which made the default preset fail
		// before it ran.
		const fields = presetProtein()[0].edges[0].child.edges[0].child.select;
		expect(fields).not.toContain('confidence');
		expect(fields).toContain('verificationLevel');
	});
});

describe('gene as a node', () => {
	it('reaches the proteins its CDS regions declare', () => {
		expect(EDGES.gene).toContainEqual({ edge: 'proteins', child: 'protein', many: true });
	});

	it('is an offerable root type', () => {
		expect(NODE_TYPES).toContain('gene');
	});
});

describe('relations value edge', () => {
	it('is on every node type as an embedded list', () => {
		for (const type of NODE_TYPES) {
			const relations = EDGES[type]?.filter((e) => e.edge === 'relations');
			expect(relations, type).toEqual([{ edge: 'relations', child: null, many: true }]);
		}
	});
});

describe('catalog nodes', () => {
	it('mirror the pathway ↔ reaction walk exactly', () => {
		expect(EDGES.pathway).toEqual([
			{ edge: 'reactions', child: 'reaction', many: true },
			{ edge: 'relations', child: null, many: true }
		]);
		expect(EDGES.reaction).toEqual([
			{ edge: 'pathways', child: 'pathway', many: true },
			{ edge: 'relations', child: null, many: true }
		]);
	});

	it('give the other catalog entities no walkable edges', () => {
		for (const type of ['enzyme', 'restriction-enzyme', 'biobrick', 'vector', 'reagent', 'cell-line', 'strain']) {
			expect(EDGES[type]?.filter((e) => e.edge !== 'relations'), type).toEqual([]);
		}
	});

	it('only ever points at registered child types', () => {
		// Mirror of the backend invariant: an unknown child would make the
		// builder offer an expansion the server answers 400 to.
		for (const type of NODE_TYPES) {
			for (const edge of EDGES[type]) {
				if (edge.child === null) continue;
				expect(NODE_TYPES, `${type}.${edge.edge}`).toContain(edge.child);
			}
		}
	});

	it('roots the metabolism preset at a pathway → reactions tree', () => {
		const roots = presetMetabolism();
		expect(roots[0].type).toBe('pathway');
		expect(roots[0].edges).toEqual([{ edge: 'reactions', child: expect.objectContaining({ type: 'reaction' }) }]);
	});
});
