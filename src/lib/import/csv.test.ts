import { describe, it, expect } from 'vitest';
import { detectDelimiter, parseDelimited, parseImportText, toCsv } from './csv';

describe('CSV quoting', () => {
	it('keeps a quoted comma inside one field', () => {
		const rows = parseDelimited('name,description\n"a,b",c');
		expect(rows).toEqual([
			['name', 'description'],
			['a,b', 'c']
		]);
	});

	it('unescapes doubled quotes', () => {
		const rows = parseDelimited('name,note\n"say ""hi""",ok');
		expect(rows[1]).toEqual(['say "hi"', 'ok']);
	});

	it('keeps embedded newlines inside a quoted field', () => {
		const table = parseImportText('name,note\n"line1\nline2",x');
		expect(table.rows).toEqual([{ name: 'line1\nline2', note: 'x' }]);
	});

	it('rejects an unterminated quoted field', () => {
		expect(() => parseDelimited('name,note\n"open,x')).toThrow(/Unterminated/);
	});
});

describe('line endings and blank lines', () => {
	it('treats CRLF as one record boundary and trims headers', () => {
		const table = parseImportText(' name , partType \r\nreagent,consumable\r\n');
		expect(table.headers).toEqual(['name', 'partType']);
		expect(table.rows).toEqual([{ name: 'reagent', partType: 'consumable' }]);
	});

	it('drops blank lines anywhere in the file', () => {
		const table = parseImportText('a,b\n\n1,2\n   \n3,4\n\n');
		expect(table.rows).toEqual([
			{ a: '1', b: '2' },
			{ a: '3', b: '4' }
		]);
	});
});

describe('delimiter detection', () => {
	it('picks a tab when the header is tab-separated', () => {
		const table = parseImportText('name\tdescription\na\tb');
		expect(table.delimiter).toBe('\t');
		expect(table.format).toBe('tsv');
		expect(table.rows).toEqual([{ name: 'a', description: 'b' }]);
	});

	it('ignores delimiters inside quoted headers', () => {
		expect(detectDelimiter('"name, full"\tvalue')).toBe('\t');
	});
});

describe('JSON array input', () => {
	it('accepts an array of objects and unions their keys', () => {
		const table = parseImportText('[{"name":"x","count":1},{"name":"y","tags":["a","b"]}]');
		expect(table.format).toBe('json');
		expect(table.headers).toEqual(['name', 'count', 'tags']);
		expect(table.rows).toEqual([
			{ name: 'x', count: '1', tags: '' },
			{ name: 'y', count: '', tags: '["a","b"]' }
		]);
	});

	it('rejects a bare object', () => {
		expect(() => parseImportText('{"name":"x"}')).toThrow(/array of objects/);
	});

	it('rejects rows that are not objects', () => {
		expect(() => parseImportText('[{"name":"x"}, 3]')).toThrow(/row 2 must be an object/);
	});
});

describe('toCsv', () => {
	it('quotes commas, quotes and newlines so the file round-trips', () => {
		const headers = ['name', 'note'];
		const rows = [{ name: 'a,b', note: 'say "hi"\nnext' }];
		const csv = toCsv(headers, rows);
		expect(csv).toContain('"a,b"');
		expect(csv).toContain('"say ""hi""\nnext"');
		expect(parseImportText(csv).rows).toEqual(rows);
	});
});
