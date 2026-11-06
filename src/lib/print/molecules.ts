/** One 2D chemical structure that belongs in a printable record. */
export interface PrintMolecule {
	smiles: string;
	caption?: string;
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** Reagent records carry one canonical structure on the row itself. */
export function reagentMolecules(record: Record<string, unknown>): PrintMolecule[] {
	const smiles = text(record.isomericSmiles) || text(record.smiles);
	return smiles ? [{ smiles }] : [];
}

/** Reaction participants can each carry their own SMILES string. */
export function reactionMolecules(record: Record<string, unknown>): PrintMolecule[] {
	const participants = Array.isArray(record.participants) ? record.participants : [];
	return participants.flatMap((participant) => {
		if (!participant || typeof participant !== 'object' || Array.isArray(participant)) return [];
		const row = participant as Record<string, unknown>;
		const smiles = text(row.smiles);
		if (!smiles) return [];
		const caption = text(row.name);
		return [{ smiles, ...(caption ? { caption } : {}) }];
	});
}
