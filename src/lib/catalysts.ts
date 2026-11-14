/**
 * Grouping for a reaction's upstream catalyst list.
 *
 * The list addresses one protein per accession, so a reaction catalysed by a
 * large family arrives as hundreds of rows that all read "amidase". Without an
 * organism column they are indistinguishable to the reader, so rows collapse
 * by the fields the table actually shows — and the collapsed row keeps the
 * accession (and SPD protein, when the backend resolved one) of a member that
 * has them, not necessarily of the first member listed.
 *
 * Two shapes reach us: Rhea writes one protein per row (`accession`, `name`,
 * `ecNumber`, `reviewed`), the Reactome projection writes a complex
 * (`uniprot: [...]`, `reactomeId`, `role`). A complex row names more than one
 * molecule, so it keeps its member list and never claims to be the protein its
 * first accession resolves to.
 */
export interface CatalystRow {
	accession?: string;
	name?: string;
	ecNumber?: string;
	reviewed?: boolean;
	/** Set when SPD already holds this accession's protein record. */
	proteinId?: string | null;
	uniprot?: string[];
	reactomeId?: string;
	role?: string;
}

export interface CatalystGroup {
	/** The row the group's name and EC number come from. */
	enzyme: CatalystRow;
	count: number;
	/** The SPD protein behind one of the group's members, if any. */
	proteinId?: string;
	/** The accession that protein was resolved from. */
	linkedAccession?: string;
	/** Present when the row stands for a complex rather than one protein. */
	complexMembers?: string[];
}

function groupKey(enzyme: CatalystRow): string {
	return `${enzyme.name ?? ''}|${enzyme.ecNumber ?? ''}|${enzyme.reviewed ?? ''}`;
}

export function groupCatalysts(enzymes: CatalystRow[]): CatalystGroup[] {
	const groups = new Map<string, CatalystGroup>();
	for (const enzyme of enzymes) {
		const key = groupKey(enzyme);
		const existing = groups.get(key);
		if (existing) {
			existing.count += 1;
			if (!existing.proteinId && enzyme.proteinId) {
				existing.proteinId = enzyme.proteinId;
				existing.linkedAccession = enzyme.accession;
			}
			continue;
		}
		groups.set(key, {
			enzyme,
			count: 1,
			proteinId: enzyme.proteinId ?? undefined,
			linkedAccession: enzyme.proteinId ? enzyme.accession : undefined,
			complexMembers: enzyme.uniprot?.length ? enzyme.uniprot : undefined
		});
	}
	return [...groups.values()];
}
