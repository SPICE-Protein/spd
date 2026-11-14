/**
 * Bioscience term glosses — Chinese-only annotations for values that arrive
 * from upstream catalogs (UniProt keywords, PDB methods, organism names,
 * relation verbs, licenses).
 *
 * Two rules make this layer safe:
 *
 * 1. A gloss never replaces the wire value. The English term stays on screen
 *    and the gloss rides alongside it (hover text, or an inline 中文注释 the
 *    reader can turn off). A missing or imperfect gloss therefore costs a
 *    reader a hint, not a wrong record.
 * 2. Glosses are not searchable. Searching "氧化还原酶" does not find
 *    `oxidoreductase` rows — that would need a synonym index on the backend,
 *    which is a different feature with a different failure mode (a bad
 *    synonym hides real results). This file only answers "what does this
 *    word mean".
 *
 * `curated.json` holds the entries reviewed for the terms this product shows.
 * It always beats the generated dictionary in `static/glossary/zh.json`
 * (`tools/glossary/build.mjs`), because dictionary sources are broad but
 * sometimes stale or sense-mismatched — see the builder for what was tried
 * and rejected.
 */
import curated from './curated.json';

export type TermCategory =
	| 'keyword'
	| 'method'
	| 'organism'
	| 'relation'
	| 'license'
	| 'chemistry';

export interface TermGloss {
	/** The Chinese reading of the term. Short by design — it is a gloss, not a sentence. */
	zh: string;
	category: TermCategory;
	/** UniProt keyword accession, where the term is one (KW-0002, …). */
	id?: string;
	/** A clarification for terms that are commonly misread. */
	note?: string;
}

export const GLOSSARY = curated as Record<string, TermGloss>;

export const CATEGORIES: TermCategory[] = [
	'keyword',
	'method',
	'organism',
	'relation',
	'license',
	'chemistry'
];
