/**
 * Fold predictions are submitted as a free-form JSON object (SPD never
 * dictates the pipeline's payload shape). This module probes the shapes the
 * SPICE pipeline actually produces and normalizes them into atoms, so the 3D
 * viewer can synthesize renderable coordinates from whatever is on the wire.
 *
 * Recognized shapes (checked recursively, shallowest first):
 *   - text:            cifText / mmcif / pdbText / pdb / coordinatesText (string)
 *   - atom arrays:     atoms: [{x,y,z, element?, name?, resname?, resi?, chain?},…]
 *   - C-alpha traces:  c_alpha_coordinates / caCoords / calpha (+ sequence)
 *   - coordinate arrays: coordinates/coords/positions/xyz as flat [x,y,z,…],
 *                        [[x,y,z],…], or [{x,y,z},…]; optional parallel
 *                        `elements` array.
 *   - sequence sources: sequence / seq / oneLetter
 *   - nesting:         recurse into models[0], prediction, result, data …
 */

export interface MolAtom {
	x: number;
	y: number;
	z: number;
	name?: string;
	element?: string;
	resname?: string;
	resi?: number;
	chain?: string;
}

export interface CoordsSource {
	format: 'cif' | 'pdb';
	text?: string;
	/** exact stored bytes (BinaryCIF and any binary artifact path) — when
	 * present the viewer hands these to Mol* untouched; never text-decode
	 * msgpack */
	bytes?: Uint8Array<ArrayBuffer>;
	atoms?: MolAtom[];
	sequence?: string;
	/** which field matched, for the UI honesty note */
	via: string;
}

const TEXT_KEYS = ['cifText', 'mmcif', 'pdbText', 'pdb', 'coordinatesText'];
const ATOM_KEYS = ['atoms', 'atomArray', 'atoms_site'];
const CA_KEYS = ['c_alpha_coordinates', 'caCoords', 'ca_coordinates', 'calpha', 'caCoordinates'];
const COORD_KEYS = ['coordinates', 'coords', 'positions', 'xyz'];
const SEQ_KEYS = ['sequence', 'seq', 'oneLetter', 'one_letter'];

type Triples = Array<[number, number, number]>;

function flatToTriples(nums: number[]): Triples {
	const t: Triples = [];
	for (let i = 0; i + 2 < nums.length; i += 3) t.push([nums[i], nums[i + 1], nums[i + 2]]);
	return t;
}

function asNumbers(v: unknown): number[] | null {
	if (Array.isArray(v) && v.length >= 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
		return v as number[];
	}
	return null;
}

function asTriples(v: unknown): Triples | null {
	if (!Array.isArray(v) || v.length === 0) return null;
	const out: Triples = [];
	for (const item of v) {
		if (Array.isArray(item) && item.length >= 3 && item.slice(0, 3).every((n) => typeof n === 'number' && Number.isFinite(n))) {
			out.push([item[0] as number, item[1] as number, item[2] as number]);
		} else if (item && typeof item === 'object' && !Array.isArray(item)) {
			const o = item as Record<string, unknown>;
			if (typeof o.x === 'number' && typeof o.y === 'number' && typeof o.z === 'number') out.push([o.x, o.y, o.z]);
			else return null;
		} else if (typeof item === 'number') {
			// flat numeric array — caller handles via asNumbers
			return null;
		} else return null;
	}
	return out.length > 0 ? out : null;
}

function triplesOrFlat(v: unknown): Triples | null {
	const t = asTriples(v);
	if (t) return t;
	const nums = asNumbers(v);
	if (nums && nums.length % 3 === 0 && nums.length >= 3) return flatToTriples(nums);
	return null;
}

function findSequence(node: Record<string, unknown>): string | undefined {
	for (const key of SEQ_KEYS) {
		const v = node[key];
		if (typeof v === 'string' && /^[A-Za-z]+$/.test(v.trim())) return v.trim().toUpperCase();
	}
	return undefined;
}

