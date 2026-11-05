import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';

// Dev-only: with the client BASE_URL left empty, /api requests hit this vite
// origin; proxy them to a local `wrangler dev` (or SPD_API_TARGET=… to point
// elsewhere). Production deploys either set BASE_URL to the API origin or
// reverse-proxy /api through the frontend host.
const API_TARGET = process.env.SPD_API_TARGET ?? 'http://localhost:8787';

export default defineConfig({
	// Error logs from d-exp arrive with real frames: the browser resolves the
	// minified stack through the uploaded .map files.
	build: {
		sourcemap: true
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true
		})
	],
	server: {
		proxy: {
			'/api': { target: API_TARGET, changeOrigin: true },
			// backend Redoc HTML lives at the root, not under /api/v1
			'/docs': { target: API_TARGET, changeOrigin: true }
		}
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						// The machine ships Edge, not Playwright's bundled
						// Chromium: browser tests ride the installed channel
						// instead of downloading another browser.
						provider: playwright({ launchOptions: { channel: 'msedge' } }),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
