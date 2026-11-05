import { browser } from '$app/environment';

/**
 * Unfinished submission drafts, kept in this browser only.
 *
 * SPD's forms are long by nature (an assay report has two dozen fields), and
 * an ORCID round-trip, a closed laptop, or an accidental navigation used to
 * cost every keystroke. Nothing here leaves the machine and nothing is sent to
 * the server: a draft is a convenience, never a submission state. Submitting
 * clears it, and the UI says so plainly — the last thing a contributor needs
 * is to wonder whether a saved draft was filed.
 */
const PREFIX = 'spd:draft:';

type Saved = { at: number; values: Record<string, string> };

function storage(): Storage | null {
	if (!browser) return null;
	try {
		return window.localStorage;
	} catch {
		// private mode / quota errors must never break a form
		return null;
	}
}

export function draft(key: string) {
	const slot = `${PREFIX}${key}`;
	return {
		/** copy a saved draft into `into`, returning whether anything was there */
		restore(into: Record<string, string>): boolean {
			const ls = storage();
			if (!ls) return false;
			try {
				const raw = ls.getItem(slot);
				if (!raw) return false;
				const parsed = JSON.parse(raw) as Saved;
				if (!parsed || typeof parsed.values !== 'object') return false;
				// Only empty slots are filled: a wizard that seeded a field from
				// the previous step (protein → sequence carries proteinId) must not
				// be overruled by a draft typed for a different record.
				let applied = false;
				for (const [k, v] of Object.entries(parsed.values)) {
					if (typeof v !== 'string') continue;
					if (String(into[k] ?? '').trim() === '') {
						into[k] = v;
						applied = true;
					}
				}
				return applied;
			} catch {
				return false;
			}
		},
		savedAt(): number | null {
			const ls = storage();
			if (!ls) return null;
			try {
				const raw = ls.getItem(slot);
				return raw ? ((JSON.parse(raw) as Saved).at ?? null) : null;
			} catch {
				return null;
			}
		},
		save(values: Record<string, string>): void {
			const ls = storage();
			if (!ls) return;
			// A form nobody filled in should not leave a trace behind.
			const filled = Object.entries(values).filter(([, v]) => String(v ?? '').trim() !== '');
			try {
				if (!filled.length) {
					ls.removeItem(slot);
					return;
				}
				const snapshot: Saved = { at: Date.now(), values: Object.fromEntries(filled) };
				ls.setItem(slot, JSON.stringify(snapshot));
			} catch {
				/* out of space: the form keeps working, it just won't remember */
			}
		},
		clear(): void {
			try {
				storage()?.removeItem(slot);
			} catch {
				/* ignore */
			}
		}
	};
}

/** Human label for the saved moment, e.g. inside a "resume where you left off" hint. */
export function draftStamp(at: number | null): string {
	if (!at) return '';
	try {
		return new Date(at).toLocaleString();
	} catch {
		return '';
	}
}

/**
 * `submit/protein` -> `protein`; anything else (including the placeholder
 * `submit/[kind]`) keeps its whole slot name so it is still recognizable.
 */
function draftLabel(key: string): string {
	const kind = /^submit\/([^/[\]]+)$/.exec(key);
	return kind ? kind[1] : key;
}

/**
 * Summarize every draft slot in this browser, newest first.
 *
 * Used by the "resume a draft" affordance, which needs the slot names without
 * knowing them in advance. Rows that are not a `{ at, values }` record are
 * skipped rather than throwing: a half-written or foreign localStorage slot
 * must not make the draft list unusable.
 */
export function listDrafts(): Array<{ key: string; at: number; label: string }> {
	const ls = storage();
	if (!ls) return [];
	const out: Array<{ key: string; at: number; label: string }> = [];
	try {
		for (let i = 0; i < ls.length; i++) {
			const full = ls.key(i);
			if (!full || !full.startsWith(PREFIX)) continue;
			const raw = ls.getItem(full);
			if (!raw) continue;
			try {
				const parsed = JSON.parse(raw) as Partial<Saved> | null;
				if (!parsed || typeof parsed !== 'object') continue;
				if (typeof parsed.at !== 'number' || !Number.isFinite(parsed.at)) continue;
				if (!parsed.values || typeof parsed.values !== 'object') continue;
				const key = full.slice(PREFIX.length);
				out.push({ key, at: parsed.at, label: draftLabel(key) });
			} catch {
				// malformed JSON: ignore this slot, keep the rest
			}
		}
	} catch {
		return out.sort((a, b) => b.at - a.at);
	}
	return out.sort((a, b) => b.at - a.at);
}
