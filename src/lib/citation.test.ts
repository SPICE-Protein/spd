import { describe, expect, it } from 'vitest';
import { citationBibtex, citationPlain, citationRis, SPD_AUTHORS } from './citation';

const accessed = new Date('2026-11-02T12:00:00Z');

describe('citationPlain', () => {
	it('credits the project when no author is supplied', () => {
		const text = citationPlain({
			id: 'spd_1',
			entityType: 'protein',
			name: 'GFP',
			url: 'https://spd.example/proteins/spd_1',
			accessed
		});

		expect(text).toBe(
			`${SPD_AUTHORS}. GFP. SPD protein spd_1. https://spd.example/proteins/spd_1 (accessed 2026-11-02).`
		);
	});

	it('omits the access date when none was passed', () => {
		const text = citationPlain({
			id: 'spd_2',
			entityType: 'gene',
			name: 'lacZ',
			url: 'https://spd.example/genes/spd_2',
			authors: 'A. Contributor'
		});

		expect(text).toContain('A. Contributor.');
		expect(text).not.toContain('accessed');
	});
});

describe('citationBibtex', () => {
	it('sanitizes the key and escapes braces in values', () => {
		const bib = citationBibtex({
			id: 'x:1',
			entityType: 'protein',
			name: 'A {B} C',
			url: 'https://spd.example/x',
			accessed
		});

		expect(bib).toContain('@misc{spd_x_1,');
		expect(bib).toContain('title = {A \\{B\\} C}');
		expect(bib).toContain('author = {SPD contributors}');
		expect(bib).toContain('note = {SPD public id: x:1},');
		expect(bib).toContain('urldate = {2026-11-02}');
		expect(bib.endsWith('\n}')).toBe(true);
	});

	it('omits urldate when the record has no access date', () => {
		const bib = citationBibtex({
			id: 'x',
			entityType: 'dna',
			name: 'A record',
			url: 'https://spd.example/x'
		});

		expect(bib).not.toContain('urldate');
		expect(bib).toContain('note = {SPD public id: x}\n}');
	});
});

describe('citationRis', () => {
	it('uses the gene type and includes the access date when known', () => {
		const ris = citationRis({
			id: 'g1',
			entityType: 'gene',
			name: 'lacZ',
			url: 'https://spd.example/genes/g1',
			accessed
		});

		expect(ris).toContain('TY  - GEN');
		expect(ris).toContain('TI  - lacZ');
		expect(ris).toContain('ID  - g1');
		expect(ris).toContain('UR  - https://spd.example/genes/g1');
		expect(ris).toContain('Y2  - 2026-11-02');
		expect(ris.endsWith('ER  - ')).toBe(true);
	});

	it('uses DATA for non-gene records and omits Y2 without a date', () => {
		const ris = citationRis({
			id: 'p1',
			entityType: 'protein',
			name: 'GFP',
			url: 'https://spd.example/proteins/p1'
		});

		expect(ris).toContain('TY  - DATA');
		expect(ris).not.toContain('Y2  -');
	});
});
