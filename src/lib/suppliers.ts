import type { OrgMembershipRow } from './api/types';

export interface SupplierOrgOption {
	value: string;
	label: string;
}

/**
 * Supplier listings may only be filed by an active leader of the organization.
 * The API already scopes memberships to the signed-in user, so this filters
 * down to the rows that can actually pass the server-side leader check.
 */
export function supplierOrgOptions(rows: OrgMembershipRow[] | undefined): SupplierOrgOption[] {
	const seen = new Set<string>();
	const options: SupplierOrgOption[] = [];
	for (const row of rows ?? []) {
		if (row.role !== 'leader' || row.memberStatus !== 'active') continue;
		if (!row.verificationId || seen.has(row.verificationId)) continue;
		seen.add(row.verificationId);
		options.push({ value: row.verificationId, label: row.name || row.verificationId });
	}
	return options;
}
