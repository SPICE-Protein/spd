import { describe, expect, it } from 'vitest';
import {
	EDGES,
	presetFoldEvidence,
	presetLineage,
	presetProtein,
	specHeight,
	type NodeSpec
} from './registry';

function walk(spec: NodeSpec, visit: (node: NodeSpec) => void) {
	visit(spec);
	for (const edge of spec.edges) walk(edge.child, visit);
}

describe('graph presets', () => {
	it('stay inside the standard tier depth', () => {
		for (const make of [presetProtein, presetFoldEvidence, presetLineage]) {
			expect(specHeight(make()[0])).toBeLessThanOrEqual(3);
		}
	});

	it('only expand edges the backend registry knows', () => {
		for (const make of [presetProtein, presetFoldEvidence, presetLineage]) {
			walk(make()[0], (node) => {
				for (const edge of node.edges) {
					expect(EDGES[node.type]?.some((e) => e.edge === edge.edge)).toBe(true);
				}
			});
		}
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
