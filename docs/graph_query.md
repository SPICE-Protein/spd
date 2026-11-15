# Graph query

`POST /api/v1/query`, wrapped by the MCP tool `spd_query`. One call composes many record reads: a root record, the records it points at, and the records those point at, each projected exactly as its own detail endpoint projects it.

Everything below was measured against the running API on 2026-11-15; the numbers in the examples are what the service actually returned.

## When to use it

| What you need | Tool |
|---|---|
| One record | `spd_entity` |
| Another tab of a record (annotations, regions, suppliers, reviews, …) | `spd_entity_part` |
| Everything connected to one record, both directions | `spd_relations` |
| Many records of one kind | `spd_list`, `spd_search` |
| A record **and** its children **and** their children, in one round trip | `spd_query` |

`spd_query` is the only tool that walks more than one hop, and the only one that batches many roots. If you already know the record ids, prefer `roots` over N calls.

## Request

```json
{ "root": { "type": "protein", "id": "spd:protein:9c2d74a0712947dfb8c19fae57177371" } }
```

Exactly one of `root` or `roots`. `roots` takes at most 25 entries and the whole batch shares one budget and one result entry per root.

A node spec has four fields:

| Field | Meaning |
|---|---|
| `type` | Node type, from the list below. Required on every node. |
| `id` | SPD public id (`spd:…`) or internal id. Required on every node. |
| `select` | Record fields to keep, validated against the record's own projected keys. Omit for the whole record. |
| `expand` | Map of edge name → child node spec. Omit for no expansion. |
| `limit` | How many children a **list edge** keeps. Default 20, clamped to 1–100. |

A root additionally accepts `source`; a child node spec must not carry it (the API rejects it as an unknown field).

## Node types

`artifact`, `biobrick`, `cell-line`, `environment`, `enzyme`, `fold`, `gene`, `model`, `pathway`, `protein`, `reaction`, `reagent`, `restriction-enzyme`, `sequence`, `strain`, `validation`, `vector`.

Not node types: `pdb-entry` (use `spd_get_pdb_entry`), `gene-region` (use `spd_entity_part` with `part: "regions"`).

An unknown type answers 400 and lists all 17 legal spellings. Spellings are hyphenated (`cell-line`, `restriction-enzyme`) — the same vocabulary `spd_relations` and typed search use.

## Edges

| Node | Edge | Returns | Cost |
|---|---|---|---|
| `gene` | `proteins` | Distinct proteins named by the gene's regions, walked as nodes | 1 + 1 per protein |
| `protein` | `sequences` | The protein's sequences, walked as nodes | 1 + 1 per sequence |
| `sequence` | `protein` | The protein it belongs to, walked | 1 |
| `sequence` | `parent` | The sequence it was mutated from, walked | 1 |
| `sequence` | `folds` | Predicted folds, walked | 1 + 1 per fold |
| `fold` | `sequence` / `environment` / `model` | The related record, walked | 1 each |
| `fold` | `artifacts` | Artifact rows, plus an `artifactsMissing` sibling for ids that no longer resolve | 1 + 1 per artifact |
| `fold` | `validations` | Wet-lab validations, walked | 1 + 1 per validation |
| `fold` | `assessment` | The fold's assessment object, not a node | 1 |
| `validation` | `fold` | The fold under review, walked | 1 |
| `validation` | `reviews`, `screeningEvents` | Rows already carried by the node's own fetch | 0 |
| `pathway` | `reactions` | Step reactions in pathway order, walked | 1 + 1 per reaction |
| `reaction` | `pathways` | Pathways whose steps name this reaction, walked | 1 + 1 per pathway |
| every type | `relations` | Edge rows, not nodes: `{fromType, fromId, toType, toId, relationType}` | 1 + 1 per row |

Two kinds of edge behave differently, and the difference matters:

- **Walked edges** (`gene.proteins`, `protein.sequences`, `sequence.protein`, `sequence.parent`, `sequence.folds`, `fold.sequence`, `fold.environment`, `fold.model`, `fold.validations`, `pathway.reactions`, `reaction.pathways`, `validation.fold`) descend into a real node. `select`, `expand` and depth/budget accounting all apply to the child spec.
- **Value edges** (`relations`, `artifacts`, `assessment`, `reviews`, `screeningEvents`) hand back rows or one object. A child spec under them is ignored — you cannot expand a relation row into the record it names. Read the row's `toId`/`fromId` and query it as a root if you need it.

## Semantics

**`select`** filters the record's own keys, after validating them: an unknown field answers 400 with the available keys for that node. `select` does not suppress expansions; `{"select": ["id"], "expand": {...}}` returns the id plus the expanded edges. Validation is per record instance, so in a batch every record must carry every selected key.

**`limit`** is read from the node that owns the list edge, not from the child spec. `{"limit": 3, "expand": {"relations": {}}}` keeps 3 rows; putting `limit` inside `{"relations": {"limit": 2}}` changes nothing (measured: still 5 rows). A node with two list edges uses the same limit for both.

**Depth** counts ancestors: the root is depth 0. A node whose depth equals the tier's ceiling is refused, so `anonymous` (ceiling 2) can read a root and its children but not grandchildren. The check runs when a node is actually walked — an empty list never trips it.

**Budget** is charged once per node fetch, once per list fetch, once per walked child, once per value row, and once per `assessment`. Memoization is keyed by `type|id` as you spelled the id, so a record reached twice costs once. Examples, measured on the live API:

- protein with one sequence: `budgetUsed` 3 (root 1 + list 1 + sequence 1)
- protein with one sequence and no folds: 4
- protein with 5 relation rows: 7
- two `roots` naming the same protein: 1

**Cycles** are refused, not silently cut: walking back into an ancestor answers 400 `cycle detected: pathway/… is its own ancestor via reaction/…`. Plan trees, or make the loop the outermost call.

