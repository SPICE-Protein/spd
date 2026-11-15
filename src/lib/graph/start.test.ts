import { describe, expect, it } from 'vitest';
import { mapHref, startFromParams, typeFromPublicId } from './start';

describe('typeFromPublicId', () => {
	it('reads the type out of a public id', () => {
		expect(typeFromPublicId('spd:protein:p1')).toBe('protein');
		expect(typeFromPublicId('spd:cell-line:cvcl_1')).toBe('cell-line');
		expect(typeFromPublicId('spd:gene-region:r1')).toBe('gene-region');
	});

	it('translates the pdb prefix into the wire type', () => {
		expect(typeFromPublicId('spd:pdb:1ubq')).toBe('pdb-entry');
		expect(typeFromPublicId('spd:pdb-entry:1ubq')).toBe('pdb-entry');
	});

	it('refuses anything that is not a typed public id', () => {
		expect(typeFromPublicId('1ubq')).toBeNull();
		expect(typeFromPublicId('spd:')).toBeNull();
		expect(typeFromPublicId('spd:protein:')).toBeNull();
		expect(typeFromPublicId('')).toBeNull();
		expect(typeFromPublicId(null)).toBeNull();
	});
});

describe('startFromParams', () => {
	it('takes type and id when a detail page supplies both', () => {
		const start = startFromParams(
			new URLSearchParams({ type: 'gene', id: 'spd:gene:x', label: 'Brca1' })
		);
		expect(start).toEqual({ type: 'gene', id: 'spd:gene:x', label: 'Brca1', subtitle: null });
	});

	it('derives the type from a pasted root id', () => {
		expect(startFromParams(new URLSearchParams({ root: 'spd:pdb:1ubq' }))).toMatchObject({
			type: 'pdb-entry',
			id: 'spd:pdb:1ubq'
		});
	});

	it('prefers the declared type over the id prefix', () => {
		expect(
			startFromParams(new URLSearchParams({ type: 'protein', id: 'spd:gene:x' }))?.type
		).toBe('protein');
	});

	it('answers null when nothing usable is present', () => {
		expect(startFromParams(new URLSearchParams())).toBeNull();
		expect(startFromParams(new URLSearchParams({ q: 'pam' }))).toBeNull();
		expect(startFromParams(new URLSearchParams({ root: 'pam' }))).toBeNull();
	});
});

describe('mapHref', () => {
	it('round-trips through startFromParams', () => {
		const start = { type: 'pdb-entry', id: 'spd:pdb:1ubq', label: 'Lysozyme' };
		const href = mapHref(start);
		expect(href.startsWith('/map?')).toBe(true);
		expect(startFromParams(new URLSearchParams(href.slice(href.indexOf('?') + 1)))).toEqual({
			...start,
			subtitle: null
		});
	});
});