function atomListToAtoms(v: unknown): MolAtom[] | null {
	if (!Array.isArray(v) || v.length === 0) return null;
	const atoms: MolAtom[] = [];
	for (const item of v) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
		const o = item as Record<string, unknown>;
		const xyz = Array.isArray(o.xyz) ? (o.xyz as number[]) : null;
		const x = typeof o.x === 'number' ? o.x : xyz ? xyz[0] : NaN;
		const y = typeof o.y === 'number' ? o.y : xyz ? xyz[1] : NaN;
		const z = typeof o.z === 'number' ? o.z : xyz ? xyz[2] : NaN;
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
		const str = (v2: unknown): string | undefined => (typeof v2 === 'string' ? v2 : undefined);
		const resiRaw = o.resi ?? o.resnum ?? o.residueNumber ?? (o.index != null ? Number(o.index) + 1 : undefined);
		atoms.push({
			x,
			y,
			z,
			name: str(o.name) ?? str(o.atom) ?? str(o.atomName),
			element: str(o.element) ?? str(o.el) ?? str(o.type_symbol),
			resname: str(o.resname) ?? str(o.residue) ?? str(o.compId),
			resi: resiRaw != null && Number.isFinite(Number(resiRaw)) ? Number(resiRaw) : undefined,
			chain: str(o.chain) ?? str(o.chainId) ?? str(o.auth_asym_id)
		});
	}
	return atoms;
}

function traceAtoms(t: Triples, sequence?: string): MolAtom[] {
	return t.map((p, i) => ({
		x: p[0],
		y: p[1],
		z: p[2],
		name: 'CA',
		element: 'C',
		resname: sequence && sequence[i] ? (aa1to3(sequence[i]) ?? 'UNK') : 'ALA',
		resi: i + 1,
		chain: 'A'
	}));
}

/** Depth-first search for the first coordinate shape we understand. */
export function discoverCoords(root: unknown, maxDepth = 5): CoordsSource | null {
	const seen = new Set<unknown>();

	function walk(node: unknown, depth: number): CoordsSource | null {
		if (node == null || depth > maxDepth || seen.has(node)) return null;
		if (typeof node === 'string' || typeof node !== 'object') return null;
		seen.add(node);

		if (Array.isArray(node)) {
			const t = triplesOrFlat(node);
			if (t && t.length >= 2) return { format: 'pdb', atoms: traceAtomsFallback(t), via: 'array' };
			for (const item of node) {
				const found = walk(item, depth + 1);
				if (found) return found;
			}
			return null;
		}

		const o = node as Record<string, unknown>;

		for (const key of TEXT_KEYS) {
			const v = o[key];
			if (typeof v === 'string' && v.length > 40) {
				const fmt: 'cif' | 'pdb' = (key === 'cifText' || key === 'mmcif' || v.trimStart().startsWith('data_')) ? 'cif' : 'pdb';
				return { format: fmt, text: v, via: key };
			}
		}

		const sequence = findSequence(o);

		for (const key of ATOM_KEYS) {
			const atoms = atomListToAtoms(o[key]);
			if (atoms) return { format: 'pdb', atoms, sequence, via: key };
		}

		for (const key of CA_KEYS) {
			const t = triplesOrFlat(o[key]);
			if (t) return { format: 'pdb', atoms: traceAtoms(t, sequence), sequence, via: key };
		}

		for (const key of COORD_KEYS) {
			const t = triplesOrFlat(o[key]);
			if (t) {
				// a full per-atom coordinate array that exactly matches the sequence
				// length is most plausibly a CA trace, so label it per-residue.
				const asCa = sequence != null && t.length === sequence.length;
				return {
					format: 'pdb',
					atoms: asCa ? traceAtoms(t, sequence) : traceAtomsFallback(t),
					sequence,
					via: key
				};
			}
			const elements = asStrings(o['elements']);
			if (t === null && elements && Array.isArray(o[key])) {
				const triples = asTriples(o[key]);
				if (triples && triples.length === elements.length) {
					return {
						format: 'pdb',
						atoms: triples.map((p, i) => ({ x: p[0], y: p[1], z: p[2], element: elements[i] })),
						sequence,
						via: `${key}+elements`
					};
				}
			}
		}

		for (const v of Object.values(o)) {
			const found = walk(v, depth + 1);
			if (found) return found;
		}
		return null;
	}

	return walk(root, 0);
}

