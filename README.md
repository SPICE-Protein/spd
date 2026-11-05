# SPD — SPICE Protein Database

The web frontend for SPD, a protein database that brings together proteins, sequences, structures, folds, wet-lab validations and the catalogs around them.

SPD has two layers that are easy to confuse:

- **The frontend source code** in this repository is open source under the [Apache License 2.0](LICENSE).
- **The biological records** come from public databases and community submissions. They keep the terms of their original sources; the code license does not relicense them. [The license page](src/routes/license/+page.svelte) explains the split and links the sources.

## Stack

SvelteKit 2 with Svelte 5 runes, Tailwind CSS 4, shadcn-svelte, Paraglide for English/Chinese copy, and a Cloudflare Pages adapter. Sequence views use a canvas painter shared with the in-app Seq Viewer. Record pages can open a standalone, A4-friendly print document.

## Development

Requires Node 22+ and pnpm 11 (the version is pinned in `package.json`).

```sh
corepack enable
pnpm install
pnpm dev
```

The dev server proxies API calls to the backend configured in `vite.config.ts`. Production builds target `https://d-api.spicebio.top`; see `src/lib/api/base.ts`.

## Quality gates

```sh
pnpm test
pnpm check
pnpm build
```

## Deployment

The frontend ships as a Cloudflare Pages project behind a small pass-through Worker. Build and release steps, including the experimental `d-exp.spicebio.top` topology, are in [DEPLOY.md](DEPLOY.md).

## Repository

[github.com/SPICE-Protein/spd](https://github.com/SPICE-Protein/spd)
