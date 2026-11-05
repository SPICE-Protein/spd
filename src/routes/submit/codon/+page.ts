import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

/**
 * The route used to be `/submit/codon` while every other door — the API, the
 * browse tile, the detail pages — says codon-usage. People naturally type the
 * matching one, so keep the short path as a redirect instead of a 404.
 */
export function load() {
	redirect(308, resolve('/submit/codon-usage'));
}
