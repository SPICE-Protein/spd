# SPD — SPICE Protein Database

The web frontend for SPD, a protein database that brings together proteins, sequences, structures, folds, wet-lab validations and the catalogs around them.

SPD has two layers that are easy to confuse:

- **The frontend source code** in this repository is open source under the [Apache License 2.0](LICENSE).
- **The biological records** come from public databases and community submissions. They keep the terms of their original sources; the code license does not relicense them. [The license page](src/routes/license/+page.svelte) explains the split and links the sources.

## Stack

SvelteKit 2 with Svelte 5 runes, Tailwind CSS 4, shadcn-svelte, Paraglide for English/Chinese copy, and a Cloudflare Pages adapter. Sequence views use a canvas painter shared with the in-app Seq Viewer. Record pages can open a standalone, A4-friendly print document.

## MCP

SPD exposes a read-only Model Context Protocol server at:

```text
https://d-mcp.spicebio.top/mcp
```

The transport is Streamable HTTP. The server is a thin facade over the public API: its tools read records and never write or compute. Anonymous clients get the public read tier. For deeper `spd_query` traversals, connect with an API token: sign in at [d.spicebio.top](https://d.spicebio.top), open Account (`/me`), mint a token, then send it as `Authorization: Bearer spd_...`.

Claude Code:

```sh
claude mcp add --transport http spd https://d-mcp.spicebio.top/mcp

# With an API token
claude mcp add --transport http spd https://d-mcp.spicebio.top/mcp \
  --header "Authorization: Bearer spd_..."
```

Most MCP clients accept a configuration entry like this. Drop `headers` for anonymous access; field names vary slightly by client, but the URL and Streamable HTTP transport are the same.

```json
{
  "mcpServers": {
    "spd": {
      "type": "http",
      "url": "https://d-mcp.spicebio.top/mcp",
      "headers": {
        "Authorization": "Bearer spd_..."
      }
    }
  }
}
```

The tools cover search and record reads (`spd_search`, `spd_list_proteins`, `spd_get_protein`, `spd_get_sequence`, `spd_sequence_lineage`, `spd_get_fold`, `spd_fold_history`, `spd_get_environment`, `spd_get_model`, `spd_get_validation`, `spd_get_artifact`, `spd_list_pdb_entries`, `spd_get_pdb_entry`), provenance and schema (`spd_provenance_snapshots`, `spd_schema`), and the graph DSL (`spd_query`).

`spd_query` is the fan-out tool: one call can walk a protein to its sequences and each sequence to its folds. Anonymous access allows depth 2 and a budget of 20; a standard token raises that to depth 3 and 40; an unlimited token allows depth 10 and 2000. `spd_get_artifact` returns metadata only — artifact bytes stay behind the API's presigned downloads.

Example prompts: "Find BRCA1 in SPD and summarize its protein record, sequences, and folds." and "Use spd_query to walk protein → sequences → folds for spd:protein:… and report validation status."

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

Cloudflare Pages builds and deploys `main` on every push. Production: [d.spicebio.top](https://d.spicebio.top).

## Repository

[github.com/SPICE-Protein/spd](https://github.com/SPICE-Protein/spd)
