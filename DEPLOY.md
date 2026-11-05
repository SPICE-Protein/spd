# Deployment

The frontend builds with `@sveltejs/adapter-cloudflare` into `.svelte-kit/cloudflare` (`_worker.js` plus static assets). The API is fixed to `https://d-api.spicebio.top` at production build time (`src/lib/api/base.ts`; dev uses an empty base and the Vite proxy).

## Production (d.spicebio.top)

```
browser → d.spicebio.top (Worker front door, deploy/pages-router-prod)
              ↓ Cloudflare internal routing
       spd-front.pages.dev (Git-connected Pages project)
fetch/API → d-api.spicebio.top (CORS allowlist includes d; same-site cookie)
```

`spd-front` is a Cloudflare Pages project connected to `SPICE-Protein/spd` on the `main` branch. Cloudflare runs `pnpm build` with Node 22 and pnpm 11.21.0, then publishes `.svelte-kit/cloudflare`. Pushes to `main` build production; other branches produce preview deployments.

Cloudflare Pages still rejects `.top` custom domains, so `d.spicebio.top` is a Worker custom domain that forwards to `https://spd-front.pages.dev`. The Worker only rewrites the Host; paths, headers, cookies and bodies pass through.

The root `wrangler.toml` is the Pages build configuration and enables `nodejs_compat`. `wrangler.worker.jsonc` is the separate local Worker configuration used by `pnpm preview` and `pnpm deploy`.

## Staging (d-exp.spicebio.top)

```
browser → d-exp.spicebio.top (Worker front door, deploy/pages-router)
              ↓ Cloudflare internal routing
       spd-front-exp.pages.dev (Pages project, manual wrangler pages deploy)
fetch/API → d-api.spicebio.top (CORS allowlist includes d-exp; same-site cookie)
```

**Why the extra front-door Worker:** Cloudflare Pages rejects custom domains on the `.top` TLD (error 8000015, invalid TLD), while Workers custom domains accept them (the `d-api` precedent). `deploy/pages-router/` is a transparent forwarding Worker: it only rewrites the Host and passes method, headers, body and cookies through unchanged.

## Staging release flow

```bash
# 1) Build
corepack pnpm install && corepack pnpm build

# 2) Push a Pages snapshot (project already exists: spd-front-exp, --production-branch main)
export HTTPS_PROXY=http://127.0.0.1:8889   # local egress proxy; the Cloudflare API needs it
npx wrangler pages deploy .svelte-kit/cloudflare --project-name spd-front-exp --branch main

# 3) Front-door Worker (first deploy, or when routes change)
npx wrangler deploy -c deploy/pages-router/wrangler.toml
```

The staging Pages project uses the classic pipeline (created with `--force`; the newer "Pages merged into Workers" pipeline reported a missing `worker-configuration.d.ts` for this project).

## Production CI

Pushing to `main` in `SPICE-Protein/spd` triggers the Pages build automatically. The Pages project uses this build configuration:

- Build command: `pnpm build`
- Output directory: `.svelte-kit/cloudflare`
- Root directory: repository root
- Node: 22
- pnpm: 11.21.0
- Compatibility flags: `nodejs_compat`

Redeploy the production front-door Worker only when its route or target changes:

```bash
npx wrangler deploy -c deploy/pages-router-prod/wrangler.toml
```

## Notes

- **Login redirect:** the backend's `begin_orcid_login` derives `frontend_redirect` from the request Origin (`spd_backend` e7918ef). Origins on the CORS allowlist return to `{origin}/login/callback` after sign-in; other or missing origins fall back to the static `ORCID_FRONTEND_REDIRECT_URI`.
- The backend CORS allowlist (`SPD_ALLOWED_ORIGINS`) includes `https://d.spicebio.top` and `https://d-exp.spicebio.top`. Both preflight and actual API requests mirror the Origin and allow credentials.
- Pages free-tier daily build limits, workers.dev reachability in mainland China, and related concerns do not affect the production domain: `d.spicebio.top` runs entirely through the `spicebio.top` zone on Cloudflare's edge.
