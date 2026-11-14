import { afterEach, describe, expect, it, vi } from 'vitest';

/** Each case needs a fresh module: the loaded dictionary is module state. */
async function freshLookup() {
	vi.resetModules();
	return await import('./lookup');
}

const BODY = {
	terms: {
		// Deliberately not curated: these can only be answered by the file.
		aminopeptidase: { zh: '氨肽酶', src: 'wikidata:Q4793306' },
		'Thermus thermophilus': { zh: '嗜热栖热菌', src: 'wikidata:Q2646494' },
		// A curated term is also present here; curated must win.
		cytoplasm: { zh: '错误的读法', src: 'wikidata:Q000000' }
	}
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('generated dictionary', () => {
	it('answers terms the curated table does not carry', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(BODY), { status: 200 }))
		);
		const lookup = await freshLookup();
		expect(lookup.dictionaryLoaded()).toBe(false);
		await lookup.loadDictionary();
		expect(lookup.dictionaryLoaded()).toBe(true);
		expect(lookup.glossZh('Aminopeptidase')).toBe('氨肽酶');
		expect(lookup.glossZh('Thermus thermophilus')).toBe('嗜热栖热菌');
	});

	it('never overrides a curated reading', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(BODY), { status: 200 }))
		);
		const lookup = await freshLookup();
		await lookup.loadDictionary();
		expect(lookup.glossZh('Cytoplasm')).toBe('细胞质');
	});

	it('resolves a strain-qualified organism through the dictionary', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(BODY), { status: 200 }))
		);
		const lookup = await freshLookup();
		await lookup.loadDictionary();
		expect(lookup.glossZh('Thermus thermophilus (strain HB8)')).toBe('嗜热栖热菌');
	});

	it('keeps the curated tier working when the file cannot be fetched', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('offline');
			})
		);
		const lookup = await freshLookup();
		await lookup.loadDictionary();
		expect(lookup.dictionaryLoaded()).toBe(true);
		expect(lookup.glossZh('Aminopeptidase')).toBeUndefined();
		expect(lookup.glossZh('Cytoplasm')).toBe('细胞质');
	});

	it('loads once', async () => {
		const fetchSpy = vi.fn(async () => new Response(JSON.stringify(BODY), { status: 200 }));
		vi.stubGlobal('fetch', fetchSpy);
		const lookup = await freshLookup();
		await Promise.all([lookup.loadDictionary(), lookup.loadDictionary()]);
		await lookup.loadDictionary();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});
