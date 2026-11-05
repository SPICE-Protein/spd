/**
 * Citation formatting for a public SPD record.
 *
 * These are pure functions so the same record can be cited from a detail page,
 * the Market export or a copy button without a fetch. Dates are supplied by the
 * caller (`accessed`); nothing here reads the clock, which keeps exports
 * reproducible. When no author is known we credit the project as a whole —
 * SPD records are community-curated, and an empty author field would make a
 * bibliography entry look broken.
 */

export const SPD_AUTHORS = 'SPD contributors';

export interface CitationRecord {
	id: string;
	entityType: string;
	name: string;
	url: string;
	accessed?: Date;
	authors?: string;
}

function authorsOf(record: CitationRecord): string {
	const authors = record.authors?.trim();
	return authors || SPD_AUTHORS;
}

/** `YYYY-MM-DD`, or null when no (valid) access date was supplied. */
function accessedOn(record: CitationRecord): string | null {
	if (!record.accessed) return null;
	const date = record.accessed instanceof Date ? record.accessed : new Date(record.accessed);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString().slice(0, 10);
}

/** Footnote / prose form. */
export function citationPlain(record: CitationRecord): string {
	const accessed = accessedOn(record);
	const suffix = accessed ? ` (accessed ${accessed})` : '';
	return `${authorsOf(record)}. ${record.name}. SPD ${record.entityType} ${record.id}. ${record.url}${suffix}.`;
}

/** BibTeX identifier: letters, digits and underscores only. */
function bibKey(id: string): string {
	const clean = id.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
	return `spd_${clean || 'record'}`;
}

/** BibTeX treats braces as grouping; literal braces in values need escaping. */
function escapeBibtex(value: string): string {
	return value.replace(/([{}])/g, '\\$1');
}

export function citationBibtex(record: CitationRecord): string {
	const accessed = accessedOn(record);
	const lines = [
		`@misc{${bibKey(record.id)},`,
		`  author = {${escapeBibtex(authorsOf(record))}},`,
		`  title = {${escapeBibtex(record.name)}},`,
		`  howpublished = {${escapeBibtex(record.url)}},`,
		`  note = {SPD public id: ${escapeBibtex(record.id)}}${accessed ? ',' : ''}`
	];
	// Omitted entirely rather than left empty: a missing access date should not
	// become "today" in a reference the user exports later.
	if (accessed) lines.push(`  urldate = {${accessed}}`);
	lines.push('}');
	return lines.join('\n');
}

export function citationRis(record: CitationRecord): string {
	const accessed = accessedOn(record);
	// RIS has a dedicated gene type; everything else in SPD is research data.
	const type = record.entityType === 'gene' ? 'GEN' : 'DATA';
	const lines = [
		`TY  - ${type}`,
		`TI  - ${record.name}`,
		`AU  - ${authorsOf(record)}`,
		`ID  - ${record.id}`,
		`UR  - ${record.url}`
	];
	if (accessed) lines.push(`Y2  - ${accessed}`);
	lines.push('ER  - ');
	return lines.join('\n');
}
