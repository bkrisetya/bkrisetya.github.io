#!/usr/bin/env python3
"""Regenerate the EIC dashboard's data files from the upstream register,
pinned to a fixed upstream commit.

Upstream: github.com/ammara-y/PublicAuthorities_Database (data.xlsx).
Pinned SHA is recorded in data-meta.json (meta.upstream) together with the
fetch timestamp, so every build states exactly which snapshot it reflects.

Usage:
    python3 scripts/regen-eic-data.py            # fetch pinned snapshot, rebuild JSONs
    python3 scripts/regen-eic-data.py --check    # rebuild and diff against current
                                                 # files without writing (drift check)
    python3 scripts/regen-eic-data.py --pin SHA  # build against a different commit
                                                 # (review the diff, then update
                                                 # PINNED_SHA below in the same commit)

What is regenerated:  meta counts/facets/coverage, ownOrgs, data-orgs.json,
                      and the compact data.json fallback stub.
What is preserved:    principles, scope_labels, umbrellas — the umbrella
                      codings and their statutory provenance are OUR editorial
                      layer, hand-authored, and never touched by this script.
"""

import argparse
import collections
import datetime
import io
import json
import sys
import urllib.request

import openpyxl

PINNED_SHA = "d79951ed80f3533729c6e66e3ee49edf297c9e3b"
RAW_URL = "https://raw.githubusercontent.com/ammara-y/PublicAuthorities_Database/{sha}/data.xlsx"

EIC_DIR = "static/eic"

# Ammara's 10 Sep snapshot already removes defunct bodies upstream.
CURATED_DEFUNCT = []

# Our sector -> shared-code mapping (NOT part of the upstream dataset).
# Provenance for each umbrella lives in the preserved `umbrellas` block.
UMBRELLA_BY_CATEGORY = {
    "Education": "DfE",
    "Parish Council or Meeting": "LGA",
    "Council – other (England)": "LGA",
    "Welsh council": "LGA",
    "Health and social care": "NHS",
    "Emergency services": "Police",
}

# Canonical category names, as shipped. The upstream sheet is not careful
# about case or trailing spaces ("Welsh Council", "Emergency services "),
# so lookup is normalised; anything unmapped fails loudly for review.
CANONICAL_CATEGORIES = [
    "Advisory, regulatory, investigatory",
    "Business and development",
    "Charity",
    "Council – other (England)",
    "Economic or financial",
    "Education",
    "Emergency services",
    "Energy, power and utilities",
    "Environment and agriculture",
    "Government, constitutional, administrative",
    "Health and social care",
    "Housing and communities",
    "Justice, prosecutorial and enforcement",
    "Media, culture and sport",
    "Military and security services",
    "NI Council",
    "Parish Council or Meeting",
    "Science, research and innovation",
    "Scottish council",
    "Transport and infrastructure",
    "Welsh council",
]
_CATEGORY_LOOKUP = {" ".join(c.lower().split()): c for c in CANONICAL_CATEGORIES}
_CATEGORY_LOOKUP["parish council"] = "Parish Council or Meeting"


def canonical_category(raw):
    key = " ".join(str(raw or "").lower().split())
    if key not in _CATEGORY_LOOKUP:
        sys.exit(f"ERROR: upstream category {raw!r} has no canonical mapping. "
                 f"Review upstream changes before re-pinning.")
    return _CATEGORY_LOOKUP[key]

PRINCIPLE_COLS = [
    "NP_selflessness", "NP_integrity", "NP_objectivity", "NP_accountability",
    "NP_openness", "NP_honesty", "NP_leadership",
]


def fetch_xlsx(sha):
    url = RAW_URL.format(sha=sha)
    print(f"fetching {url}")
    with urllib.request.urlopen(url) as res:
        return url, io.BytesIO(res.read())


