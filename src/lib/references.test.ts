import { describe, expect, it } from 'vitest';
import { linkForReference, looksLikeReferenceId, normalizeExternalId } from './references';

/**
 * The panel's whole premise is that a contributor pastes any of the shapes
 * a browser or a reference manager hands them. The worker normalizes the
 * same way (reference/service.rs `normalize_external_id`) — these tests
 * lock the mirror, because a divergence would silently duplicate a ledger
 * row that "looks different" on screen.
 */
describe('reference id normalization', () => {
	it('takes known DOI url prefixes off, as many times as they stack', () => {
		expect(normalizeExternalId('doi', 'https://doi.org/10.1038/nature12373')).toBe('10.1038/nature12373');
		expect(normalizeExternalId('doi', 'DOI: https://dx.doi.org/10.1038/nature12373')).toBe('10.1038/nature12373');
		expect(normalizeExternalId('doi', '  http://doi.org/doi:10.1/x  ')).toBe('10.1/x');
	});

	it('preserves the case-sensitive suffix after stripping', () => {
		expect(normalizeExternalId('doi', 'https://doi.org/10.1016/J.Cell.2020')).toBe('10.1016/J.Cell.2020');
	});

	it('leaves a bare DOI alone', () => {
		expect(normalizeExternalId('doi', '10.1038/nature12373')).toBe('10.1038/nature12373');
	});

	it('strips pmid labels case-insensitively', () => {
		expect(normalizeExternalId('pubmed', 'PMID: 12345')).toBe('12345');
		expect(normalizeExternalId('pubmed', 'pmid 12345')).toBe('12345');
		expect(normalizeExternalId('pubmed', '12345')).toBe('12345');
	});

	it('leaves `other` verbatim except for trimming', () => {
		expect(normalizeExternalId('other', '  S12345 ')).toBe('S12345');
		// "other" has no registry — its id may legitimately look like anything
		expect(normalizeExternalId('other', 'doi:10.1/x')).toBe('doi:10.1/x');
	});
});

describe('reference links', () => {
	it('links doi and pubmed through their canonical registries', () => {
		expect(linkForReference({ source: 'doi', externalId: '10.1/x' })).toBe('https://doi.org/10.1/x');
		expect(linkForReference({ source: 'pubmed', externalId: '12345' })).toBe(
			'https://pubmed.ncbi.nlm.nih.gov/12345/'
		);
	});

	it('falls back to the stored OA url for other', () => {
		expect(linkForReference({ source: 'other', externalId: 'S1', oaUrl: 'https://example.org' })).toBe(
			'https://example.org'
		);
		expect(linkForReference({ source: 'other', externalId: 'S1' })).toBeUndefined();
	});
});

describe('reference id shape hint', () => {
	it('recognizes bare DOIs and numeric PMIDs without blocking anything else', () => {
		expect(looksLikeReferenceId('doi', 'https://doi.org/10.1038/nature12373')).toBe(true);
		expect(looksLikeReferenceId('doi', 'nature12373')).toBe(false);
		expect(looksLikeReferenceId('pubmed', 'PMID: 12345')).toBe(true);
		expect(looksLikeReferenceId('pubmed', '12a34')).toBe(false);
		expect(looksLikeReferenceId('other', 'anything')).toBe(true);
		expect(looksLikeReferenceId('other', '   ')).toBe(false);
	});
});
