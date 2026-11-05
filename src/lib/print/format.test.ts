import { describe, expect, it } from 'vitest';
import { columnKeys, publicIdOf, recordParts, titleOf } from './format';

describe('print record shaping', () => {
	it('moves sequences out of text output and collapses repeated prose', () => {
		const parts = recordParts({
			name: 'Gene A',
			description: 'A short description.',
			definition: 'A short description.',
			sequence: 'ACGT'.repeat(20),
			dnaSequence: 'ACGT'.repeat(20),
			metadata: { internal: true },
			tags: ['kinase', 'human']
		});

		expect(parts.lead.map((field) => field.key)).toEqual(['description']);
		expect(parts.facts.some((field) => field.key === 'sequence')).toBe(false);
		expect(parts.blocks.map((field) => field.key)).toEqual(['tags']);
	});

	it('removes internal bookkeeping from tables', () => {
		const columns = columnKeys([
			{ id: 'spd:x', sequenceId: '762e', name: 'A', startPosition: 1 },
			{ id: 'spd:y', sequenceId: '762e', name: 'B', startPosition: 2 }
		]);
		expect(columns).toEqual(['name', 'startPosition']);
	});

	it('finds identity through payload and organization wrappers', () => {
		const organization = {
			organization: { id: 'spd:organization:1', name: 'Example Lab' }
		};
		expect(titleOf(organization, 'fallback')).toBe('Example Lab');
		expect(publicIdOf(organization, 'fallback')).toBe('spd:organization:1');
	});
});