def build(blob, sha, url, existing_meta, fetched_at):
    wb = openpyxl.load_workbook(blob, read_only=True)
    ws = wb["Sheet1"]
    it = ws.iter_rows(values_only=True)
    header = [str(c) for c in next(it)]
    master_rows = ws.max_row - 1

    defunct = set(CURATED_DEFUNCT)
    matched_defunct = set()
    orgs, own = [], []
    cat_counts = collections.Counter()
    per_cat = collections.defaultdict(lambda: collections.Counter())
    scraped_dates = set()

    for i, r in enumerate(it, start=1):
        d = dict(zip(header, r))
        rid = f"sheet{i}"
        scope = str(d["scope"] or "").strip()
        name = str(d["name"] or "").strip()
        scraped = d.get("scraped_date")
        if scraped:
            try:
                if isinstance(scraped, datetime.datetime):
                    scraped_dates.add(scraped.date())
                elif isinstance(scraped, datetime.date):
                    scraped_dates.add(scraped)
                else:
                    scraped_dates.add(datetime.date.fromisoformat(str(scraped).strip()[:10]))
            except ValueError:
                sys.exit(f"ERROR: invalid scraped_date {scraped!r} for {name!r}.")

        # exclusion: out-of-scope scopes + the curated defunct list
        if scope in ("NA", ""):
            continue
        if name in defunct:
            matched_defunct.add(name)
            continue

        umbrella = UMBRELLA_BY_CATEGORY.get(canonical_category(d["category"]), "")
        category = canonical_category(d["category"])
        orgs.append([rid, name, category, umbrella])
        cat_counts[category] += 1

        coded = bool(d["match"]) and str(d["code_url"] or "").startswith("http")
        if coded:
            if all(str(d[c]) == "not located" for c in PRINCIPLE_COLS):
                nolan = "u" * 7  # code found, principle text unreadable
            else:
                nolan = "".join("y" if str(d[c]) == "Y" else "n" for c in PRINCIPLE_COLS)
            rec = {
                "id": rid,
                "name": name,
                "category": category,
                "url": d["url"] or d["code_url"],
                "coded": True,
                "nolan": nolan,
                "coc": {
                    "doc_type": (lambda s: s[:1].upper() + s[1:])(str(d["match"]).split(";")[0].strip()),
                    "url": d["code_url"],
                },
            }
            if umbrella:
                rec["umbrella"] = umbrella
            own.append(rec)
            per_cat[category]["own"] += 1
        elif umbrella:
            per_cat[category]["shared"] += 1
        else:
            per_cat[category]["tocheck"] += 1

    if len(matched_defunct) != len(CURATED_DEFUNCT):
        missing = sorted(set(CURATED_DEFUNCT) - matched_defunct)
        sys.exit(f"ERROR: curated defunct list no longer matches upstream "
                 f"({len(matched_defunct)}/{len(CURATED_DEFUNCT)} hit). Missing: {missing}. "
                 f"Review upstream changes before re-pinning.")

    own_count = len(own)
    shared_count = sum(c["shared"] for c in per_cat.values())
    tocheck_count = sum(c["tocheck"] for c in per_cat.values())
    total = len(orgs)
    if len(scraped_dates) > 1:
        sys.exit(f"ERROR: multiple scraped dates in upstream snapshot: {sorted(scraped_dates)}")
    snapshot_date = next(iter(scraped_dates), fetched_at.date())
    snapshot = snapshot_date.strftime("%-d %B %Y")

    meta = dict(existing_meta)  # shallow copy; hand-authored blocks preserved
    meta["meta"] = {
        "total": total,
        "in_scope": total,
        "out_of_scope": 0,
        "snapshot": snapshot,
        "correctAsOf": snapshot,
        "allInScope": True,
        "scopeDropped": True,
        "master": {
            "path": url,
            "rows": master_rows,
            "columns": header,
        },
        "upstream": {
            "repo": "ammara-y/PublicAuthorities_Database",
            "sha": sha,
            "url": url,
            "fetched_at": fetched_at.isoformat(timespec="seconds"),
        },
        "defunctExcluded": master_rows - total,
        "umbrellaScrapeHits": sum(1 for o in own if "umbrella" in o),
        "coverage": {
            "own": own_count,
            "shared": shared_count,
            "tocheck": tocheck_count,
            "periphery_out": 0,
            "notscoped": 0,
        },
        "scopeFacets": [{"value": "IS", "label": "In scope", "count": total}],
        "categoryFacets": [
            {"value": c, "label": c, "count": n}
            for c, n in cat_counts.most_common()
        ],
        "coverageByCategory": [
            {
                "name": c,
                "total": n,
                "own": per_cat[c]["own"],
                "shared": per_cat[c]["shared"],
                "tocheck": per_cat[c]["tocheck"],
                "rest": n - per_cat[c]["own"] - per_cat[c]["shared"] - per_cat[c]["tocheck"],
            }
            for c, n in cat_counts.most_common()
        ],
        "ownOrgs": own,
    }
    return orgs, meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="diff against current files without writing")
    ap.add_argument("--pin", default=PINNED_SHA, help="upstream commit SHA")
    args = ap.parse_args()

    fetched_at = datetime.datetime.now().astimezone()
    url, blob = fetch_xlsx(args.pin)

    with open(f"{EIC_DIR}/data-meta.json") as f:
        existing = json.load(f)
    for key in ("principles", "scope_labels", "umbrellas"):
        if key not in existing:
            sys.exit(f"ERROR: existing data-meta.json lacks hand-authored "
                     f"'{key}' block; refusing to regenerate without it.")

    orgs, meta = build(blob, args.pin, url, existing, fetched_at)

    if args.check:
        with open(f"{EIC_DIR}/data-orgs.json") as f:
            cur_orgs = json.load(f)
        cur_meta = existing["meta"]
        new_meta = meta["meta"]
        print(f"data-orgs.json identical: {orgs == cur_orgs}")
        print(f"ownOrgs identical: {new_meta['ownOrgs'] == cur_meta['ownOrgs']}")
        for key in ("total", "defunctExcluded", "umbrellaScrapeHits",
                    "coverage", "scopeFacets", "categoryFacets",
                    "coverageByCategory"):
            same = new_meta[key] == cur_meta[key]
            print(f"meta.{key} identical: {same}")
            if not same:
                print(f"  current: {json.dumps(cur_meta[key])[:200]}")
                print(f"  rebuilt: {json.dumps(new_meta[key])[:200]}")
        return

    # data-orgs.json: compact, ASCII-escaped, no trailing newline (as shipped)
    with open(f"{EIC_DIR}/data-orgs.json", "w") as f:
        json.dump(orgs, f, separators=(",", ":"))
    # data-meta.json: indent=1, raw UTF-8, trailing newline (as shipped)
    with open(f"{EIC_DIR}/data-meta.json", "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
        f.write("\n")
    stub = dict(meta)
    stub["meta"] = dict(meta["meta"])
    stub["meta"].pop("ownOrgs", None)
    stub["orgs"] = []
    with open(f"{EIC_DIR}/data.json", "w") as f:
        json.dump(stub, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {len(orgs)} orgs, {len(meta['meta']['ownOrgs'])} own-coded; "
          f"pinned to {args.pin[:8]}, fetched {fetched_at.date()}")


if __name__ == "__main__":
    main()
