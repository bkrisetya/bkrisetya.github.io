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
import os
import sys
import urllib.request

import openpyxl

PINNED_SHA = "d79951ed80f3533729c6e66e3ee49edf297c9e3b"
RAW_URL = "https://raw.githubusercontent.com/ammara-y/PublicAuthorities_Database/{sha}/data.xlsx"

EIC_DIR = "static/eic"

# Editorial layer for bodies with neither an own nor a shared code on the sheet:
# own codes we found ourselves, and bodies whose site we read without finding one.
# Built by ~/src/eic-coc-review/calib/build_tocheck_layer.py.
TOCHECK_REVIEW = "scripts/eic-tocheck-review.json"

# Re-read of the 2,228 stored code links (Fionn-calibrated): for every row judged a code,
# the seven principle ticks and the document actually read replace the scrape's.
# Built by ~/src/eic-coc-review/calib/build_overlay_layer.py.
OVERLAY_REVIEW = "scripts/eic-overlay-review.json"

# Devolved bodies (Scotland, Wales, Northern Ireland). Left off 2 Oct 2026 (England-only cut),
# restored 7 Oct 2026 at Emma's request: the register is UK-wide again. The classification
# file is kept so the England-only cut can be re-applied by setting ENGLAND_ONLY = True.
# Built by ~/src/eic-coc-review/scope/classify.py.
DEVOLVED_SCOPE = "scripts/eic-devolved-excluded.json"
ENGLAND_ONLY = False

# Bodies with no own code that fall under the Cabinet Office Code of Conduct for Board Members
# of Public Bodies (GOV.UK type: department, agency, NDPB or public corporation). Decision
# 2 Oct 2026. Built by ~/src/eic-coc-review/scope/board_code.py.
BOARD_CODE = "scripts/eic-board-code.json"
board_code = json.load(open(BOARD_CODE)) if os.path.exists(BOARD_CODE) else {}

# Councils misfiled upstream by nation (build-only fix; sheet untouched).
CATEGORY_FIX = {
    "Thurrock Council": "Council – other (England)",
    "Newport Town Council, Shropshire": "Council – other (England)",
    # devolved councils filed upstream as "Council – other (England)"
    "Dundee City Council": "Scottish council",
    "Edinburgh City Council": "Scottish council",
    "Ards and North Down Borough Council": "NI Council",
    "Derry City and Strabane District Council": "NI Council",
    "Wrexham County Borough Council": "Welsh council",
    "Buckley Town Council, Flintshire": "Welsh council",
    "Builth Wells Town Council, Powys": "Welsh council",
    "Chirk Town Council, Wrexham": "Welsh council",
    "Flint Town Council, Flintshire": "Welsh council",
    "Milford Haven Town Council, Pembrokeshire": "Welsh council",
    "Neyland Town Council, Pembrokeshire": "Welsh council",
    "New Quay Town Council, Ceredigion": "Welsh council",
    "Shotton Town Council, Flintshire": "Welsh council",
    "Tenby Town Council, Pembrokeshire": "Welsh council",
    # NI councils misfiled upstream as Scottish
    "Causeway Coast and Glens Borough Council": "NI Council",
    "Causeway Coast and Glens District Council": "NI Council",
    # English bodies misfiled upstream as Welsh/Scottish
    "City of Ely Council": "Council – other (England)",
    "Batchworth Community Council": "Council – other (England)",
    "Blakelaw and North Fenham Community Council": "Council – other (England)",
    "Bradford Trident Community Council": "Council – other (England)",
    "Campbell Park Community Council": "Council – other (England)",
    "Great Ashby Community Council": "Council – other (England)",
    "Kennington Community Council": "Council – other (England)",
    "Llanymynech and Pant": "Council – other (England)",
    "Myland Community Council": "Council – other (England)",
    "Queen's Park Community Council": "Council – other (England)",
    "Spooner Row Community Council Parish Council": "Council – other (England)",
    "Walton Community Council": "Council – other (England)",
    "WhitehouseÂ Community Council": "Council – other (England)",
    "Woughton Community Council": "Council – other (England)",
    "Alpraham and Calveley Community Council": "Council – other (England)",
    "Little Bollington with Agden Community Council": "Council – other (England)",
    "Far Cotton and Delapre Community Council": "Council – other (England)",
    "Seaton Valley Community Council": "Council – other (England)",
    "Penryn Town Council": "Council – other (England)",
    "Orchard Park Community Council": "Council – other (England)",
    # an NHS trust, not a policing body
    "Welsh Ambulance Services NHS Trust": "Health and social care",
}

