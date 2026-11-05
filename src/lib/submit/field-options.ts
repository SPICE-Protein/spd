import {
	biobricks,
	cellLines,
	enzymeReactions,
	enzymes,
	folds,
	genes,
	mediaRecipes,
	pathways,
	pdbEntries,
	protocols,
	proteins,
	reagents,
	records,
	restrictionEnzymes,
	sequences,
	strains,
	validations
} from '$lib/api/client';
import { correctableFieldKeys } from './correctable-fields';

/**
 * Field candidates for a correction's field-level assertion. A correction
 * names a field of the TARGET record, so once the target is picked we fetch
 * it and offer the keys the server's apply registry actually accepts — with
 * the current value pre-filled, the contributor only types what it should
 * BECOME. Non-correctable projections (relations, upstream trail, derived
 * counts) never enter the picker.
 *
 * "Other field" remains the escape hatch for an unknown entity type or a key
 * the registry has not learned yet: the wire contract only requires a
 * non-empty `field` string, and fetch failures must never block a filing.
 */
export interface TargetFields {
	keys: string[];
	scalars: Record<string, string>;
	/**
	 * The concrete entity type when it was discoverable (passed in, or read
	 * off an api_records row). Filing detail pages use it to link the target
	 * to its real page instead of a bare hex id.
	 */
	entityType?: string;
	/** true while the record fetch is in flight; the picker waits rather than
	 *  presenting an empty list that looks like "nothing is correctable". */
	loading?: boolean;
}

// Bookkeeping columns are never the subject of a scientific correction.
const META_KEYS = new Set([
	'id',
	'entityType',
	'status',
	'createdAt',
	'updatedAt',
	'createdBy',
	'revisionNumber',
	'schemaVersion'
]);

async function fetchRow(entityType: string, id: string): Promise<unknown> {
	switch (entityType) {
		case 'protein':
			return await proteins.get(id);
		case 'sequence':
			return await sequences.get(id);
		case 'fold':
		case 'predicted-fold':
			return await folds.get(id);
		case 'pdb-entry':
			return await pdbEntries.get(id);
		case 'gene':
			return await genes.get(id);
		case 'biobrick':
			return await biobricks.get(id);
		case 'protocol':
			return await protocols.get(id);
		case 'wet-lab-validation':
		case 'validation':
			return await validations.get(id);
		case 'strain':
			return await strains.get(id);
		case 'cell-line':
		case 'cell_line':
			return await cellLines.get(id);
		case 'enzyme':
			return await enzymes.get(id);
		case 'reaction':
			return await enzymeReactions.get(id);
		case 'pathway':
			return await pathways.get(id);
		case 'reagent':
			return await reagents.get(id);
		// A recipe's public id is `spd:recipe:…`; it lives in its own table,
		// not api_records, so the generic record lookup would 400.
		case 'recipe':
		case 'media-recipe':
		case 'media_recipe':
			return await mediaRecipes.get(id);
		// the door files the underscore spelling while public ids and the
		// BE registry use the dash - both must resolve to the same catalog
		case 'restriction-enzyme':
		case 'restriction_enzyme':
			return await restrictionEnzymes.get(id);
		default:
			// anything living in api_records (construct, benchmark, another
			// filing…) — its fields are inside `payload`
			return await records.get(id);
	}
}

export async function fetchTargetFields(
	entityType: string | undefined,
	id: string
): Promise<TargetFields> {
	if (!id) return { keys: [], scalars: {} };
	// Older filings carry only a target id. A `spd:recipe:` prefix is the
	// only type hint they leave, and its public spelling differs from the
	// catalog's entity type.
	const type = entityType || (/^spd:recipe:/.test(id) ? 'media_recipe' : '');
	try {
		let row = (await fetchRow(type, id)) as Record<string, unknown> | null;
		if (!row || typeof row !== 'object') return { keys: [], scalars: {} };
		// api_records rows publish their content under `payload`
		const payload = row.payload;
		if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
			row = payload as Record<string, unknown>;
		}
		// the validations detail endpoint nests the record under `validation`
		const inner = row.validation;
		if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
			row = inner as Record<string, unknown>;
		}
		// Prefer the server's correctable registry: it is the only list the
		// apply gate will accept, and its order is the order the backend
		// validates. Unknown types keep the record's own keys.
		const allowed = correctableFieldKeys(type);
		const keys = allowed ? [...allowed] : Object.keys(row).filter((k) => !META_KEYS.has(k));
		const scalars: Record<string, string> = {};
		for (const k of keys) {
			const v = row[k];
			if (v !== null && typeof v !== 'object') scalars[k] = String(v);
		}
		return { keys, scalars, entityType: type };
	} catch {
		// A candidate list is a courtesy; free typing still files the claim.
		return { keys: [], scalars: {} };
	}
}