**Ordering** is deterministic: expansion keys follow a sorted map, list order is the repository's own order (newest first for folds).

## Response

```json
{
  "results": [ { "id": "...", "name": "...", "sequences": [ ... ] } ],
  "tier": "anonymous",
  "budgetMax": 20,
  "budgetUsed": 3,
  "importBudgetMax": 2,
  "importsUsed": 0,
  "imported": []
}
```

Inside the standard `{data, meta, error}` envelope. `spd_query` over MCP returns `data` — the object above, without the envelope.

`results` has one entry per root, in request order. Each entry is the record with the expanded edges added as extra keys.

## Tiers

| Tier | How | Depth | Budget | Imports per query |
|---|---|---|---|---|
| `anonymous` | no credentials | 2 | 20 | 2 |
| `standard` | session cookie, or a standard token | 3 | 40 | 5 |
| `unlimited` | an `unlimited` API token | 10 | 2000 | 25 |

The MCP server forwards an `Authorization: Bearer spd_…` header verbatim; without one you are anonymous. A token that fails authentication is a hard 401 — a revoked credential never degrades into anonymous reads. Tokens are minted at `POST /api/v1/user/me/api-tokens`.

## External roots

A root whose `id` is not an SPD public id is resolved through the federation first, and the walk continues from the resulting record:

| `source` | Imports |
|---|---|
| `uniprot` | `protein` |
| `ncbi` | `gene` |
| `cellosaurus` | `cell-line` |
| `pubchem` | `reagent` |
| `rhea` | `reaction` |
| `reactome` | `pathway` (and the reactions its step projection materializes) |
| `brenda` | `enzyme` |
| `pdb` | nothing (`pdb-entry` is not a node type) |

Omit `source` and a protein root is tried as a UniProt accession when the id looks like one (6–10 alphanumerics, letter first, at least one digit). Everything else needs `source` spelled out, because an NCBI accession and a gene symbol are the same kind of string.

An address that is already indexed is resolved from the ledger: it costs nothing extra and appears nowhere in `imported`. A real import costs 5 resolution units, counts against the per-query import cap, and is reported in `imported` as `{source, externalId, publicId, created}`. Edge expansion never imports — only an external root does. One upstream address can anchor only one SPD record, so a collision answers 400 and names the record that already exists.

## Examples

All verified against production on 2026-11-15.

A protein, its sequences, and every fold of each sequence — the fan-out this tool exists for:

```json
{ "root": { "type": "protein", "id": "spd:protein:9c2d74a0712947dfb8c19fae57177371",
  "select": ["id", "preferredName", "organism"],
  "expand": { "sequences": { "select": ["id", "length", "sequenceType"],
    "expand": { "folds": { "select": ["id", "sequenceSha256", "createdAt"] } } } } } }
```

A gene and the proteins its CDS regions name:

```json
{ "root": { "type": "gene", "id": "spd:gene:…",
  "expand": { "proteins": { "select": ["id", "preferredName"] } } } }
```

A pathway's reactions, cheap enough for the anonymous tier:

```json
{ "root": { "type": "pathway", "id": "spd:pathway:ede94bca9c1540168706aa33fa5c76da",
  "select": ["id", "name"], "limit": 10,
  "expand": { "reactions": { "select": ["id", "name", "equation"] } } } }
```

Many ids in one call, sharing the budget:

```json
{ "roots": [
  { "type": "protein", "id": "spd:protein:…", "select": ["id", "preferredName"] },
  { "type": "protein", "id": "spd:protein:…", "select": ["id", "preferredName"] } ] }
```

An upstream accession that SPD may not hold yet:

```json
{ "root": { "type": "protein", "id": "P00698", "select": ["id", "preferredName"] } }
```

## Errors

Every error is 400 with a sentence that names the fix.

| Message | Cause |
|---|---|
| `unknown node type pdb-entry; legal types: …` | Node type not in the vocabulary |
| `unknown edge protein.sequence; legal edges: sequences, relations` | Edge name typo, or an edge that type does not have |
| `unknown field {field} for node protein; available: …` | `select` key the record does not carry |
| `query depth limit 2 reached at fold/spd:fold:…` | Deeper than the tier allows |
| `query resolution budget exceeded (20); shrink expand depth/limits or use an unlimited token` | Over budget |
| `cycle detected: pathway/spd:pathway:… is its own ancestor via reaction/spd:reaction:…` | The tree walked back into an ancestor |
| `provide exactly one of root or a non-empty roots array` | Both or neither |
| `roots must not exceed 25 entries` | Batch too large |
| `root \`X\` is not an SPD public id; pass a \`source\` to resolve it from a catalog` | External id without a source |
| `source \`pdb\` imports no graph node type; address the imported record by its SPD id` | PDB cannot anchor a walk |
| `source \`uniprot\` imports \`protein\` records, so it cannot resolve a \`gene\` root` | Source/node mismatch |
| `Failed to deserialize the JSON body … unknown field \`source\`, expected one of \`select\`, \`expand\`, \`limit\`` | `source` on a child node spec |

## Sharp edges

- `limit` on the child spec does nothing; put it on the node whose edge you are expanding.
- `relations` rows cannot be expanded into nodes. They are the cheapest way to see what touches a record; a second query is the way to read the far side.
- `fold.artifacts` adds a sibling key `artifactsMissing` when an artifact id no longer resolves. Do not read the tree as complete without checking it.
- Depth and budget failures happen when the node is reached, so a query that fits today can fail tomorrow when the data grows a level.
- One record can be addressed by public id or internal id; the memo key is the spelling you used, so mixing spellings pays twice.
- A graph query is read-only. Upstream imports are the one write it can cause, and only from an external root.
