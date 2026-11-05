import { describe, it, expect } from 'vitest';
import { validateFields, buildSafe, buildBody } from './components/form-values';
import type { FormField } from './components/form';

// The inline-error channel is what turns "one banner sentence" into a form that
// points at the offending box. These lock the rules FormFields renders.
const FIELDS: FormField[] = [
	{ name: 'preferredName', required: true },
	{ name: 'taxId', kind: 'number' },
	{ name: 'tags', kind: 'list' },
	{ name: 'refs', kind: 'json' },
	{ name: 'counts', kind: 'intList' },
	{ name: 'consent', kind: 'checkbox', required: true }
];

describe('validateFields', () => {
	it('names an untouched required field and nothing else', () => {
		const e = validateFields({}, FIELDS);
		expect(Object.keys(e)).toEqual(['preferredName']);
	});

	it('never flags a required checkbox by emptiness', () => {
		// consent is stored as the string 'false'; the box itself is the answer
		const e = validateFields({ preferredName: 'X', consent: 'false' }, FIELDS);
		expect(e.preferredName).toBeUndefined();
		expect(e.consent).toBeUndefined();
	});

	it('catches a non-numeric number and a broken JSON block', () => {
		const e = validateFields({ preferredName: 'X', taxId: 'abc', refs: '{oops' }, FIELDS);
		expect(Object.keys(e).sort()).toEqual(['refs', 'taxId']);
	});

	it('accepts numeric strings and rejects fractional members of intList', () => {
		expect(validateFields({ preferredName: 'X', counts: '1, 2, 3' }, FIELDS)).toEqual({});
		expect(validateFields({ preferredName: 'X', counts: '1, 2.5' }, FIELDS).counts).toBeTruthy();
	});

	it('stays quiet on optional fields the contributor left alone', () => {
		expect(validateFields({ preferredName: 'X' }, FIELDS)).toEqual({});
	});
});

describe('buildSafe', () => {
	it('refuses a form with problems and reports the first one with its label', () => {
		const r = buildSafe({ taxId: 'nope' }, FIELDS);
		expect(r.body).toBeUndefined();
		expect(r.error).toBeTruthy();
		expect(Object.keys(r.errors)).toContain('preferredName');
	});

	it('builds a typed body when the form is clean', () => {
		const r = buildSafe({ preferredName: ' Albumin ', taxId: '9606', tags: 'a, b', refs: '{"x":1}', counts: '1,2' }, FIELDS);
		expect(r.error).toBeUndefined();
		expect(r.body).toMatchObject({ preferredName: 'Albumin', taxId: 9606, tags: ['a', 'b'], refs: { x: 1 }, counts: [1, 2] });
	});
});

describe('buildBody', () => {
	it('survives a numeric input that wrote a number back into string state', () => {
		// `<input type="number" bind:value>` stores a NUMBER; the String() guard in
		// buildBody is what keeps every form with a numeric field from crashing.
		const values = { preferredName: 'X', taxId: 9606 } as unknown as Record<string, string>;
		expect(buildBody(values, FIELDS).taxId).toBe(9606);
	});
});

describe('organism and upload-picker fields', () => {
	const ORG: FormField[] = [
		{ name: 'organism_taxId', kind: 'organism', companion: 'organism_scientificName' },
		{ name: 'taxon_id', kind: 'organism' },
		{ name: 'artifactIds', kind: 'multiPick' },
		{ name: 'coordinates_artifact_id', kind: 'artifactPick' }
	];

	it('paired organism emits a number for the taxId and the name as typed', () => {
		const b = buildBody({ organism_taxId: '9606', organism_scientificName: 'Homo sapiens' }, ORG);
		expect(b.organism_taxId).toBe(9606);
		expect(b.organism_scientificName).toBe('Homo sapiens');
	});

	it('keeps a name-only organism (the behavior the two flat fields had)', () => {
		const b = buildBody({ organism_scientificName: 'Mus musculus' }, ORG);
		expect(b.organism_taxId).toBeNull();
		expect(b.organism_scientificName).toBe('Mus musculus');
	});

	it('id-only organism never leaks its throwaway name into the body', () => {
		const b = buildBody({ taxon_id: '562', __organismName_taxon_id: 'Escherichia coli' }, ORG);
		expect(b.taxon_id).toBe(562);
		expect(b.__organismName_taxon_id).toBeUndefined();
	});

	it('rejects a taxId that is not digits instead of silently shipping null', () => {
		expect(validateFields({ organism_taxId: 'abc' }, ORG).organism_taxId).toBeTruthy();
	});

	it('multiPick splits comma-joined picks; artifactPick stays one id', () => {
		const b = buildBody({ artifactIds: 'artifact:a:1, artifact:b:2', coordinates_artifact_id: 'artifact:c:3' }, ORG);
		expect(b.artifactIds).toEqual(['artifact:a:1', 'artifact:b:2']);
		expect(b.coordinates_artifact_id).toBe('artifact:c:3');
	});
});

// fieldPatch is the correction's field-level assertion editor: rows of
// {field, proposed, current?, note?} serialized as a JSON string by
// CorrectionItems. These lock the same contract filings::validate_filing
// enforces server-side.
const PATCH: FormField[] = [
	{ name: 'targetId', required: true, picker: '*' },
	{ name: 'reason', kind: 'textarea', required: true },
	{ name: 'items', kind: 'fieldPatch', required: true, itemsOf: 'targetId' }
];

describe('fieldPatch (field-level corrections)', () => {
	it('accepts canonical rows and keeps proposed:null (propose-empty)', () => {
		const raw = JSON.stringify([
			{ field: 'geneName', current: 'LYZ', proposed: 'lyz1', note: 'per UniProt' },
			{ field: 'organismTaxId', proposed: null }
		]);
		expect(validateFields({ targetId: 'p1', reason: 'r', items: raw }, PATCH).items).toBeUndefined();
		const b = buildBody({ targetId: 'p1', reason: 'r', items: raw }, PATCH);
		expect(b.items).toEqual([
			{ field: 'geneName', current: 'LYZ', proposed: 'lyz1', note: 'per UniProt' },
			{ field: 'organismTaxId', proposed: null }
		]);
	});

	it('rejects an empty row list, a nameless row and a row without proposed', () => {
		const bad = [
			'[]',
			JSON.stringify([{ proposed: 'x' }]),
			JSON.stringify([{ field: 'f' }]),
			'{oops'
		];
		for (const raw of bad) {
			expect(validateFields({ targetId: 'p', reason: 'r', items: raw }, PATCH).items).toBeTruthy();
		}
	});

	it('drops rows with a blank field name at build time (programmatic seeds)', () => {
		const raw = JSON.stringify([{ field: '  ', proposed: 1 }, { field: 'geneName', proposed: 'x' }]);
		const b = buildBody({ targetId: 'p', reason: 'r', items: raw }, PATCH);
		expect(b.items).toEqual([{ field: 'geneName', proposed: 'x' }]);
	});

	it('a required fieldPatch with no rows reports the required error, not json', () => {
		const e = validateFields({ targetId: 'p', reason: 'r' }, PATCH);
		expect(e.items).toBeTruthy();
	});
});
