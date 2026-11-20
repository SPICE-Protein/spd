import type { ReagentExternalReference } from '$lib/api/types';

// The catalogs whose addresses SPD can turn into a record. A reference is
// listed on the reagent page only when it belongs to one of these and carries
// an id; everything else the source names is a table it renders itself, which
// has no address to open and nothing to import.
const IMPORTABLE_SOURCES = new Set(['pdb']);

export function isActionableReference(reference: ReagentExternalReference): boolean {
	return IMPORTABLE_SOURCES.has(reference.source) && !!reference.externalId;
}

export function actionableReferences(
	references: ReagentExternalReference[]
): ReagentExternalReference[] {
	return references.filter(isActionableReference);
}