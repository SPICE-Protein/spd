#!/usr/bin/env python3
"""Fetch Chinese labels for a term list from Wikidata (CC0).

Records, per term, what `wbsearchentities` ranked first for that English name,
the English label the item actually carries, and its Chinese label. The
builder (`build.mjs`) rejects any match whose English label is not the term,
so concept drift is caught downstream instead of being shipped.

    ./fetch_wikidata.py terms.txt out.json

Why not the SPARQL `mwapi` service, which would batch 25 terms per request:
tried it. Its ranking is an entity-search fallback inside the query engine and
it drifts far more often (\"3D-structure\" → \"3D structured illumination
microscope\"). Since drifted matches are discarded anyway, the batched run
answered less per minute than the plain search endpoint. The search endpoint
costs ~1.2 s per term and the run is resumable, so a 1200-term refresh is a
coffee break, not a project.

Outbound traffic honours `https_proxy` (Wikidata is unreachable directly from
this machine). Terms already present in `out.json` are skipped.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

PROXY = os.environ.get("https_proxy") or "http://localhost:8889"
OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})
)
UA = {"User-Agent": "spd-glossary/1.0 (+https://d.spicebio.top; term glosses)"}
API = "https://www.wikidata.org/w/api.php"
PACE = 1.1


def get(url, tries=3):
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with OPENER.open(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001 - 429 and friends are retryable
            last = e
            time.sleep(4 * (attempt + 1))
    raise last


def search(term):
    q = urllib.parse.quote(term)
    url = (
        f"{API}?action=wbsearchentities&search={q}"
        "&language=en&uselang=en&type=item&limit=1&format=json"
    )
    hits = get(url).get("search") or []
    return hits[0]["id"] if hits else None


def labels(ids):
    url = (
        f"{API}?action=wbgetentities&ids={'|'.join(ids)}&props=labels"
        "&languages=en|zh|zh-hans&format=json"
    )
    return get(url).get("entities", {})


def save(path, out):
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def main():
    terms = [
        line.strip()
        for line in open(sys.argv[1], encoding="utf-8")
        if line.strip() and not line.startswith("#")
    ]
    path = sys.argv[2]
    out = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    pending = [t for t in terms if t not in out]
    print(f"{len(terms)} terms, {len(pending)} to fetch", flush=True)

    found = {}
    for i, term in enumerate(pending, 1):
        try:
            qid = search(term)
        except Exception as e:  # noqa: BLE001 - record the miss, keep going
            print(f"  search failed: {term}: {e}", file=sys.stderr, flush=True)
            qid = None
        if qid:
            found[term] = qid
        else:
            out[term] = {"qid": None, "en": "", "zh": ""}
        if i % 40 == 0:
            save(path, out)
            print(f"  searched {i}/{len(pending)}", flush=True)
        time.sleep(PACE)

    ordered = list(found.items())
    for i in range(0, len(ordered), 40):
        chunk = ordered[i : i + 40]
        ents = labels([q for _, q in chunk])
        for term, qid in chunk:
            lb = ents.get(qid, {}).get("labels", {})
            out[term] = {
                "qid": qid,
                "en": lb.get("en", {}).get("value", ""),
                "zh": lb.get("zh-hans", {}).get("value", "")
                or lb.get("zh", {}).get("value", ""),
            }
        save(path, out)
        print(f"  labelled {min(i + 40, len(ordered))}/{len(ordered)}", flush=True)
        time.sleep(0.6)

    got = sum(1 for v in out.values() if v.get("zh"))
    print(f"done: {got}/{len(terms)} terms carry a Chinese label")


main()
