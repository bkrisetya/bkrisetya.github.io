"use strict";

/* Pure data shaping for the EIC dashboard. No DOM, no fetch — unit-testable in Node.
 * Everything the page draws comes out of these functions. */

const PRINCIPLE_IDS = ["selflessness", "integrity", "objectivity", "accountability", "openness", "honesty", "leadership"];

/* Plain-English display labels for the upstream register's own category names.
 * Heatmap rows only — filtering still keys on the original category. */
const CATEGORY_LABELS = {
  "Education": "Schools & colleges",
  "Parish Council or Meeting": "Parish Council",
  "Council – other (England)": "Other councils (England)",
  "Welsh council": "Councils (Wales)",
  "Health and social care": "Health & social care",
  "Emergency services": "Police & fire services",
  "Advisory, regulatory, investigatory": "Regulators & watchdogs",
  "Justice, prosecutorial and enforcement": "Justice & prosecution",
};

function scoreOf(nolan) {
  return PRINCIPLE_IDS.reduce((a, p) => a + ((nolan && nolan[p] && nolan[p].covered === "yes") ? 1 : 0), 0);
}

function heroNumbers(meta) {
  const cov = meta.coverage || {};
  const shared = cov.shared || 0, own = cov.own || 0, tocheck = cov.tocheck || 0;
  const rest = (cov.periphery_out || 0) + (cov.notscoped || 0);
  return { total: meta.total, shared, own, tocheck, reconciles: meta.total === shared + own + tocheck + rest };
}

function scoreDistribution(ownOrgs, shared) {
  const bins = Array.from({ length: 8 }, (_, i) => ({ score: i, count: 0 }));
  (ownOrgs || []).forEach((o) => { bins[scoreOf(o.nolan)].count++; });
  /* shared: rows of { nolan, bodies } — bodies under a shared sector code count
   * with that code's coverage (scrape-wins already applied by safetyNetRows). */
  (shared || []).forEach((s) => { if (s.bodies > 0) bins[scoreOf(s.nolan)].count += s.bodies; });
  return bins;
}

/* Four human bands for the waffle: none / a couple / some / nearly all. */
function scoreBands(ownOrgs, shared) {
  const bins = scoreDistribution(ownOrgs, shared);
  const at = (i) => bins[i].count;
  return [
    { label: "None", count: at(0) },
    { label: "1–2", count: at(1) + at(2) },
    { label: "3–5", count: at(3) + at(4) + at(5) },
    { label: "6–7", count: at(6) + at(7) },
  ];
}

function principleBars(ownOrgs, principles, shared) {
  const rows = (principles || []).map((p) => ({ id: p.id, name: p.name, yes: 0, partial: 0, no: 0, unknown: 0 }));
  (ownOrgs || []).forEach((o) => {
    rows.forEach((r) => { const c = (o.nolan && o.nolan[r.id] && o.nolan[r.id].covered) || "unknown"; r[c]++; });
  });
  (shared || []).forEach((s) => {
    if (!(s.bodies > 0)) return;
    rows.forEach((r) => { const c = (s.nolan && s.nolan[r.id] && s.nolan[r.id].covered) || "unknown"; r[c] += s.bodies; });
  });
  rows.sort((a, b) => a.yes - b.yes || b.no - a.no || a.name.localeCompare(b.name)); // weakest first
  return rows;
}

/* Cells exist only where at least one coded org exists; missing cell = "no codes read yet".
 * Sectors with 1..HEATMAP_FOLD_MIN-1 coded orgs are pooled into a single "Others" row
 * (kept last, before zero-coded rows) so every visible cell rests on decent evidence.
 * A named long-tail category can also be forced into Others when a standalone row
 * adds clutter without adding useful evidence. */
const HEATMAP_FOLD_MIN = 25;
const HEATMAP_FOLD_NAMES = new Set(["Business and development"]);

