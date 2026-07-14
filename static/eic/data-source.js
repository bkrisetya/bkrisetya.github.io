"use strict";

/* ============================================================================
 * DATA SOURCE ADAPTER
 * The dashboard talks ONLY to DataSource.{init,query}. Two interchangeable
 * modes implement the same interface:
 *
 *   mode:"local"      -> bundled sample.json (used for the demo now)
 *   mode:"datasette"  -> a live Datasette instance (flip to this once you have
 *                        the base URL / database / table)
 *
 * To go live: fill DATA_CONFIG.datasette.{baseUrl,database,table}, set mode
 * to "datasette", and (on the Datasette side) run it with `--cors` so the
 * dashboard on krisetya.com can fetch it cross-origin. Nothing else changes.
 *
 * PRE-STAGED 2026-07-11 to Ammara's agreed column schema (match / level /
 * code_url / NP_* as Y-N / NP_all / NP_score). Before cutover, confirm with
 * Ammara:
 *   (a) her DB carries the master-list `scope` column (IS/POS/LIS/LOOS/NA) -
 *       it is NOT in her scraper column list, but the dashboard's Q1 and the
 *       scope facet/filter need it;
 *   (b) type-of-body vs sector - she has ONE `category`; the dashboard splits
 *       classification (type of body) from category (sector). Currently both
 *       read her `category` (see columns.classification below);
 *   (c) umbrella codings loaded into datasette.umbrellas so DfE/LGA/NHS/Police
 *       inheritance works in datasette mode (bug #2).
 * ==========================================================================*/

const DATA_CONFIG = {
  mode: "local", // "local" | "datasette"

  local: { url: "./data.json?v=20260714c" }, // bump ?v on every deploy so HTML, code and data move as one locked set // 13 Jul 2026 snapshot from Ammara's backend data.db (Datasette Lite exposes no server API, so the snapshot is bundled; datasette mode below is for a future hosted instance)

  datasette: {
    baseUrl: "", // e.g. "https://data.krisetya.com"   <-- fill in
    database: "", // e.g. "public_authorities"          <-- fill in
    table: "", // e.g. "organisations"                  <-- fill in
    pageSize: 100,
    // umbrella inheritance: schools -> DfE, councils -> LGA. Paste umbrella codings into `umbrellas` to enable inheritance in datasette mode.
    umbrellaByCategory: { "Education": "DfE", "Parish Council": "LGA", "Town Council": "LGA", "City Council": "LGA", "Borough Council": "LGA", "County Council": "LGA", "District Council": "LGA", "Welsh Council": "LGA", "Parish Meeting": "LGA", "Council": "LGA", "Combined Authority": "LGA", "Health and social care": "NHS", "Emergency services": "Police" },
    umbrellas: {},
    // dashboard field -> Datasette column name (Ammara's agreed schema, Emma-revised, accepted 11 Jul 2026)
    columns: {
      id: "rowid",
      name: "name",
      category: "category", // Ammara: type/sector (e.g. Local government, Regulators, Health and social care)
      classification: "category", // CONFIRM: Ammara has ONE `category`; dashboard splits type-of-body vs sector. Reusing `category` until she confirms a separate field.
      scope: "scope", // master-list public-authority scope IS/POS/LIS/LOOS/NA. CONFIRM: not in Ammara's scraper columns; her DB must carry it for Q1/scope facet.
      level: "level", // umbrella vs individual (LGA/DfE/NHS/Police). Was `scope` in Ammara's first draft.
      match: "match", // which CoC term matched (e.g. "Code of Conduct", "Ministerial Code"). Was `source` in Ammara's first draft.
      codeUrl: "code_url", // scraped direct link to the code document
      url: "url",
      notes: "notes", // optional; not in Ammara's list
      nolanAll: "NP_all", // Y/N meets all 7
      nolanScore: "NP_score", // 0-7 count of clear hits
      nolan: {
        selflessness: "NP_selflessness",
        integrity: "NP_integrity",
        objectivity: "NP_objectivity",
        accountability: "NP_accountability",
        openness: "NP_openness",
        honesty: "NP_honesty",
        leadership: "NP_leadership",
      },
    },
  },
};