# Devolved umbrella/own-code layer (7 Oct 2026 primary-source pass): replaces
# inappropriate English inheritance (DfE/LGA/NHS/Police) for Scottish, Welsh and
# NI bodies with the verified national or local instrument, or strips it where
# no applicable instrument was verified. Built from
# ~/.hermes/sandbox/eic-devolved-resume/build_assignments.py.
DEVOLVED_ASSIGN = "scripts/eic-devolved-assign.json"
devolved_assign = {}
if os.path.exists(DEVOLVED_ASSIGN):
    devolved_assign = json.load(open(DEVOLVED_ASSIGN))["rows"]

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


def norm_doc_type(s):
    """Fold verbose reviewed doc_type labels onto the register's vocabulary.
    Scrape-derived labels already use Ammara's closed set and are untouched."""
    t = str(s or "").lower()
    for key, val in [
        ("code of ethical conduct", "Code of ethics"),
        ("code of ethics", "Code of ethics"),
        ("code of best practice", "Code of practice"),
        ("code of practice", "Code of practice"),
        ("civil service code", "Civil service code"),
        ("standing orders", "Standing orders"),
        ("terms of reference", "Terms of reference"),
        ("handbook", "Code of practice"),
        ("councillors' code", "Code of conduct"),
        ("code of conduct", "Code of conduct"),
    ]:
        if key in t:
            return val
    return s


def fetch_xlsx(sha):
    url = RAW_URL.format(sha=sha)
    print(f"fetching {url}")
    with urllib.request.urlopen(url) as res:
        return url, io.BytesIO(res.read())


