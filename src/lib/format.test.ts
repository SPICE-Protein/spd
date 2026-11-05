import { describe, it, expect } from 'vitest';
import { displayRecordName, entityHref } from './format';

describe('displayRecordName', () => {
	it('prefers the asserted symbol over the stored import label', () => {
		expect(displayRecordName('TP53 (NM_000546.6)', 'TP53')).toBe('TP53');
		expect(displayRecordName('Brca1 (NM_009764.3)', 'Brca1')).toBe('Brca1');
	});

	it('strips the accession or CID suffix an older importer generated', () => {
		expect(displayRecordName('TP53 (NM_000546.6)')).toBe('TP53');
		expect(displayRecordName('Aspirin (CID 2244)')).toBe('Aspirin');
	});

	it('leaves contributor-written parentheses and source labels alone', () => {
		expect(displayRecordName('Kinase (active)')).toBe('Kinase (active)');
		expect(displayRecordName('PubChem compound')).toBe('PubChem compound');
		expect(displayRecordName('')).toBe('');
	});
});

describe('entityHref', () => {
	it('routes the API wire names used by stats and feeds', () => {
		// Trending reports enzyme reactions as `enzyme_reaction`; without this
		// mapping a click fell through to /records/{id}.
		expect(entityHref('enzyme_reaction', 'spd:reaction:x')).toBe('/reactions/spd:reaction:x');
		expect(entityHref('wet_lab_validation', 'v1')).toBe('/validations/v1');
		expect(entityHref('cell-line', 'c1')).toBe('/cell-lines/c1');
	});
});
