/**
 * Entity types the correction pipeline can actually land on.
 *
 * The server owns the same vocabulary (`corrections::apply::correctable`);
 * this copy exists so the UI does not offer a door that the apply gate will
 * always refuse. Keep the two lists in sync — a type may only be added here
 * once its `plan_*` / `replace_*` pair exists on the server.
 *
 * Append-only evidence (gene regions, sequences, folds, validations), the
 * filing wrapper itself, and catalogs whose public id does not match the type
 * vocabulary (recipes, condition templates) stay out.
 */
export const CORRECTABLE_TYPES = [
	'protein',
	'pdb-entry',
	'enzyme',
	'restriction-enzyme',
	'gene',
	'biobrick',
	'strain',
	'reagent',
	'reaction',
	'pathway',
	'cell-line'
] as const;

export type CorrectableType = (typeof CORRECTABLE_TYPES)[number];

const CORRECTABLE: ReadonlySet<string> = new Set(CORRECTABLE_TYPES);

export function isCorrectable(entityType: string | null | undefined): boolean {
	if (!entityType) return false;
	// pages file `cell_line`; public ids and the server registry speak
	// `cell-line`. One normalization keeps both spellings on the same door.
	return CORRECTABLE.has(entityType.replace(/_/g, '-'));
}

/** `spd:gene:abc` → `gene`; ids without the `spd:` prefix are not typed. */
export function entityTypeOfId(publicId: string | null | undefined): string | null {
	if (!publicId || !publicId.startsWith('spd:')) return null;
	const end = publicId.indexOf(':', 4);
	return end > 4 ? publicId.slice(4, end) : null;
}

export function isCorrectableId(publicId: string | null | undefined): boolean {
	return isCorrectable(entityTypeOfId(publicId));
}