def build(blob, sha, url, existing_meta, fetched_at, review=None, overlay=None, devolved=None):
    review = review or {"own": {}, "checked_none": []}
    overlay = overlay or {}
    overlay_hit = set()
    devolved = devolved or {}
    devolved_seen = set()
    board_seen = set()
    devolved_hit = 0
    review_own, review_none = review["own"], set(review["checked_none"])
    # closed/merged or no website found anywhere: left off the dashboard (user decision 2 Oct 2026)
    review_dropped = set(review.get("dropped", []))
    review_hit = set()
    dropped_hit = 0
    checked_ids = []
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
        if name in devolved:
            devolved_seen.add(name)
            devolved_hit += 1
            continue
        if name in review_dropped and not (bool(d["match"]) and str(d["code_url"] or "").startswith("http")) \
                and not UMBRELLA_BY_CATEGORY.get(canonical_category(d["category"]), ""):
            review_hit.add(name)
            dropped_hit += 1
            continue

        category = CATEGORY_FIX.get(name) or canonical_category(d["category"])
        da = devolved_assign.get(name)
        if da is not None and da.get("drop"):
            dropped_hit += 1
            continue
        no_code_row = da is not None and da.get("no_code")
        umbrella = UMBRELLA_BY_CATEGORY.get(category, "")
        if da is not None:
            umbrella = da.get("umbrella", "")
        if not umbrella and name in board_code:
            umbrella = "CO"
            board_seen.add(name)
        orgs.append([rid, name, category, umbrella])
        cat_counts[category] += 1
        if no_code_row:
            checked_ids.append(rid)
            per_cat[category]["checked"] += 1
            continue

        coded = bool(d["match"]) and str(d["code_url"] or "").startswith("http")
        if coded:
            ov = overlay.get(name)
            if ov:
                overlay_hit.add(name)
                rec = {"id": rid, "name": name, "category": category, "url": d["url"] or ov["url"],
                       "coded": True, "nolan": ov["nolan"],
                       "coc": {"doc_type": norm_doc_type(ov["doc_type"]), "url": ov["url"]}}
                if umbrella:
                    rec["umbrella"] = umbrella
                own.append(rec)
                per_cat[category]["own"] += 1
                continue
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
        elif da is not None and "own" in da:
            x = da["own"]
            review_hit.add(name)  # may also sit in checked_none from the to-check review
            own.append({
                "id": rid,
                "name": name,
                "category": category,
                "url": d["url"] or x["url"],
                "coded": True,
                "nolan": x["nolan"],
                "coc": {"doc_type": x["doc_type"], "url": x["url"]},
                "source": "devolved-review",
            })
            per_cat[category]["own"] += 1
        elif name in review_own:
            x = review_own[name]
            review_hit.add(name)
            own.append({
                "id": rid,
                "name": name,
                "category": category,
                "url": d["url"] or x["url"],
                "coded": True,
                "nolan": x["nolan"],
                "coc": {"doc_type": norm_doc_type(x["doc_type"]), "url": x["url"]},
                "source": "review",
                **({"umbrella": umbrella} if umbrella else {}),
            })
            per_cat[category]["own"] += 1
        elif umbrella:
            if name in review_none:  # re-filed into a shared-code category (CATEGORY_FIX)
                review_hit.add(name)
            per_cat[category]["shared"] += 1
        elif name in review_none:
            review_hit.add(name)
            checked_ids.append(rid)
            per_cat[category]["checked"] += 1
        else:
            per_cat[category]["tocheck"] += 1

    if len(matched_defunct) != len(CURATED_DEFUNCT):
        missing = sorted(set(CURATED_DEFUNCT) - matched_defunct)
        sys.exit(f"ERROR: curated defunct list no longer matches upstream "
                 f"({len(matched_defunct)}/{len(CURATED_DEFUNCT)} hit). Missing: {missing}. "
                 f"Review upstream changes before re-pinning.")

    if set(board_code) - board_seen:
        sys.exit(f"ERROR: {len(set(board_code) - board_seen)} board-code names not on the sheet: "
                 f"{sorted(set(board_code) - board_seen)[:5]}")
    if set(devolved) - devolved_seen:
        sys.exit(f"ERROR: {len(set(devolved) - devolved_seen)} devolved-scope names not on the sheet: "
                 f"{sorted(set(devolved) - devolved_seen)[:5]}")
    if set(overlay) - overlay_hit - devolved_seen:
        miss = set(overlay) - overlay_hit - devolved_seen
        sys.exit(f"ERROR: {len(miss)} re-read codes not found as coded rows: {sorted(miss)[:5]}")
    missing_review = (set(review_own) | review_none | review_dropped) - review_hit - devolved_seen
    if missing_review:
        sys.exit(f"ERROR: {len(missing_review)} reviewed bodies not found as unchecked rows: "
                 f"{sorted(missing_review)[:5]}")

    own_count = len(own)
    shared_count = sum(c["shared"] for c in per_cat.values())
    checked_count = sum(c["checked"] for c in per_cat.values())
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
        "defunctExcluded": master_rows - total - dropped_hit - devolved_hit,
        "noWebsiteExcluded": dropped_hit,
        "devolvedExcluded": devolved_hit,
        "umbrellaScrapeHits": sum(1 for o in own if "umbrella" in o),
        "coverage": {
            "own": own_count,
            "shared": shared_count,
            "checked": checked_count,
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
                "checked": per_cat[c]["checked"],
                "tocheck": per_cat[c]["tocheck"],
                "rest": n - per_cat[c]["own"] - per_cat[c]["shared"] - per_cat[c]["checked"] - per_cat[c]["tocheck"],
            }
            for c, n in cat_counts.most_common()
        ],
        "ownOrgs": own,
        "checkedNone": checked_ids,
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

    with open(TOCHECK_REVIEW) as f:
        review = json.load(f)
    with open(OVERLAY_REVIEW) as f:
        overlay = json.load(f)["rows"]
    devolved = {}
    if ENGLAND_ONLY and os.path.exists(DEVOLVED_SCOPE):
        with open(DEVOLVED_SCOPE) as f:
            devolved = json.load(f)
    orgs, meta = build(blob, args.pin, url, existing, fetched_at, review, overlay, devolved)

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
    stub["meta"].pop("checkedNone", None)
    stub["orgs"] = []
    with open(f"{EIC_DIR}/data.json", "w") as f:
        json.dump(stub, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {len(orgs)} orgs, {len(meta['meta']['ownOrgs'])} own-coded; "
          f"pinned to {args.pin[:8]}, fetched {fetched_at.date()}")


if __name__ == "__main__":
    main()
