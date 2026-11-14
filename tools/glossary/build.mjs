#!/usr/bin/env node
/**
 * Build the shipped term dictionary: `static/glossary/zh.json`.
 *
 * Sources, in precedence order:
 *
 * 1. `src/lib/glossary/curated.json` — reviewed by hand for the terms this
 *    product actually shows. Always wins; a dictionary hit never overwrites one.
 * 2. `build/glossary-src/wikidata.json` — Chinese labels fetched by
 *    `fetch_wikidata.py` (CC0). Gated hard: the English label Wikidata matched
 *    must be the term we asked for, otherwise a search like "Adaptive immunity"
 *    would ship "adaptive immune system" as if it were the same concept.
 *
 * Wikidata returns traditional Chinese for many items; OpenCC converts to
 * simplified so a gloss never looks foreign next to the rest of the zh UI.
 *
 * Why not NAER (樂詞網)? Its eight biology subjects were tried and rejected:
 * 136k keys, but the terminology is decades old (hexokinase → 六碳糖激化酶)
 * and modern molecular biology is absent (helicase/topoisomerase/primosome
 * have no entry at all). A stale gloss is worse than no gloss.
 *
 * Run: `node tools/glossary/build.mjs` after refreshing `build/glossary-src/`.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as OpenCC from 'opencc-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'build', 'glossary-src');
const OUT = join(ROOT, 'static', 'glossary', 'zh.json');

const t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });

/** Case, dashes and padding are noise when comparing labels. */
function norm(value) {
	return value
		.toLowerCase()
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function readJson(path, fallback) {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return fallback;
	}
}

const curated = readJson(join(ROOT, 'src', 'lib', 'glossary', 'curated.json'), {});
const wikidata = readJson(join(SRC, 'wikidata.json'), {});

/** term → KW accession, so a keyword entry carries its canonical id. */
const keywordIds = new Map();
const tsv = join(SRC, 'keywords.tsv');
if (existsSync(tsv)) {
	for (const line of readFileSync(tsv, 'utf8').split('\n')) {
		const [id, ...rest] = line.split('\t');
		const name = rest.join('\t').trim();
		if (id?.startsWith('KW-') && name) keywordIds.set(name, id);
	}
}

const terms = {};
let fromDict = 0;
let rejected = 0;
let untranslated = 0;

/** A gloss has to be a Chinese reading, not the English name transcribed. */
const CJK = /[一-鿿]/;

for (const [term, hit] of Object.entries(wikidata)) {
	if (curated[term]) continue;
	if (!hit?.zh) continue;
	// The gate: the matched label must say what we asked. A one-word
	// difference ("acyltransferases") is still the same concept; anything
	// further is concept drift and gets dropped.
	if (norm(hit.en) !== norm(term)) {
		rejected++;
		continue;
	}
	const zh = t2s(hit.zh).trim();
	// Wikidata sometimes carries the English name in the zh slot
	// ("Nemaline myopathy" → "Nemaline Myopathy"). Printing that would put
	// the word twice on screen, which is worse than no gloss, so it is
	// dropped rather than shipped.
	if (!CJK.test(zh)) {
		untranslated++;
		continue;
	}
	const entry = { zh, src: `wikidata:${hit.qid}` };
	const kw = keywordIds.get(term);
	if (kw) entry.kw = kw;
	terms[term] = entry;
	fromDict++;
}

let fromCurated = 0;
for (const [term, entry] of Object.entries(curated)) {
	if (!entry?.zh) continue;
	terms[term] = { zh: t2s(entry.zh).trim(), src: 'curated', ...(entry.id ? { kw: entry.id } : {}) };
	fromCurated++;
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
	OUT,
	JSON.stringify({
		generatedAt: new Date().toISOString().slice(0, 10),
		note: 'Glosses only: the English term stays on screen. Sources: curated (reviewed) and wikidata (CC0, exact-label gated).',
		terms
	})
);

console.log(
	`wrote ${OUT}\n  curated ${fromCurated}\n  dictionary ${fromDict}\n  rejected (label drift) ${rejected}\n  rejected (no Chinese reading) ${untranslated}\n  total ${Object.keys(terms).length}`
);
