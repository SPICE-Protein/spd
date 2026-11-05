/**
 * Pure helpers for the reference panel — the display side of the same
 * normalization the ledger applies before storing (spd_backend
 * reference/service.rs `normalize_external_id`), so what a contributor sees
 * after a preview equals what the row will carry. DOIs are case-sensitive
 * after the registrant prefix: only known URL/label prefixes come off.
 *
 * Kept side-effect-free and exported so `references.test.ts` can lock the
 * paste formats (the whole point of the panel is that nobody has to know
 * these shapes — a broken normalization would silently duplicate an entry).
 */

export type RefSource = 'doi' | 'pubmed' | 'other';

const DOI_PREFIXES = ['https://doi.org/', 'http://doi.org/', 'https://dx.doi.org/', 'http://dx.doi.org/', 'doi:'];
const PMID_PREFIXES = ['pmid:', 'pmid '];

export function normalizeExternalId(source: RefSource | string, raw: string): string {
	const prefixes = source === 'doi' ? DOI_PREFIXES : source === 'pubmed' ? PMID_PREFIXES : [];
	let t = raw.trim();
	for (;;) {
		const lowered = t.toLowerCase();
		const hit = prefixes.find((p) => lowered.startsWith(p));
		if (!hit) return t;
		// prefixes are ASCII: byte slicing is char-safe and casing survives
		t = t.slice(hit.length).trim();
	}
}

/** The canonical external link, or undefined for a record we cannot link. */
export function linkForReference(ref: { source: string; externalId: string; oaUrl?: string | null }): string | undefined {
	if (ref.source === 'doi') return `https://doi.org/${ref.externalId}`;
	if (ref.source === 'pubmed') return `https://pubmed.ncbi.nlm.nih.gov/${ref.externalId}/`;
	return ref.oaUrl ?? undefined;
}

/** A bare DOI is `10.<registrant>/<suffix>`; used to hint the input, never
 * to block — paste formats are the human part of this flow. */
export function looksLikeReferenceId(source: RefSource | string, raw: string): boolean {
	const id = normalizeExternalId(source, raw);
	if (!id) return false;
	if (source === 'doi') return /^10\.[0-9.]+\/.+/.test(id);
	if (source === 'pubmed') return /^[0-9]+$/.test(id);
	return true;
}
