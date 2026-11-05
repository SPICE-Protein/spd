# Deployment

The frontend builds with `@sveltejs/adapter-cloudflare` into `.svelte-kit/cloudflare` (`_worker.js` plus static assets). The API is fixed to `https://d-api.spicebio.top` at production build time (`src/lib/api/base.ts`; dev uses an empty base and the Vite proxy).

## Production Pages project (d.spicebio.top)

`spd-front` is a Git-connected Cloudflare Pages project for `SPICE-Protein/spd` on the `main` branch. Cloudflare runs `pnpm build` with Node 22 and pnpm 11.21.0, then publishes `.svelte-kit/cloudflare`. Pushes to `main` build production; other branches produce preview deployments.

Cloudflare Pages still rejects `.top` custom domains, so `d.spicebio.top` is a Worker custom domain (`deploy/pages-router-prod/`) that forwards to `https://spd-front.pages.dev`. The Worker only rewrites the Host; paths, headers, cookies and bodies pass through.

## Current topology (as of 2026-09-30)

```
browser → d-exp.spicebio.top (Worker front door, deploy/pages-router)
              ↓ Cloudflare internal routing
       spd-front-exp.pages.dev (Pages project, manual wrangler pages deploy)
fetch/API → d-api.spicebio.top (CORS allowlist includes d-exp; same-site cookie)
```

**Why the extra front-door Worker:** Cloudflare Pages rejects custom domains on the `.top` TLD (error 8000015, invalid TLD), while Workers custom domains accept them (the `d-api` precedent). `deploy/pages-router/` is a transparent forwarding Worker: it only rewrites the Host and passes method, headers, body and cookies through unchanged.

## Release flow

```bash
# 1) Build
corepack pnpm install && corepack pnpm build

# 2) Push a Pages snapshot (project already exists: spd-front-exp, --production-branch main)
export HTTPS_PROXY=http://127.0.0.1:8889   # local egress proxy; the Cloudflare API needs it
npx wrangler pages deploy .svelte-kit/cloudflare --project-name spd-front-exp --branch main

# 3) Front-door Worker (first deploy, or when routes change)
npx wrangler deploy -c deploy/pages-router/wrangler.toml
```

The Pages project uses the classic pipeline (created with `--force`; the newer "Pages merged into Workers" pipeline reported a missing `worker-configuration.d.ts` for this project).

## GitHub → Pages automatic builds (later)

The repository `SPICE-Protein/spd` has `main` pushed. To connect GitHub later, use the Pages project → Settings → Source. Pushes then build automatically; the front-door Worker and custom domain need no changes because they only reference the pages.dev project name. If reconnecting, use these Pages build settings: build command `pnpm build`, output `.svelte-kit/cloudflare`, Node 22, and Corepack pinned by the `packageManager` field to pnpm@11.21.0.

## Notes

- **Login redirect:** the backend's `begin_orcid_login` now derives `frontend_redirect` from the request Origin (`spd_backend` e7918ef). Origins on the CORS allowlist (including `d-exp`) return to `{origin}/login/callback` after sign-in; other or missing origins fall back to the static `ORCID_FRONTEND_REDIRECT_URI`. Signing in on `d-exp` lands back on `d-exp`.
- The backend CORS allowlist (`SPD_ALLOWED_ORIGINS`) includes `https://d-exp.spicebio.top` and is live with the current `spd-backend` deployment (preflight 204 and mirrored ACAO header verified).
- Pages free-tier daily build limits, workers.dev reachability in mainland China, and related concerns do not affect the production domain: `d-exp` runs entirely through the `spicebio.top` zone on Cloudflare's edge.
