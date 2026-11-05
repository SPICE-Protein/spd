import { page } from '$app/state';

/**
 * In-app error log. Captures both SvelteKit component errors (via
 * `handleError` in hooks.client.ts) and anything that escapes to the window
 * (`error` / `unhandledrejection`). The DebugPanel renders it, so a reviewer
 * can see what actually broke and where — no devtools required.
 */
export interface LoggedError {
	id: number;
	at: number;
	source: 'kit' | 'window' | 'rejection';
	route: string;
	message: string;
	stack: string;
}

class ErrorLog {
	entries = $state<LoggedError[]>([]);
	private nextId = 1;
	private installed = false;

	push(source: LoggedError['source'], message: string, stack: string): void {
		const msg = (message || '').trim() || 'unknown error';
		// dedupe identical repeats (hydration retries fire the same error often)
		if (this.entries.some((e) => e.message === msg && e.route === page.url.pathname)) return;
		this.entries.push({
			id: this.nextId++,
			at: Math.floor(Date.now() / 1000),
			source,
			route: page.url.pathname,
			message: msg,
			stack: (stack || '').trim()
		});
		if (this.entries.length > 50) this.entries.splice(0, this.entries.length - 50);
	}

	/** Wire window-level capture; safe to call more than once. */
	install(): void {
		if (this.installed) return;
		this.installed = true;
		window.addEventListener('error', (e) => {
			// extension noise (runtime.lastError) surfaces here with no target
			const target = e.target as { tagName?: string; src?: string; href?: string } | null;
			if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
				this.push('window', `failed to load ${target.tagName.toLowerCase()}: ${target.src ?? target.href ?? ''}`, '');
			} else if (e.message) {
				this.push('window', e.message, e.error instanceof Error ? e.error.stack ?? '' : '');
			}
		});
		window.addEventListener('unhandledrejection', (e) => {
			const r = e.reason;
			this.push(
				'rejection',
				r instanceof Error ? r.message : String(r),
				r instanceof Error ? r.stack ?? '' : ''
			);
		});
	}

	clear(): void {
		this.entries = [];
	}
}

export const errorLog = new ErrorLog();
