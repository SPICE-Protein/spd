/**
 * Kekule is served from this app's own static assets, not a CDN.
 *
 * `kekule-svelte` assumes a `Kekule.CoordGenerator.prepare2DCoords` helper,
 * but the published Kekule build does not ship one: 2D layout lives behind
 * the OpenBabel module. We load that module from `/vendor/kekule/extra` and
 * expose a synchronous compatibility shim, so the wrapper's own render path
 * (parse SMILES → layout → viewer) works unchanged.
 */
type KekuleNode = {
	getCoord2D?: () => { x: number; y: number } | null;
	setCoord2D?: (coord: { x: number; y: number }) => void;
};

type KekuleMolecule = {
	getNodeCount: () => number;
	getNodeAt: (index: number) => KekuleNode | undefined;
};

type KekuleGenerator = {
	setSourceMol: (mol: KekuleMolecule) => void;
	executeSync: (callback: (error?: unknown) => void) => void;
	getGeneratedMol: () => KekuleMolecule | null;
};

type KekuleGlobal = {
	environment: { setEnvVar: (name: string, value: string) => void };
	OpenBabel: { enable: (callback: (error?: unknown) => void) => void };
	Calculator: { ObStructure2DGenerator: new () => KekuleGenerator };
	CoordGenerator?: { prepare2DCoords: (mol: KekuleMolecule) => void };
};

const KEKULE_SCRIPT_ID = 'spd-kekule-script';
const KEKULE_BASE = '/vendor/kekule';
const OPENBABEL_BASE = `${KEKULE_BASE}/extra`;
const LOAD_TIMEOUT_MS = 30_000;

let ready: Promise<KekuleGlobal> | null = null;
let configured = false;

function globalKekule(): KekuleGlobal | undefined {
	return (globalThis as { Kekule?: KekuleGlobal }).Kekule;
}

function loadScript(): Promise<void> {
	const existing = globalKekule();
	if (existing?.Calculator) return Promise.resolve();

	return new Promise((resolve, reject) => {
		const prior = document.getElementById(KEKULE_SCRIPT_ID) as HTMLScriptElement | null;
		const script = prior ?? document.createElement('script');
		script.id = KEKULE_SCRIPT_ID;
		script.src = `${KEKULE_BASE}/kekule.min.js`;
		script.async = true;
		const timer = setTimeout(() => reject(new Error('Kekule load timed out')), LOAD_TIMEOUT_MS);
		script.addEventListener('load', () => {
			clearTimeout(timer);
			resolve();
		});
		script.addEventListener('error', () => {
			clearTimeout(timer);
			reject(new Error('Kekule script failed to load'));
		});
		if (!prior) document.head.appendChild(script);
	});
}

function installCoordShim(K: KekuleGlobal) {
	if (K.CoordGenerator) return;
	K.CoordGenerator = {
		prepare2DCoords(mol) {
			const generator = new K.Calculator.ObStructure2DGenerator();
			generator.setSourceMol(mol);
			let failure: unknown = null;
			generator.executeSync((error) => {
				failure = error ?? null;
			});
			if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
			const generated = generator.getGeneratedMol();
			if (!generated) return;
			// OpenBabel preserves atom order; copy by index only when both
			// sides agree, and never invent a coordinate for a missing node.
			const count = Math.min(mol.getNodeCount(), generated.getNodeCount());
			for (let i = 0; i < count; i += 1) {
				const coord = generated.getNodeAt(i)?.getCoord2D?.();
				if (coord) mol.getNodeAt(i)?.setCoord2D?.(coord);
			}
		}
	};
}

async function initKekule(): Promise<KekuleGlobal> {
	await loadScript();
	const K = globalKekule();
	if (!K) throw new Error('Kekule global missing after load');
	K.environment.setEnvVar('openbabel.path', `${OPENBABEL_BASE}/`);
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('OpenBabel enable timed out')), LOAD_TIMEOUT_MS);
		K.OpenBabel.enable((error) => {
			clearTimeout(timer);
			if (error) reject(error instanceof Error ? error : new Error(String(error)));
			else resolve();
		});
	});
	installCoordShim(K);
	return K;
}

async function ensureKekule(): Promise<void> {
	if (typeof window === 'undefined') return;
	if (!ready) ready = initKekule();
	await ready;
}

export async function loadKekuleViewer() {
	await ensureKekule();
	const mod = await import('kekule-svelte');
	if (!configured) {
		mod.configureKekule({ cdnBase: KEKULE_BASE });
		configured = true;
	}
	return mod.KekuleViewer;
}

export async function loadKekuleReaction() {
	await ensureKekule();
	const mod = await import('kekule-svelte');
	if (!configured) {
		mod.configureKekule({ cdnBase: KEKULE_BASE });
		configured = true;
	}
	return mod.KekuleReaction;
}
