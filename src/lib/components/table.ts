import type { Snippet } from 'svelte';

export interface Column<Row = Record<string, unknown>> {
	key: string;
	/** pre-localized label; defaults to tr('f_<key>') */
	label?: string;
	/** plain-text formatter (takes precedence over the default preview) */
	format?: (row: Row) => string;
	/** custom markup snippet; takes precedence over format */
	cell?: Snippet<[{ row: Row }]>;
	class?: string;
}
