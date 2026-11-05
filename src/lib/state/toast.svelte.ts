export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
	id: number;
	kind: ToastKind;
	message: string;
}

let nextId = 1;

const list = $state<Toast[]>([]);

export const toasts = {
	get items(): Toast[] {
		return list;
	},
	push(kind: ToastKind, message: string, ttlMs = 5000): void {
		const t: Toast = { id: nextId++, kind, message };
		list.push(t);
		if (ttlMs > 0) setTimeout(() => toasts.dismiss(t.id), ttlMs);
	},
	dismiss(id: number): void {
		const i = list.findIndex((t) => t.id === id);
		if (i >= 0) list.splice(i, 1);
	}
};

export const toastOk = (message: string) => toasts.push('success', message);
export const toastInfo = (message: string) => toasts.push('info', message);
export const toastErr = (e: unknown) =>
	toasts.push('error', e instanceof Error ? e.message : String(e), 8000);
