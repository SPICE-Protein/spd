/**
 * The value coercion shared by every row editor (KVEditor, ObjListEditor,
 * CorrectionItems): a typed string becomes a number/bool/JSON value when it
 * reads as one, and stays a plain string otherwise. `empty` decides what a
 * blank cell means — KVEditor wants `''` (an empty value is a value),
 * ObjListEditor wants `undefined` (the key should drop out).
 */
export function parseVal(s: string, empty: unknown = ''): unknown {
	const t = s.trim();
	if (t === '') return empty;
	if (t === 'true') return true;
	if (t === 'false') return false;
	if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return Number(t);
	if (/^[[{"]/.test(t)) {
		try {
			return JSON.parse(t);
		} catch {
			return s;
		}
	}
	return s;
}

/** Render a stored JSON value back into an editor cell. */
export function cellText(v: unknown): string {
	if (v === undefined || v === null) return v === null ? 'null' : '';
	return typeof v === 'string' ? v : JSON.stringify(v);
}
