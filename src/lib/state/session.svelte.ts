import { auth } from '$lib/api/client';
import type { SessionRole, SessionUser } from '$lib/api/types';

/**
 * Browser-side session. The API is a different origin with an HttpOnly SameSite=Lax
 * cookie, so the session can ONLY be resolved from the browser (credentials:"include");
 * SSR never sees it — hence ssr:false app-wide.
 */
class Session {
	user = $state<SessionUser | null>(null);
	roles = $state<SessionRole[]>([]);
	loading = $state(true);

	private initialized = false;

	get signedIn(): boolean {
		return this.user !== null;
	}

	hasRole(role: string): boolean {
		const now = Math.floor(Date.now() / 1000);
		return this.roles.some((r) => r.role === role && (r.expiresAt == null || r.expiresAt > now));
	}

	get isAdmin(): boolean {
		return this.hasRole('admin');
	}
	get isCurator(): boolean {
		return this.hasRole('curator') || this.isAdmin;
	}
	get isResearcher(): boolean {
		return this.hasRole('researcher');
	}
	/**
	 * The server rejects every non-GET request unless the caller is a
	 * researcher (curator and admin inherit the tier). Mirror that here so
	 * the UI never offers an action the API will refuse.
	 */
	get canWrite(): boolean {
		return this.isResearcher || this.isCurator;
	}

	async load(): Promise<void> {
		if (!this.signedIn) {
			try {
				const me = await auth.me();
				this.user = me.user ?? null;
				this.roles = me.roles ?? [];
			} catch {
				this.user = null;
				this.roles = [];
			}
		}
		this.loading = false;
		this.initialized = true;
	}

	async refresh(): Promise<void> {
		this.user = null;
		await this.load();
	}

	async logout(): Promise<void> {
		try {
			await auth.logout();
		} catch {
			/* the cookie is cleared regardless of the response */
		}
		this.user = null;
		this.roles = [];
	}

	async logoutAll(): Promise<void> {
		try {
			await auth.logoutAll();
		} catch {
			/* same */
		}
		this.user = null;
		this.roles = [];
	}

	signIn(): void {
		// Full-page navigation: the worker 302s to ORCID and back through
		// /auth/orcid/callback, which lands on this frontend with a fresh cookie.
		window.location.href = auth.loginUrl();
	}

	get ready(): boolean {
		return this.initialized;
	}
}

export const session = new Session();
