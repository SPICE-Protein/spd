import type { FormField } from './form';
import { tr, fieldLabel } from '$lib/i18n';
import { markAttempted as markAttempt } from '$lib/state/form-attempts.svelte';

/**
 * Per-field problems, keyed by field name — the map FormFields already knows
 * how to render under each control. Until now a malformed form only produced
 * one banner sentence, which forced people to hunt for the offending box.
 */
export function validateFields(values: Record<string, string>, fields: FormField[]): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const f of fields) {
		const raw = String(values[f.name] ?? '').trim();
		const kind = f.kind ?? 'text';
		if (f.required && kind !== 'checkbox' && raw === '') {
			errors[f.name] = tr('form_field_required');
			continue;
		}
		if (raw === '') continue;
		if (kind === 'number' && !Number.isFinite(Number(raw))) {
			errors[f.name] = tr('form_field_number');
		} else if (kind === 'organism' && !/^[0-9]+$/.test(raw)) {
			// a taxId that is not digits would silently become JSON null at
			// send time — say so where the contributor can see it
			errors[f.name] = tr('form_field_number');
		} else if (kind === 'json' || kind === 'objectList') {
			try {
				JSON.parse(raw);
			} catch {
				errors[f.name] = tr('form_field_json');
			}
		} else if (kind === 'fieldPatch') {
			// A correction must assert SOMETHING: rows with a field name and
			// a present proposed value (blank proposed = "propose empty").
			// Mirrors filings::validate_filing so the form never ships a
			// payload the server would bounce.
			try {
				const arr = JSON.parse(raw) as unknown;
				const ok =
					Array.isArray(arr) &&
					arr.length > 0 &&
					arr.every(
						(r) =>
							!!r &&
							typeof r === 'object' &&
							!Array.isArray(r) &&
							String((r as Record<string, unknown>).field ?? '').trim() !== '' &&
							'proposed' in (r as object)
					);
				if (!ok) errors[f.name] = tr('form_correction_items');
			} catch {
				errors[f.name] = tr('form_correction_items');
			}
		} else if (kind === 'intList') {
			const bad = raw
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
				.some((s) => !Number.isInteger(Number(s)));
			if (bad) errors[f.name] = tr('form_field_int_list');
		}
	}
	return errors;
}

/**
 * Coerce the string-valued form state into a JSON body per field spec.
 * Empty optional fields are dropped entirely — SPD's strict design records
 * reject unknown top-level keys, and empty strings fail typed validators.
 */
export function buildBody(
	values: Record<string, string>,
	fields: FormField[]
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const f of fields) {
		// String() because `<input type="number" bind:value>` writes a NUMBER back
		// into this string-indexed state (Svelte reads valueAsNumber), so a filled
		// number field would otherwise crash every form on `.trim()`.
		const raw = String(values[f.name] ?? '').trim();
		const kind = f.kind ?? 'text';
		if (kind === 'organism') {
			// organism is settled before the empty-skip: name-without-taxId
			// still counts in paired mode (the behavior the two flat fields
			// had before NCBI resolution folded them into one control); the
			// throwaway name of an id-only organism never reaches the body
			const nm = f.companion ? String(values[f.companion] ?? '').trim() : '';
			if (raw === '' && nm === '') continue;
			out[f.name] = raw ? Number(raw) : null;
			if (f.companion) out[f.companion] = nm || null;
			continue;
		}
		if (raw === '') {
			if (f.required && kind !== 'checkbox') out[f.name] = kind === 'number' ? undefined : '';
			continue;
		}
		switch (kind) {
			case 'number':
				out[f.name] = Number(raw);
				break;
			case 'checkbox':
				out[f.name] = raw === 'true';
				break;
			case 'json':
			case 'objectList':
				out[f.name] = JSON.parse(raw);
				break;
			case 'fieldPatch': {
				// CorrectionItems already serializes only complete rows; the
				// filter here is the same guarantee re-asserted for callers
				// that seed the value programmatically (admin edit dialogs).
				const arr = JSON.parse(raw) as Array<Record<string, unknown>>;
				out[f.name] = arr.filter((r) => String(r?.field ?? '').trim() !== '');
				break;
			}
			case 'list':
			// a picked file list is the same comma-joined wire string the
			// old hand-typed list produced — UploadPicker writes selections
			// into it, so coercion stays one branch
			case 'multiPick':
				out[f.name] = raw
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean);
				break;
			case 'intList':
				out[f.name] = raw
					.split(',')
					.map((s) => Number(s.trim()))
					.filter((n) => Number.isInteger(n));
				break;
			default:
				out[f.name] = raw;
		}
	}
	return out;
}

/**
 * Validate + build in one pass. `errors` is the per-field map for inline
 * rendering; `error` stays the single sentence for callers that only show a
 * banner, so no existing page regresses while new pages adopt the map.
 */
export function buildSafe(
	values: Record<string, string>,
	fields: FormField[]
): { body?: Record<string, unknown>; error?: string; errors: Record<string, string> } {
	const errors = validateFields(values, fields);
	const first = Object.keys(errors)[0];
	if (first) {
		// FormFields reads this to light up every offending box, not just the
		// ones the contributor happens to have tabbed through.
		markAttempt(values);
		return { errors, error: `${fieldLabel(first)}: ${errors[first]}` };
	}
	try {
		return { body: buildBody(values, fields), errors };
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e), errors };
	}
}
