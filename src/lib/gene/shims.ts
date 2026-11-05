/**
 * Adapters for the gene-viewer subtree ported from SPICE_GUI. The GUI's
 * renderers reach for a Tauri-backed save, a three-argument toast store and
 * a locale signal; SPD web has its own equivalents, so the ported files
 * import these instead of $lib/backend / $lib/ui/toast / $lib/i18n.svelte.
 */
import { toasts } from '$lib/state/toast.svelte';
import { isZh } from '$lib/i18n';

/** GUI signature: pushToast(kind, title, body) — SPD toasts are single-line. */
export function pushToast(kind: 'success' | 'error' | 'info', title: string, body = '') {
	toasts.push(kind, body ? `${title} · ${body}` : title);
}

/** GUI's backend.saveExport(name, bytes) — web path downloads via an anchor. */
export const backend = {
	saveExport: async (name: string, bytes: Uint8Array) => {
		const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		a.click();
		URL.revokeObjectURL(url);
		return { data: { path: name } };
	},
	/** Codon tables are not fetched in SPD — the viewer's codon panel stays closed. */
	fetchCodonTable: async (): Promise<never> => {
		throw new Error('codon tables are not available in SPD web');
	},
	fetchKazusaCodonTable: async (_taxId: string): Promise<{ data: Record<string, string> }> => {
		throw new Error('codon tables are not available in SPD web');
	}
};

/** Reactive-enough locale flag for the ported bilingual t(zh, en) helper. */
export const currentLocale = {
	get value() {
		return isZh() ? 'zh' : 'en';
	}
};
