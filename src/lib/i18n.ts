/**
 * Translation helper layered on paraglide.
 *
 * Static chrome uses generated `m.key()` directly. For the long tail of dynamic
 * labels (enum values, wire field names) we look messages up by key at runtime;
 * missing keys fall back to a humanized form of the key so the UI never renders
 * raw identifiers. Every fallback-worthy key should get zh+en entries in
 * messages/*.json over time.
 */
import { getLocale } from '$lib/paraglide/runtime';
import * as messages from '$lib/paraglide/messages';

export function humanize(key: string): string {
	const spaced = key
		.replace(/^f_/,'')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** tr('nav_home') → message if present, else English humanization. */
export function tr(key: string, args?: Record<string, string | number>): string {
	const fn = (messages as unknown as Record<string, ((a?: Record<string, unknown>) => string) | undefined>)[key];
	if (!fn) return humanize(key);
	try {
		return fn(args);
	} catch {
		return humanize(key);
	}
}

/** Localized label for an enum/vocabulary value: message `<ns>_<value>` else humanized value. */
export function enumLabel(ns: string, value: string | null | undefined): string {
	if (value == null || value === '') return '—';
	const key = `${ns}_${value.replace(/[^A-Za-z0-9_-]/g, '_')}`;
	const fn = (messages as unknown as Record<string, (() => string) | undefined>)[key];
	return fn ? fn() : humanize(value);
}

export function fieldLabel(key: string): string {
	const direct = (messages as unknown as Record<string, (() => string) | undefined>)[`f_${key}`];
	if (direct) return direct();
	return humanize(key);
}

export function isZh(): boolean {
	return getLocale() === 'zh';
}
