/**
 * Conservative whitelist of catalog kinds for /submit/import.
 *
 * Every kind here has a create client in `$lib/api/client.ts` whose body is a
 * flat object of scalars (plus `template`, which is JSON by contract). The
 * import page never invents a field: columns below are exactly the client's
 * documented body keys. Kinds with opaque, wrapped or deeply nested create
 * bodies (vectors, cassettes) are intentionally excluded.
 */
import { biobricks, conditionTemplates, mediaRecipes, reagents, strains } from '$lib/api/client';

export type ImportValueKind = 'string' | 'number' | 'json';

export interface ImportColumn {
	/** Wire key the create client expects. */
	key: string;
	required?: boolean;
	kind?: ImportValueKind;
}

export interface ImportKind {
	id: string;
	labelKey: string;
	route: string;
	/** wire entity type, used to keep imports out of "my submissions" */
	entityType: string;
	columns: ImportColumn[];
	/** optional explanatory line shown under the kind picker */
	noteKey?: string;
	create: (body: Record<string, unknown>) => Promise<unknown>;
}

export interface ExcludedKind {
	id: string;
	reasonKey: string;
}

export const IMPORT_KINDS: ImportKind[] = [
	{
		id: 'biobricks',
		labelKey: 'browse_biobricks',
		route: 'biobricks',
		entityType: 'biobrick',
		columns: [
			{ key: 'name', required: true },
			{ key: 'partType', required: true },
			{ key: 'sequence', required: true },
			{ key: 'description' }
		],
		create: (body) => biobricks.create({ ...body, origin: 'batch-import' } as never)
	},
	{
		id: 'reagents',
		labelKey: 'browse_reagents',
		route: 'reagents',
		entityType: 'reagent',
		columns: [
			{ key: 'name', required: true },
			{ key: 'reagentType', required: true },
			{ key: 'catalogIdentifier' },
			{ key: 'description' }
		],
		create: (body) => reagents.create({ ...body, origin: 'batch-import' } as never)
	},
	{
		id: 'strains',
		labelKey: 'browse_strains',
		route: 'strains',
		entityType: 'strain',
		columns: [
			{ key: 'name', required: true },
			{ key: 'species' },
			{ key: 'genotype' },
			{ key: 'background' }
		],
		create: (body) => strains.create({ ...body, origin: 'batch-import' } as never)
	},
	{
		id: 'mediaRecipes',
		labelKey: 'browse_media_recipes',
		route: 'media-recipes',
		entityType: 'media_recipe',
		columns: [
			{ key: 'name', required: true },
			{ key: 'category', required: true },
			{ key: 'ph', kind: 'number' },
			{ key: 'notes' }
		],
		create: (body) => mediaRecipes.create({ ...body, origin: 'batch-import' } as never)
	},
	{
		id: 'conditionTemplates',
		labelKey: 'browse_condition_templates',
		route: 'condition-templates',
		entityType: 'condition_template',
		columns: [
			{ key: 'name', required: true },
			{ key: 'kind', required: true },
			{ key: 'template', required: true, kind: 'json' },
			{ key: 'description' }
		],
		noteKey: 'import_template_json_hint',
		create: (body) => conditionTemplates.create({ ...body, origin: 'batch-import' } as never)
	}
];

export const IMPORT_EXCLUDED: ExcludedKind[] = [
	{ id: 'vectors', reasonKey: 'import_excluded_vectors' },
	{ id: 'cassettes', reasonKey: 'import_excluded_cassettes' }
];

export function importKindById(id: string): ImportKind | undefined {
	return IMPORT_KINDS.find((kind) => kind.id === id);
}

export interface ResolvedColumns {
	/** Whitelist columns present in this file, in whitelist order. */
	present: ImportColumn[];
	/** canonical key → actual (trimmed) file header */
	byKey: Record<string, string>;
	/** required whitelist columns the file does not carry */
	missing: string[];
	/** file headers the whitelist does not consume */
	ignored: string[];
}

/** Match headers case-insensitively so `Name` works without inventing aliases. */
export function resolveColumns(kind: ImportKind, headers: string[]): ResolvedColumns {
	const present: ImportColumn[] = [];
	const byKey: Record<string, string> = {};
	const missing: string[] = [];
	const used = new Set<string>();
	const normalized = headers.map((header) => ({ header, key: header.trim().toLowerCase() }));

	for (const column of kind.columns) {
		const found = normalized.find((entry) => entry.key === column.key.toLowerCase());
		if (found) {
			byKey[column.key] = found.header;
			present.push(column);
			used.add(found.header);
		} else if (column.required) {
			missing.push(column.key);
		}
	}
	const ignored = headers.filter((header) => header !== '' && !used.has(header));
	return { present, byKey, missing, ignored };
}

export interface BuiltRow {
	body?: Record<string, unknown>;
	error?: string;
}

/** Turn one parsed row into the exact body its create client documents. */
export function rowToBody(
	kind: ImportKind,
	row: Record<string, string>,
	byKey: Record<string, string>
): BuiltRow {
	const body: Record<string, unknown> = {};
	const missing: string[] = [];

	for (const column of kind.columns) {
		const header = byKey[column.key];
		const raw = header ? (row[header] ?? '') : '';
		const value = raw.trim();
		if (value === '') {
			if (column.required) missing.push(column.key);
			continue;
		}
		if (column.kind === 'number') {
			const n = Number(value);
			if (!Number.isFinite(n)) return { error: `${column.key}: "${raw}" is not a number` };
			body[column.key] = n;
		} else if (column.kind === 'json') {
			try {
				body[column.key] = JSON.parse(value);
			} catch {
				return { error: `${column.key}: invalid JSON` };
			}
		} else {
			body[column.key] = value;
		}
	}

	if (missing.length > 0) return { error: `Missing required: ${missing.join(', ')}` };
	return { body };
}

/** Create receipts vary per module; find the first id/publicId at any object depth. */
export function extractReceiptId(receipt: unknown): string {
	if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return '';
	const obj = receipt as Record<string, unknown>;
	for (const key of ['id', 'publicId', 'recordId']) {
		const value = obj[key];
		if (typeof value === 'string' && value) return value;
		if (typeof value === 'number') return String(value);
	}
	for (const value of Object.values(obj)) {
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const nested = extractReceiptId(value);
			if (nested) return nested;
		}
	}
	return '';
}