function heatmap(ownOrgs, categoryNames, principles, shared) {
  const cols = (principles || []).map((p) => ({ id: p.id, name: p.name }));
  const cells = new Map();
  const codedByCat = {};
  (ownOrgs || []).forEach((o) => {
    const cat = o.category || "Other";
    codedByCat[cat] = (codedByCat[cat] || 0) + 1;
    cols.forEach((c) => {
      const key = cat + "|" + c.id;
      if (!cells.has(key)) cells.set(key, { yes: 0, partial: 0, no: 0, unknown: 0, total: 0 });
      const cell = cells.get(key);
      cell[(o.nolan && o.nolan[c.id] && o.nolan[c.id].covered) || "unknown"]++;
      cell.total++;
    });
  });
  /* shared: { catName: { nolan, bodies } } — bodies under a sector's shared code
   * count with that code's coverage. Own-coded bodies are already counted above
   * (scrape-wins), so callers must pass shared bodies net of own-coded ones. */
  if (shared) {
    Object.entries(shared).forEach(([cat, s]) => {
      if (!(s.bodies > 0)) return;
      cols.forEach((c) => {
        const key = cat + "|" + c.id;
        if (!cells.has(key)) cells.set(key, { yes: 0, partial: 0, no: 0, unknown: 0, total: 0 });
        const cell = cells.get(key);
        cell[(s.nolan && s.nolan[c.id] && s.nolan[c.id].covered) || "unknown"] += s.bodies;
        cell.total += s.bodies;
      });
    });
  }
  cells.forEach((cell) => { cell.share = cell.total ? cell.yes / cell.total : null; });
  const sharedBodies = (name) => (shared && shared[name] && shared[name].bodies) || 0;
  const all = (categoryNames || []).map((name) => ({ name, label: CATEGORY_LABELS[name] || name, coded: codedByCat[name] || 0, bodies: (codedByCat[name] || 0) + sharedBodies(name), cats: [name] }))
    .sort((a, b) => b.bodies - a.bodies || a.name.localeCompare(b.name)); // bodies == coded in the individual lens; shared sectors float up in the shared lens
  const keep = all.filter((r) => !HEATMAP_FOLD_NAMES.has(r.name) && r.coded >= HEATMAP_FOLD_MIN);
  const fold = all.filter((r) => HEATMAP_FOLD_NAMES.has(r.name) || (r.coded > 0 && r.coded < HEATMAP_FOLD_MIN));
  const zero = all.filter((r) => !HEATMAP_FOLD_NAMES.has(r.name) && r.coded === 0 && r.bodies === 0);
  const sharedOnly = all.filter((r) => !HEATMAP_FOLD_NAMES.has(r.name) && r.coded === 0 && r.bodies > 0);
  if (fold.length < 2 && !fold.some((r) => HEATMAP_FOLD_NAMES.has(r.name))) return { rows: all, cols, cells, unit: shared ? "bodies" : "codes" };
  const pooled = { name: "Others", coded: 0, bodies: 0, cats: [] };
  fold.forEach((r) => {
    pooled.coded += r.coded;
    pooled.bodies += r.bodies;
    pooled.cats.push(r.name);
    cols.forEach((c) => {
      const key = "Others|" + c.id;
      if (!cells.has(key)) cells.set(key, { yes: 0, partial: 0, no: 0, unknown: 0, total: 0, note: "Sectors with few codes read, grouped together." });
      const dst = cells.get(key), src = cells.get(r.name + "|" + c.id) || { yes: 0, partial: 0, no: 0, unknown: 0, total: 0 };
      ["yes", "partial", "no", "unknown"].forEach((k) => { dst[k] += src[k]; });
      dst.total += src.total;
    });
  });
  cols.forEach((c) => { const cell = cells.get("Others|" + c.id); cell.share = cell.total ? cell.yes / cell.total : null; });
  return { rows: [...keep, pooled, ...sharedOnly, ...zero], cols, cells, unit: shared ? "bodies" : "codes" };
}

/* Scrape-wins: a body whose own code has been read counts under its own code,
 * not under the umbrella. bodies = umbrella rows − own-coded orgs in that umbrella. */
function safetyNetRows(umbrellas, orgRows, ownOrgs) {
  const counts = {};
  (orgRows || []).forEach((r) => { if (r[3]) counts[r[3]] = (counts[r[3]] || 0) + 1; });
  const ownByUmb = {};
  (ownOrgs || []).forEach((o) => { if (o.umbrella) ownByUmb[o.umbrella] = (ownByUmb[o.umbrella] || 0) + 1; });
  return Object.entries(umbrellas || {})
    .map(([id, u]) => ({ id, name: u.name || id, bodies: (counts[id] || 0) - (ownByUmb[id] || 0), allSeven: scoreOf(u.nolan) === 7, nolan: u.nolan || null, strength: u.strength || null, basis: u.basis || null, source: u.source || null }))
    .sort((a, b) => b.bodies - a.bodies);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PRINCIPLE_IDS, CATEGORY_LABELS, HEATMAP_FOLD_MIN, HEATMAP_FOLD_NAMES, scoreOf, heroNumbers, scoreDistribution, scoreBands, principleBars, heatmap, safetyNetRows };
}
if (typeof window !== "undefined") window.Aggregates = { PRINCIPLE_IDS, CATEGORY_LABELS, HEATMAP_FOLD_MIN, HEATMAP_FOLD_NAMES, scoreOf, heroNumbers, scoreDistribution, scoreBands, principleBars, heatmap, safetyNetRows };
