import { describe, expect, it } from 'vitest';
import type { OrgMembershipRow } from './api/types';
import { supplierOrgOptions } from './suppliers';

const row = (overrides: Partial<OrgMembershipRow>): OrgMembershipRow => ({
	verificationId: 'ORG-1',
	name: 'Org One',
	role: 'leader',
	memberStatus: 'active',
	...overrides
});

describe('supplierOrgOptions', () => {
	it('keeps only active leaders', () => {
		const options = supplierOrgOptions([
			row({ verificationId: 'ORG-LEADER', name: 'Leader Org' }),
			row({ verificationId: 'ORG-MEMBER', name: 'Member Org', role: 'researcher' }),
			row({ verificationId: 'ORG-INACTIVE', name: 'Inactive Org', memberStatus: 'inactive' })
		]);
		expect(options).toEqual([{ value: 'ORG-LEADER', label: 'Leader Org' }]);
	});

	it('deduplicates repeated memberships by verification id', () => {
		const options = supplierOrgOptions([
			row({ verificationId: 'ORG-1', name: 'Org One' }),
			row({ verificationId: 'ORG-1', name: 'Org One' })
		]);
		expect(options).toHaveLength(1);
	});

	it('falls back to the verification id when the name is empty', () => {
		expect(supplierOrgOptions([row({ verificationId: 'ORG-2', name: '' })])).toEqual([
			{ value: 'ORG-2', label: 'ORG-2' }
		]);
	});

	it('handles a missing list', () => {
		expect(supplierOrgOptions(undefined)).toEqual([]);
	});
});
