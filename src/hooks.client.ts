import { errorLog } from '$lib/state/errors.svelte';
import type { HandleClientError } from '@sveltejs/kit';

// Every component/route-level error SvelteKit sees lands in the in-app log;
// console keeps the full object for devtools (with production sourcemaps).
export const handleError: HandleClientError = ({ error, message }) => {
	errorLog.push('kit', message, error instanceof Error ? (error.stack ?? '') : String(error));
	console.error('[spd]', error);
	return { message };
};