const SCOPE_LABELS_FALLBACK = {
  IS: "In Scope",
  LIS: "Likely In Scope",
  POS: "Periphery/proximity of scope",
  LOOS: "Likely Out Of Scope",
  NA: "Not Applicable",
  "": "Not yet scoped",
};

const PRINCIPLES_FALLBACK = [
  { id: "selflessness", name: "Selflessness", def: "Act solely in the public interest." },
  { id: "integrity", name: "Integrity", def: "Avoid obligations that could influence official duties." },
  { id: "objectivity", name: "Objectivity", def: "Make choices on merit and evidence." },
  { id: "accountability", name: "Accountability", def: "Be accountable and submit to scrutiny." },
  { id: "openness", name: "Openness", def: "Be as open as possible about decisions and actions." },
  { id: "honesty", name: "Honesty", def: "Be truthful." },
  { id: "leadership", name: "Leadership", def: "Promote and support these principles by example." },
];

const DataSource = (() => {
  const cfg = DATA_CONFIG;
  let _cache = null; // local mode: the whole sample.json

  const normCov = (v) => {
    v = String(v).toLowerCase().trim();
    if (["1", "y", "yes", "true", "clear", "explicit"].includes(v)) return "yes";
    if (["p", "partial", "part", "0.5"].includes(v)) return "partial";
    if (["0", "n", "no", "false", "none"].includes(v)) return "no";
    // "not located" / blank / anything unrecognised -> unknown (never silently "yes")
    return "unknown";
  };

  function mapDatasetteRow(row) {
    const c = cfg.datasette.columns;
    const nolan = {};
    let anyCoded = false;
    for (const [pid, col] of Object.entries(c.nolan)) {
      const raw = row[col];
      if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
        anyCoded = true;
        nolan[pid] = { covered: normCov(raw), evidence: "" };
      } else {
        nolan[pid] = { covered: "unknown", evidence: "" };
      }
    }
    const match = row[c.match], codeUrl = row[c.codeUrl], level = row[c.level];
    const UMBRELLA_LEVELS = ["DfE", "LGA", "NHS", "Police"];
    // Synthesise a code-of-conduct object from Ammara's match/code_url columns so
    // codeCell/renderDetail (which deref o.coc) do not throw (was coc:null, bug #1).
    // Y/N Nolan does not reveal whether the code NAMES the seven principles, so
    // explicit_seven_ref stays null (unknown).
    const coc = (match || codeUrl) ? { doc_type: match || "Code of conduct", url: codeUrl || "", explicit_seven_ref: null } : null;
    return {
      id: String(row[c.id] ?? row.rowid ?? row[c.name]),
      name: row[c.name] || "",
      classification: row[c.classification] || "",
      category: row[c.category] || "",
      scope: row[c.scope] || "",
      level: level || "",
      url: row[c.url] || "",
      notes: row[c.notes] || "",
      coded: anyCoded,
      nolan: anyCoded ? nolan : null,
      // Prefer the row's own coding; otherwise inherit from an umbrella. `level`
      // names the umbrella directly (LGA/DfE/NHS/Police); fall back to category mapping.
      umbrella: (level && UMBRELLA_LEVELS.includes(level)) ? level
        : ((["IS", "LIS"].includes(row[c.scope]) ? (cfg.datasette.umbrellaByCategory || {})[row[c.category]] : null) || null),
      coc,
      nolanAll: row[c.nolanAll],
      nolanScore: row[c.nolanScore],
    };
  }

  function facetUrl() {
    const d = cfg.datasette, c = d.columns;
    return `${d.baseUrl}/${d.database}/${d.table}.json?_size=0` +
      `&_facet=${encodeURIComponent(c.scope)}` +
      `&_facet=${encodeURIComponent(c.classification)}` +
      `&_facet=${encodeURIComponent(c.category)}`;
  }

  function queryUrl({ search = "", scope = "", classification = "", category = "", page = 0 } = {}) {
    const d = cfg.datasette, c = d.columns;
    const p = new URLSearchParams();
    p.set("_shape", "array");
    p.set("_size", String(d.pageSize));
    if (search) p.set("_search", search);
    if (scope) p.set(`${c.scope}__exact`, scope);
    if (classification) p.set(`${c.classification}__exact`, classification);
    if (category) p.set(`${c.category}__exact`, category);
    if (page) p.set("_offset", String(page * d.pageSize));
    return `${d.baseUrl}/${d.database}/${d.table}.json?${p.toString()}`;
  }

  async function init() {
    if (cfg.mode === "local") {
      const r = await fetch(cfg.local.url);
      if (!r.ok) throw new Error(`sample.json ${r.status}`);
      _cache = await r.json();
      const m = _cache.meta;
      return {
        mode: "local",
        total: m.total, coded: m.coded, snapshot: m.snapshot, note: m.note,
        scopeFacets: m.scope_facets,
        classificationFacets: m.classification_facets,
        categoryFacets: m.category_facets,
        scopeLabels: _cache.scope_labels || SCOPE_LABELS_FALLBACK,
        principles: _cache.principles || PRINCIPLES_FALLBACK,
        umbrellas: _cache.umbrellas || {},
        assessed: m.assessed, inherited_total: m.inherited_total,
      };
    }
    // datasette
    const r = await fetch(facetUrl());
    if (!r.ok) throw new Error(`datasette facets ${r.status}`);
    const j = await r.json();
    const fr = j.facet_results || {};
    const toFacets = (key) => (fr[key]?.results || []).map((x) => ({ value: String(x.value ?? ""), count: x.count }));
    const scopeFacets = toFacets(cfg.datasette.columns.scope)
      .map((f) => ({ ...f, label: SCOPE_LABELS_FALLBACK[f.value] || f.value }));
    return {
      mode: "datasette",
      total: j.filtered_table_rows_count ?? j.table_rows_count ?? null,
      coded: null, snapshot: "live", note: "Live Datasette data.",
      scopeFacets,
      classificationFacets: toFacets(cfg.datasette.columns.classification),
      categoryFacets: toFacets(cfg.datasette.columns.category),
      scopeLabels: SCOPE_LABELS_FALLBACK,
      principles: PRINCIPLES_FALLBACK,
      umbrellas: cfg.datasette.umbrellas || {},
      assessed: null, inherited_total: null,
    };
  }

  async function query(opts = {}) {
    if (cfg.mode === "local") {
      const { search = "", scope = "", classification = "", category = "" } = opts;
      let list = _cache.orgs.slice();
      const q = search.trim().toLowerCase();
      if (q) list = list.filter((o) => `${o.name} ${o.category} ${o.classification}`.toLowerCase().includes(q));
      if (scope) list = list.filter((o) => o.scope === scope);
      if (classification) list = list.filter((o) => o.classification === classification);
      if (category) list = list.filter((o) => o.category === category);
      return { orgs: list, total: list.length, hasMore: false };
    }
    const url = queryUrl(opts);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`datasette query ${r.status}`);
    const arr = await r.json();
    return { orgs: arr.map(mapDatasetteRow), total: null, hasMore: arr.length >= cfg.datasette.pageSize, url };
  }

  // Smoke-test URL construction without a live instance (used in debug).
  function debugUrls() {
    return { facet: facetUrl(), query: queryUrl({ search: "council", scope: "IS", page: 1 }) };
  }

  return { init, query, debugUrls, mapRow: mapDatasetteRow, config: cfg };
})();

if (typeof module !== "undefined" && module.exports) module.exports = { DataSource, DATA_CONFIG };
