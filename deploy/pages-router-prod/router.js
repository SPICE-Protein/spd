/**
 * Transparent proxy: d.spicebio.top -> spd-front.pages.dev.
 * Only the Host is rewritten; method/headers/body/cookies pass through, and
 * the Pages asset+function pipeline answers on the far side.
 */
export default {
	/**
	 * @param {Request} request
	 * @param {{ PAGES_ORIGIN: string }} env
	 */
	async fetch(request, env) {
		const target = new URL(request.url);
		target.hostname = new URL(env.PAGES_ORIGIN).hostname;
		target.protocol = 'https:';
		return fetch(new Request(target, request));
	}
};
