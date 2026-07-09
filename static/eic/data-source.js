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
 * ==========================================================================*/

const DATA_CONFIG = {
  mode: "local", // "local" | "datasette"

  local: { url: "./sample.json" },

  datasette: {
    baseUrl: "", // e.g. "https://data.krisetya.com"   <-- fill in
    database: "", // e.g. "public_authorities"          <-- fill in
    table: "", // e.g. "organisations"                  <-- fill in
    pageSize: 100,
    // dashboard field -> Datasette column name
    columns: {
      id: "rowid",
      name: "name",
      classification: "classification",
      category: "category",
      scope: "scope",
      url: "url",
      notes: "notes",
      nolanAll: "NP_all",
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
  POS: "Possibly Out of Scope",
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
    if (["0", "n", "no", "false"].includes(v)) return "no";
    return v ? "yes" : "unknown";
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
    return {
      id: String(row[c.id] ?? row.rowid ?? row[c.name]),
      name: row[c.name] || "",
      classification: row[c.classification] || "",
      category: row[c.category] || "",
      scope: row[c.scope] || "",
      url: row[c.url] || "",
      notes: row[c.notes] || "",
      coded: anyCoded,
      nolan: anyCoded ? nolan : null,
      coc: null,
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

  return { init, query, debugUrls, config: cfg };
})();

if (typeof module !== "undefined" && module.exports) module.exports = { DataSource, DATA_CONFIG };
