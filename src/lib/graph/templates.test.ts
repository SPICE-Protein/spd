import { describe, expect, it } from 'vitest';
import { QUERY_TEMPLATES, templateShape } from './templates';
import {
	EDGES,
	inputToSpecs,
	specHeight,
	specsToInput,
	trimToDepth,
	type NodeSpec
} from './registry';

function walk(spec: NodeSpec, visit: (node: NodeSpec) => void) {
	visit(spec);
	for (const edge of spec.edges) walk(edge.child, visit);
}

describe('query templates', () => {
	it('have unique ids and build at least one root', () => {
		const ids = QUERY_TEMPLATES.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const template of QUERY_TEMPLATES) {
			expect(template.id).not.toBe('');
			expect(template.build().length).toBeGreaterThan(0);
		}
	});

	it('stay inside the standard tier depth', () => {
		for (const template of QUERY_TEMPLATES) {
			for (const root of template.build()) {
				expect(specHeight(root), template.id).toBeLessThanOrEqual(3);
			}
		}
	});

	it('only expand registered edges with the registered child type', () => {
		for (const template of QUERY_TEMPLATES) {
			for (const root of template.build()) {
				walk(root, (node) => {
					for (const edge of node.edges) {
						const info = EDGES[node.type]?.find((e) => e.edge === edge.edge);
						expect(info, `${template.id}: ${node.type}.${edge.edge}`).toBeDefined();
						if (info?.child) {
							expect(edge.child.type, `${template.id}: ${edge.edge}`).toBe(info.child);
						} else {
							expect(edge.child.type, `${template.id}: ${edge.edge}`).toBe('');
						}
					}
				});
			}
		}
	});

	it('round-trips through the wire shape', () => {
		for (const template of QUERY_TEMPLATES) {
			const roots = template.build();
			const back = inputToSpecs(specsToInput(roots));
			expect(back, template.id).not.toBeNull();
			expect(back?.length, template.id).toBe(roots.length);
			expect(
				back?.map((r) => r.type),
				template.id
			).toEqual(roots.map((r) => r.type));
		}
	});

	it('keeps an external source on the root', () => {
		const uniprot = QUERY_TEMPLATES.find((t) => t.id === 'uniprot_root')!;
		const back = inputToSpecs(specsToInput(uniprot.build()));
		expect(back?.[0].source).toBe('uniprot');
	});

	it('trims expansions past a lower tier depth without mutating the template', () => {
		const roots = QUERY_TEMPLATES.find((t) => t.id === 'protein_structure')!.build();
		const trimmed = roots.map((root) => trimToDepth(root, 2));
		expect(specHeight(trimmed[0])).toBe(2);
		expect(trimmed[0].edges.map((e) => e.edge)).toEqual(['sequences']);
		expect(trimmed[0].edges[0].child.edges).toEqual([]);
		expect(specHeight(roots[0])).toBe(3);
	});

	it('renders a readable one-line shape', () => {
		for (const template of QUERY_TEMPLATES) {
			expect(templateShape(template.build()), template.id).toContain('→');
		}
		expect(templateShape(QUERY_TEMPLATES.find((t) => t.id === 'protein_structure')!.build())).toBe(
			'protein → sequences → folds'
		);
	});
});
