/**
 * Rendering rules for the standalone printable record.
 *
 * The print view is a reader-facing document, not a debugger. It keeps the
 * fields a detail page actually shows and drops internal bookkeeping columns
 * (source blobs, hashes, audit ids) that would turn a textbook page back into
 * a JSON dump.
 */
import { fieldLabel, tr } from '$lib/i18n';
import { fmtTime } from '$lib/format';

/** Wire keys that never belong in a printed record. */
const HIDDEN = new Set([
	'id',
	'publicId',
	'createdAt',
	'updatedAt',
	'createdBy',
	'updatedBy',
	'addedBy',
	'editedBy',
	'metadata',
	'entryMetadata',
	'runtimeMetadata',
	'provenance',
	'prediction',
	'derivedMetrics',
	'normalizedSequence',
	'foldIdentityHash',
	'sequenceSha256',
	'environmentSha256',
	'modelIdentitySha256',
	'sha256',
	'artifactIds',
	'externalReferences',
	'sequenceId'
]);

/** Opening prose sits under the title, before the fact table. */
const LEAD_KEYS = new Set(['description', 'definition', 'abstract', 'summary']);

/** Longer evidence prose gets its own section after the facts. */
const PROSE_KEYS = new Set([
	'comment',
	'notes',
	'note',
	'interpretation',
	'reason',
	'body',
	'bodyMarkdown',
	'protocolBody',
	'equation'
]);

/** Sequence values are technical strings but still belong in the document. */
const SEQUENCE_KEYS = new Set(['sequence', 'dnaSequence', 'rnaSequence', 'normalizedSequence']);

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function asRecord(value: unknown): UnknownRecord | null {
	return isRecord(value) ? value : null;
}

export function asRows(value: unknown): UnknownRecord[] {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function hiddenKey(key: string): boolean {
	return HIDDEN.has(key);
}

export function labelForKey(key: string): string {
	if (key === 'payload') return tr('common_details');
	if (key === 'suppliers') return tr('supplier_title');
	if (key === 'externalReferences') return tr('extid_title');
	return fieldLabel(key);
}

export function isSequenceKey(key: string): boolean {
	return SEQUENCE_KEYS.has(key);
}

export function isLeadKey(key: string, value: unknown): boolean {
	return typeof value === 'string' && LEAD_KEYS.has(key);
}

export function isSectionProse(key: string, value: unknown): boolean {
	if (typeof value !== 'string') return false;
	return PROSE_KEYS.has(key) || value.length > 160;
}

/** One-line, human-readable rendering of any JSON value. */
export function displayValue(value: unknown, key = '', depth = 0): string {
	if (value === null || value === undefined || value === '') return '—';
	if (typeof value === 'boolean') return value ? tr('common_yes') : tr('common_no');
	if (typeof value === 'number') {
		if (key.endsWith('At') && value > 100_000_000) return fmtTime(value, true);
		return String(value);
	}
	if (typeof value === 'string') {
		const text = value.trim();
		if (!text) return '—';
		return text;
	}
	if (Array.isArray(value)) {
		if (value.length === 0) return '—';
		const simple = value.every(
			(v) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
		);
		if (simple) return value.map((v) => displayValue(v, '', depth + 1)).join(' · ');
		return value
			.map((v) => displayValue(v, '', depth + 1))
			.filter((s) => s !== '—')
			.join('; ');
	}
	if (isRecord(value)) {
		if (value.value !== undefined && value.unit !== undefined) {
			return `${displayValue(value.value, 'value', depth + 1)} ${String(value.unit)}`;
		}
		if (depth >= 2) return Object.keys(value).length ? `${Object.keys(value).length} fields` : '—';
		return Object.entries(value)
			.filter(([k, v]) => !hiddenKey(k) && v !== null && v !== undefined && v !== '')
			.map(([k, v]) => `${labelForKey(k)}: ${displayValue(v, k, depth + 1)}`)
			.join('; ');
	}
	return String(value);
}

export interface LeadField {
	key: string;
	text: string;
}

export interface FactField {
	key: string;
	value: unknown;
}

export interface BlockField {
	key: string;
	value: unknown;
}

export interface RecordParts {
	lead: LeadField[];
	prose: LeadField[];
	facts: FactField[];
	blocks: BlockField[];
}

/**
 * Split the top level of a record into the three shapes a printed article
 * needs: running prose, a key/fact table, and structured evidence blocks.
 */
export function recordParts(record: UnknownRecord): RecordParts {
	const lead: LeadField[] = [];
	const prose: LeadField[] = [];
	const facts: FactField[] = [];
	const blocks: BlockField[] = [];
	const seenProse = new Set<string>();

	for (const [key, value] of Object.entries(record)) {
		if (hiddenKey(key) || value === null || value === undefined || value === '') continue;
		// Sequences are printed as viewer-rendered images, never as raw text.
		if (isSequenceKey(key)) continue;
		if (isLeadKey(key, value)) {
			const text = String(value).trim();
			if (text && !seenProse.has(text)) {
				seenProse.add(text);
				lead.push({ key, text });
			}
		} else if (isSectionProse(key, value)) {
			const text = String(value).trim();
			if (text && !seenProse.has(text)) {
				seenProse.add(text);
				prose.push({ key, text });
			}
		} else if (typeof value === 'object') {
			if (Array.isArray(value) && value.length === 0) continue;
			if (!Array.isArray(value) && Object.keys(value).length === 0) continue;
			blocks.push({ key, value });
		} else {
			facts.push({ key, value });
		}
	}

	return { lead, prose, facts, blocks };
}

/** Union of columns, preserving first-seen order and removing internals. */
export function columnKeys(rows: UnknownRecord[]): string[] {
	const seen = new Set<string>();
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (!hiddenKey(key)) seen.add(key);
		}
	}
	return [...seen];
}

export function visibleEntries(record: UnknownRecord): Array<[string, unknown]> {
	return Object.entries(record).filter(
		([key, value]) => !hiddenKey(key) && value !== null && value !== undefined && value !== ''
	);
}

export function titleOf(record: UnknownRecord, fallback: string): string {
	const keys = [
		'preferredName',
		'name',
		'title',
		'fullName',
		'displayName',
		'pdbId',
		'headline',
		'label',
		'symbol',
		'geneName',
		'id'
	];
	for (const key of keys) {
		const value = record[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	for (const nestedKey of ['payload', 'organization']) {
		const nested = asRecord(record[nestedKey]);
		if (!nested) continue;
		for (const key of keys) {
			const value = nested[key];
			if (typeof value === 'string' && value.trim()) return value.trim();
		}
	}
	return fallback;
}

export function publicIdOf(record: UnknownRecord, fallback: string): string {
	for (const key of ['publicId', 'id']) {
		const value = record[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	for (const nestedKey of ['payload', 'organization']) {
		const nested = asRecord(record[nestedKey]);
		if (!nested) continue;
		for (const key of ['publicId', 'id']) {
			const value = nested[key];
			if (typeof value === 'string' && value.trim()) return value.trim();
		}
	}
	return fallback;
}
