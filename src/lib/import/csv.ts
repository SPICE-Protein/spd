/**
 * Client-side CSV/TSV/JSON parsing for the batch import surface.
 *
 * The parser is deliberately small and dependency-free: a pasted row or a
 * downloaded file is untrusted text, and the import page only needs a header
 * list plus records keyed by the trimmed header names. Quoting follows
 * RFC 4180: double quotes wrap a field, `""` is an escaped quote, and quoted
 * fields may contain commas, tabs and newlines. CRLF and lone CR both end a
 * record; entirely blank lines are dropped.
 */

export type ImportFormat = 'auto' | 'csv' | 'tsv' | 'json';

export interface ParsedTable {
	/** Headers after trimming (empty headers become column_N). */
	headers: string[];
	/** One record per non-blank data row, keyed by header. */
	rows: Array<Record<string, string>>;
	/** Field separator for delimited input; empty for JSON. */
	delimiter: string;
	format: 'csv' | 'tsv' | 'json';
}

/** Pick the separator from the header line, ignoring quoted delimiter runs. */
export function detectDelimiter(text: string): string {
	let commas = 0;
	let tabs = 0;
	let semicolons = 0;
	let inQuotes = false;
	let i = 0;

	// Leading blank lines are common in pasted text; the first non-empty line
	// is the header and the only line worth inspecting.
	while (i < text.length && (text[i] === '\r' || text[i] === '\n')) i++;

	for (; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') i++;
				else inQuotes = false;
			}
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
			continue;
		}
		if (ch === '\r' || ch === '\n') break;
		if (ch === ',') commas++;
		else if (ch === '\t') tabs++;
		else if (ch === ';') semicolons++;
	}

	if (tabs > commas && tabs >= semicolons) return '\t';
	if (semicolons > commas && semicolons > tabs) return ';';
	return ',';
}

/** Split delimited text into raw rows/cells. */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;

	while (i < text.length) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			field += ch;
			i++;
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
			i++;
			continue;
		}
		if (ch === delimiter) {
			row.push(field);
			field = '';
			i++;
			continue;
		}
		if (ch === '\r' || ch === '\n') {
			row.push(field);
			field = '';
			rows.push(row);
			row = [];
			i++;
			if (ch === '\r' && text[i] === '\n') i++;
			continue;
		}
		field += ch;
		i++;
	}

	if (inQuotes) throw new Error('Unterminated quoted field');
	if (field !== '' || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

/** Headers get trimmed; blank or duplicate names stay addressable. */
function normalizeHeaders(cells: string[]): string[] {
	const seen = new Map<string, number>();
	return cells.map((cell, index) => {
		const base = cell.replace(/^\uFEFF/, '').trim() || `column_${index + 1}`;
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return count === 0 ? base : `${base}_${count + 1}`;
	});
}

function tableFromRows(raw: string[][], delimiter: string): ParsedTable {
	const rows = raw.filter((cells) => cells.some((cell) => cell.trim() !== ''));
	if (rows.length === 0) {
		return { headers: [], rows: [], delimiter, format: delimiter === '\t' ? 'tsv' : 'csv' };
	}
	const headers = normalizeHeaders(rows[0]);
	const data = rows.slice(1).map((cells) => {
		const record: Record<string, string> = {};
		headers.forEach((header, index) => {
			record[header] = cells[index] ?? '';
		});
		return record;
	});
	return { headers, rows: data, delimiter, format: delimiter === '\t' ? 'tsv' : 'csv' };
}

function jsonCell(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return JSON.stringify(value);
}

/** JSON input: an array of objects, one object per import row. */
export function parseJsonArray(text: string): ParsedTable {
	let data: unknown;
	try {
		data = JSON.parse(text.replace(/^\uFEFF/, ''));
	} catch (e) {
		throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
	}
	if (!Array.isArray(data)) {
		throw new Error('JSON input must be an array of objects');
	}

	const headers: string[] = [];
	const seen = new Set<string>();
	const rows: Array<Record<string, string>> = [];
	data.forEach((item, index) => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			throw new Error(`JSON row ${index + 1} must be an object`);
		}
		const record: Record<string, string> = {};
		for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
			if (!seen.has(key)) {
				seen.add(key);
				headers.push(key);
			}
			record[key] = jsonCell(value);
		}
		rows.push(record);
	});

	// Objects in an array may have different keys; pad the gaps so every row
	// answers the same header list.
	for (const row of rows) {
		for (const header of headers) {
			if (!(header in row)) row[header] = '';
		}
	}
	return { headers, rows, delimiter: '', format: 'json' };
}

/** Parse pasted text or file contents. `auto` sniffs JSON braces and delimiter. */
export function parseImportText(text: string, format: ImportFormat = 'auto'): ParsedTable {
	const trimmed = text.replace(/^\uFEFF/, '').trimStart();
	if (!trimmed) return { headers: [], rows: [], delimiter: '', format: 'csv' };

	const isJson = format === 'json' || (format === 'auto' && /^[[{]/.test(trimmed));
	if (isJson) return parseJsonArray(text);

	const delimiter = format === 'tsv' ? '\t' : format === 'csv' ? ',' : detectDelimiter(text);
	return tableFromRows(parseDelimited(text, delimiter), delimiter);
}

function quoteCell(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialize rows (typically the failed ones) back to a retryable CSV file. */
export function toCsv(headers: string[], rows: Array<Record<string, string>>): string {
	const line = (cells: string[]) => cells.map(quoteCell).join(',');
	return [line(headers), ...rows.map((row) => line(headers.map((h) => row[h] ?? '')))].join('\r\n');
}
