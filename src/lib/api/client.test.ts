import { afterEach, describe, expect, it, vi } from 'vitest';
import { external } from './client';

function mockJson(payload: unknown) {
	const spy = vi.fn(
		async () =>
			new Response(JSON.stringify(payload), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
	);
	vi.stubGlobal('fetch', spy);
	return spy;
}

function calls(spy: ReturnType<typeof mockJson>): Array<[string, RequestInit]> {
	return spy.mock.calls as unknown as Array<[string, RequestInit]>;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('external ladder endpoints', () => {
	it('reads the ladder table with GET', async () => {
		const spy = mockJson({
			data: { ladders: [{ entityType: 'protein', sources: ['uniprot', 'ncbi'] }] },
			meta: {},
			error: null
		});

		const data = await external.ladder();

		expect(data.ladders[0]).toEqual({ entityType: 'protein', sources: ['uniprot', 'ncbi'] });
		const [url, init] = calls(spy)[0];
		expect(String(url)).toContain('/external/ladder');
		expect(init.method).toBe('GET');
	});

	it('resolves through POST without importing anything', async () => {
		const spy = mockJson({
			data: { entityType: 'protein', rungs: [] },
			meta: {},
			error: null
		});

		await external.resolve('protein', 'Q8H7Y6', 5);

		const [url, init] = calls(spy)[0];
		expect(String(url)).toContain('/external/resolve');
		expect(init.method).toBe('POST');
		expect(JSON.parse(String(init.body))).toEqual({
			entityType: 'protein',
			query: 'Q8H7Y6',
			limit: 5
		});
	});
});
