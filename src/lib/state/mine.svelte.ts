import { auth } from '$lib/api/client';
import { session } from '$lib/state/session.svelte';

/**
 * Which records the signed-in user authored.
 *
 * SPD detail payloads deliberately do not carry `createdBy` (a record is the
 * community's, not the submitter's), so the ownership signal comes from the
 * personal activity feed. One fetch is shared by every detail page and the /my
 * portal: it decides whether the header says "this is yours" and whether the
 * revision button — which the backend restricts to submitter/curator/admin —
 * is offered at all.
 *
 * Nothing here is load-bearing: a failed fetch leaves the sets empty and the
 * pages still work, they just stop claiming ownership.
 */
type MineState = {
	ids: Set<string>;
	annotated: Set<string>;
	loaded: boolean;
	loading: boolean;
};

const state: MineState = $state({ ids: new Set(), annotated: new Set(), loaded: false, loading: false });

async function refresh() {
	if (!session.signedIn || state.loading) return;
	state.loading = true;
	try {
		const d = await auth.activity();
		const ids = new Set<string>();
		for (const s of d.submissions ?? []) ids.add(s.id);
		for (const a of d.needsAction ?? []) ids.add(a.id);
		// filings that live only in the review queue (corrections, retractions)
		// never appear as submissions of their own type — but they are mine.
		for (const r of d.inReview ?? []) ids.add(r.id);
		const wiki = new Set<string>();
		for (const w of d.wikiEdits ?? []) wiki.add(w.entityId);
		state.ids = ids;
		state.annotated = wiki;
		state.loaded = true;
	} catch {
		/* decorative hint only */
	} finally {
		state.loading = false;
	}
}

export const mine = {
	get loaded(): boolean {
		return state.loaded;
	},
	is(id: string): boolean {
		return state.ids.has(id);
	},
	annotatedId(id: string): boolean {
		return state.annotated.has(id);
	},
	/** kick off the shared fetch; safe to call from every page */
	ensure(): void {
		if (session.signedIn && !state.loaded && !state.loading) void refresh();
	},
	/** /my reloads after an action and needs the sets to reflect it */
	refreshNow(): void {
		state.loaded = false;
		void refresh();
	}
};