/** coordinates without residue context: treat each as a generic ALA CA so the trace renders. */
function traceAtomsFallback(t: Triples): MolAtom[] {
	return t.map((p, i) => ({ x: p[0], y: p[1], z: p[2], name: 'CA', element: 'C', resname: 'UNK', resi: i + 1, chain: 'A' }));
}

function asStrings(v: unknown): string[] | null {
	if (Array.isArray(v) && v.every((s) => typeof s === 'string')) return v as string[];
	return null;
}

const AA3: Record<string, string> = {
	A: 'ALA', R: 'ARG', N: 'ASN', D: 'ASP', C: 'CYS', Q: 'GLN', E: 'GLU', G: 'GLY', H: 'HIS',
	I: 'ILE', L: 'LEU', K: 'LYS', M: 'MET', F: 'PHE', P: 'PRO', S: 'SER', T: 'THR', W: 'TRP',
	Y: 'TYR', V: 'VAL', U: 'SEC', O: 'PYL', B: 'ASN', Z: 'GLU', X: 'ALA'
};

export function aa1to3(one: string): string | null {
	return AA3[one.toUpperCase()] ?? null;
}

const AA3_TO_ELEMENT: Record<string, string> = {};

/** Minimal PDB text from normalized atoms (CA trace or full-atom). */
export function atomsToPdb(atoms: MolAtom[], label = 'SPD predicted fold'): string {
	const lines: string[] = [`HEADER    ${label}`];
	let serial = 1;
	let prevChain = '';
	let prevResi = -1;
	for (const a of atoms) {
		const elementRaw = (a.element ?? elementFromAtomName(a.name)).toUpperCase();
		const element = elementRaw.padStart(2).slice(-2);
		const name = (a.name ?? 'CA').toUpperCase();
		const nameField = name.length >= 4 ? name.slice(0, 4) : ` ${name.padEnd(3)}`;
		const resname = (a.resname ?? 'UNK').toUpperCase().padStart(3).slice(0, 3);
		const resi = Math.min(9999, Math.max(1, Math.floor(a.resi ?? serial)));
		const chain = (a.chain ?? 'A').slice(0, 1);
		if (prevChain && (chain !== prevChain || resi !== prevResi)) {
			if (resi !== prevResi || chain !== prevChain) lines.push(`TER   ${String(serial).padStart(5)}      ${resname} ${chain}${String(resi).padStart(4)}`);
		}
		prevChain = chain;
		prevResi = resi;
		lines.push(
			`ATOM  ${String(serial).padStart(5)} ${nameField} ${resname} ${chain}${String(resi).padStart(4)}    ` +
				`${a.x.toFixed(3).padStart(8)}${a.y.toFixed(3).padStart(8)}${a.z.toFixed(3).padStart(8)}  1.00  0.00` +
				`          ${element.trim()}`
		);
		serial++;
	}
	lines.push('END');
	return lines.join('\n');
}

function elementFromAtomName(name?: string): string {
	if (!name) return 'C';
	const n = name.trim().toUpperCase();
	if (n === 'CA' || n === 'CB' || n === 'CG' || n === 'CD' || n === 'CE' || n === 'CZ' || n.startsWith('CH') || n === 'C') return 'C';
	if (n === 'N' || n.startsWith('NZ') || n.startsWith('ND') || n.startsWith('NE') || n.startsWith('NH')) return 'N';
	if (n === 'O' || n.startsWith('O')) return 'O';
	if (n === 'S' || n.startsWith('SG') || n.startsWith('SD')) return 'S';
	return name.trim()[0] ?? 'C';
}
