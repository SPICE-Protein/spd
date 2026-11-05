/**
 * "This form was submitted and rejected" — the signal that turns a form's
 * per-field errors on in full.
 *
 * Fields complain inline as soon as they have been touched (see FormFields),
 * but a contributor who hits 提交 with three untouched required boxes must not
 * have to click into each one to learn which were the offenders. `buildSafe`
 * bumps the counter for its values object; FormFields reads it, so every form
 * that validates through buildSafe reveals all of its errors on the first
 * failed submit without a single page having to wire an errors prop.
 */
let version = $state(0);
const attemptedAt = new WeakMap<object, number>();

export function markAttempted(values: object): void {
	version += 1;
	attemptedAt.set(values, version);
}

/** Whether this values object has ever failed a submit (reactive via `version`). */
export function wasAttempted(values: object): boolean {
	void version;
	return attemptedAt.has(values);
}
