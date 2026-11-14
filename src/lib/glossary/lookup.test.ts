import { describe, expect, it } from 'vitest';
import { CATEGORIES, GLOSSARY } from './terms';
import { gloss, glossZh, speciesOf } from './lookup';

describe('glossary table', () => {
	it('is complete', () => {
		for (const [term, entry] of Object.entries(GLOSSARY)) {
			expect(term.trim(), term).toBe(term);
			expect(entry.zh.trim(), term).not.toBe('');
			expect(CATEGORIES, term).toContain(entry.category);
		}
	});

	it('never keys two terms apart by case alone', () => {
		// The lookup folds case, so a case-only pair would silently shadow one
		// reading with the other.
		const seen = new Map<string, string>();
		for (const term of Object.keys(GLOSSARY)) {
			const lower = term.toLowerCase();
			expect(seen.get(lower), `${term} vs ${seen.get(lower)}`).toBeUndefined();
			seen.set(lower, term);
		}
	});

	it('uses unique UniProt accessions', () => {
		const ids = Object.values(GLOSSARY)
			.map((e) => e.id)
			.filter((id): id is string => !!id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(/^KW-\d{4}$/);
	});
});

describe('gloss lookup', () => {
	it('reads a keyword', () => {
		expect(glossZh('Cytoplasm')).toBe('细胞质');
		expect(glossZh('Oxidoreductase')).toBe('氧化还原酶');
	});

	it('ignores case and padding', () => {
		expect(glossZh('  x-ray diffraction ')).toBe('X 射线衍射');
	});

	it('finds the species under a strain suffix', () => {
		expect(glossZh('Vibrio vulnificus (strain CMCP6)')).toBe('创伤弧菌');
		expect(glossZh('Oryza sativa subsp. japonica')).toBe('水稻');
		expect(glossZh('Saccharolobus solfataricus (strain ATCC 35092 / DSM 1617)')).toBe('硫磺矿硫化叶菌');
		expect(glossZh('Human adenovirus B serotype 3')).toBe('人腺病毒');
	});

	it('does not invent a reading for an unknown term', () => {
		expect(gloss('not-a-biology-word')).toBeUndefined();
		expect(gloss('')).toBeUndefined();
		expect(gloss(null)).toBeUndefined();
	});

	it('only strips a qualifier when the target is an organism', () => {
		// "Repeat (artificial)" would strip to the keyword "Repeat"; a keyword
		// must never be reached through the species path, or any parenthetical
		// noise would resolve to an unrelated reading.
		expect(gloss('Repeat (artificial)')).toBeUndefined();
	});
});

describe('speciesOf', () => {
	it('keeps a two-word name whole', () => {
		expect(speciesOf('Homo sapiens')).toBe('Homo sapiens');
		expect(speciesOf('Influenza A virus')).toBe('Influenza A virus');
	});
	it('drops strain and subspecies qualifiers', () => {
		expect(speciesOf('Mus musculus (strain X)')).toBe('Mus musculus');
		expect(speciesOf('Oryza sativa subsp. indica')).toBe('Oryza sativa');
	});
});
