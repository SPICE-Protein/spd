/**
 * Turning whatever the reader typed into a node the map can open.
 *
 * A public id names its own type (`spd:protein:…`), except for the one
 * disagreement between the id vocabulary and the relation vocabulary: the PDB
 * catalog publishes `spd:pdb:1abc` while every API route calls that type
 * `pdb-entry`. Keep that alias in one place so a pasted id from anywhere in
 * the UI starts a walk instead of answering 400.
 */

/** Public-id segments whose wire type differs from the segment itself. */
const SEGMENT_TYPE: Record<string, string> = {
	pdb: 'pdb-entry'
};

/** `spd:pdb:1abc` → `pdb-entry`; anything that is not a typed public id → null. */
export function typeFromPublicId(publicId: string | null | undefined): string | null {
	if (!publicId || !publicId.startsWith('spd:')) return null;
	const end = publicId.indexOf(':', 4);
	if (end <= 4 || end === publicId.length - 1) return null;
	const segment = publicId.slice(4, end);
	return SEGMENT_TYPE[segment] ?? segment;
}

export interface MapStart {
	type: string;
	id: string;
	label?: string | null;
	subtitle?: string | null;
}

/**
 * Read the map's own query string. `?type=gene&id=spd:gene:x` is what a detail
 * page links with (it already knows both halves); `?root=spd:gene:x` is the
 * short form a person can paste, and works whenever the id names its type.
 */
export function startFromParams(params: URLSearchParams): MapStart | null {
	const id = params.get('id')?.trim();
	const declared = params.get('type')?.trim();
	if (id) {
		const type = declared || typeFromPublicId(id);
		if (type) return { type, id, label: params.get('label'), subtitle: null };
	}
	const root = params.get('root')?.trim();
	if (root) {
		const type = typeFromPublicId(root);
		if (type) return { type, id: root, label: params.get('label'), subtitle: null };
	}
	return null;
}

/** The inverse: the query string a detail page links to the map with. */
export function mapHref(start: MapStart): string {
	const params = new URLSearchParams({ type: start.type, id: start.id });
	if (start.label) params.set('label', start.label);
	return `/map?${params.toString()}`;
}
