"use strict";

const S = { meta: null, principles: [], scopeLabels: {}, coded: [], selectedId: null };

/* ---------- DOM helper (data goes through textContent; html branch unused) ---------- */
function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "title") n.title = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return n;
}
const $ = (id) => document.getElementById(id);
const covOf = (o, pid) => (o.nolan && o.nolan[pid] && o.nolan[pid].covered) || "unknown";
function resolveNolan(o) {
  if (o.coded && o.nolan) return { mode: "own", nolan: o.nolan };
  const u = o.umbrella && S.umbrellas[o.umbrella];
  if (u) return { mode: "inherited", nolan: u.nolan, from: u.name, fromId: o.umbrella, coc: u.coc };
  return { mode: "none", nolan: null };
}
const rCov = (nolan, pid) => (nolan && nolan[pid] && nolan[pid].covered) || "unknown";
const rScore = (nolan) => S.principles.filter((p) => rCov(nolan, p.id) === "yes").length;
function renderPrinciples(nolan) {
  const grid = el("div", { class: "d-princ" });
  S.principles.forEach((p) => {
    const cov = rCov(nolan, p.id);
    grid.appendChild(el("div", { class: "pr" }, [el("span", { class: `dot cov-${cov}` }),
      el("div", {}, [el("b", { text: `${p.name} — ${cov}` }), el("span", { class: "ev", text: (nolan[p.id] && nolan[p.id].evidence) || "" })])]));
  });
  return grid;
}
const scopeClass = (s) => "sc-" + (s && S.scopeLabels[s] !== undefined ? s : (s || "none"));
const scopeLabel = (s) => S.scopeLabels[s] || "Not scoped";
const scoreYes = (o) => S.principles.filter((p) => covOf(o, p.id) === "yes").length;

/* ---------- static renders (whole-dataset context) ---------- */
function renderSnapshot() {
  const m = S.meta;
  const scopeCount = (v) => (m.scopeFacets.find((f) => f.value === v) || {}).count ?? 0;
  const fmt = (n) => (n == null ? "—" : n.toLocaleString("en-GB"));
  const items = [
    ["Organisations", fmt(m.total)],
    ["In scope", fmt(scopeCount("IS"))],
    ["Possibly out", fmt(scopeCount("POS"))],
    ["Nolan assessed", `${fmt(m.assessed != null ? m.assessed : m.coded)} / ${fmt(m.total)}`],
  ];
  $("snapshot").replaceChildren(...items.map(([k, v]) => el("div", {}, [el("dt", { text: k }), el("dd", { text: String(v) })])));
}

function renderScope() {
  const facets = S.meta.scopeFacets;
  const total = facets.reduce((a, f) => a + f.count, 0) || 1;
  const spec = $("scope-spectrum");
  spec.replaceChildren(...facets.map((f) => {
    const w = (f.count / total) * 100;
    return el("div", { class: `seg ${scopeClass(f.value)}`, style: `width:${w}%`, title: `${f.label}: ${f.count.toLocaleString("en-GB")}`,
      text: w > 8 ? f.value || "—" : "" });
  }));
  $("scope-legend").replaceChildren(...facets.map((f) =>
    el("span", {}, [el("i", { class: scopeClass(f.value) }), el("b", { text: f.label }), ` ${f.count.toLocaleString("en-GB")}`])));
  $("scope-hint").textContent = `${total.toLocaleString("en-GB")} organisations, graded from In Scope to out of scope.`;
}

function renderFacet(elId, facets) {
  const max = Math.max(1, ...facets.map((f) => f.count));
  $(elId).replaceChildren(...facets.filter((f) => f.value).map((f) =>
    el("div", { class: "facet-row" }, [
      el("div", { class: "fr-name", text: f.value, title: f.value }),
      el("div", { class: "fr-count", text: f.count.toLocaleString("en-GB") }),
      el("div", { class: "fr-bar" }, [el("b", { style: `width:${(f.count / max) * 100}%` })]),
    ])));
}

function renderPrincipleStrip() {
  const coded = S.coded;
  const n = coded.length || 1;
  $("nolan-strip-tag").textContent = `across ${coded.length} coded exemplars`;
  const rows = S.principles.map((p) => {
    const c = { yes: 0, partial: 0, no: 0, unknown: 0 };
    coded.forEach((o) => { c[covOf(o, p.id)]++; });
    return { p, c };
  });
  rows.sort((a, b) => b.c.yes - a.c.yes || b.c.partial - a.c.partial);
  $("principle-strip").replaceChildren(...rows.map(({ p, c }) => {
    const bar = el("div", { class: "strip-bar", title: `${c.yes} clear, ${c.partial} partial, ${c.no} none` });
    for (const k of ["yes", "partial", "no", "unknown"]) {
      const w = (c[k] / n) * 100;
      if (w > 0) bar.appendChild(el("span", { class: `s-${k}`, style: `width:${w}%` }));
    }
    return el("div", { class: "strip-row" }, [
      el("div", { class: "p-name", text: p.name }), bar, el("div", { class: "p-count", text: `${c.yes}/${coded.length}` })]);
  }));
}

/* ---------- table + detail (per query) ---------- */
function nolanMini(o) {
  const r = resolveNolan(o);
  if (r.mode === "none") return el("span", { class: "nolan-pending", text: "pending" });
  const wrap = el("span", { class: "nolan-mini" });
  S.principles.forEach((p) => wrap.appendChild(el("i", { class: `cov-${rCov(r.nolan, p.id)}`, title: `${p.name}: ${rCov(r.nolan, p.id)}` })));
  wrap.appendChild(el("span", { class: "score", text: `${rScore(r.nolan)}/7` }));
  if (r.mode === "inherited") wrap.appendChild(el("span", { class: "inh-badge", title: `Inherited from ${r.from}`, text: `↳ ${r.fromId}` }));
  return wrap;
}

function renderTable(orgs) {
  const head = $("orgtable-head"), body = $("orgtable-body");
  head.replaceChildren(el("tr", {}, ["Organisation", "Classification", "Category", "Scope", "Nolan (7)"].map((h) => el("th", { text: h }))));
  if (!orgs.length) {
    body.replaceChildren(el("tr", {}, [el("td", { colspan: 5, text: "No organisations match these filters." })]));
    return;
  }
  body.replaceChildren(...orgs.map((o) => {
    const row = el("tr", {
      class: o.id === S.selectedId ? "active" : "", tabindex: "0", role: "button",
      "aria-label": `Show details for ${o.name}`,
      onclick: () => selectOrg(o.id, orgs),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectOrg(o.id, orgs); } },
    });
    row.appendChild(el("td", {}, [el("span", { class: "org-name", text: o.name })]));
    row.appendChild(el("td", { class: "col-muted", text: o.classification || "—" }));
    row.appendChild(el("td", { class: "col-muted", text: o.category || "—" }));
    row.appendChild(el("td", {}, [el("span", { class: `pill ${scopeClass(o.scope)}`, text: o.scope || "—", title: scopeLabel(o.scope) })]));
    row.appendChild(el("td", {}, [nolanMini(o)]));
    return row;
  }));
}

function renderDetail(o) {
  const box = $("detail");
  if (!o) { box.replaceChildren(el("p", { class: "d-empty", text: "Select an organisation to see its scope, classification and Nolan coverage." })); return; }
  const parts = [
    el("h3", { text: o.name }),
    el("p", { class: "d-sub", text: [o.category, o.classification].filter(Boolean).join(" · ") || "—" }),
    el("div", { class: "d-class" }, [
      el("div", { class: "row" }, [el("span", { text: "Scope" }), el("span", { text: `${scopeLabel(o.scope)}${o.scope ? " (" + o.scope + ")" : ""}` })]),
      el("div", { class: "row" }, [el("span", { text: "Classification" }), el("span", { text: o.classification || "—" })]),
      el("div", { class: "row" }, [el("span", { text: "Category" }), el("span", { text: o.category || "—" })]),
    ]),
  ];
  if (o.notes) parts.push(el("p", { class: "d-notes", text: o.notes }));

  const safeUrl = o.url && /^https?:\/\//i.test(o.url) ? o.url : null;
  const r = resolveNolan(o);
  if (r.mode === "own") {
    const coc = el("p", { class: "d-coc" }, [el("b", { text: o.coc.doc_type })]);
    if (safeUrl) { coc.appendChild(document.createTextNode(" · ")); coc.appendChild(el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "source" })); }
    if (o.coc.note) coc.appendChild(el("span", { text: " · " + o.coc.note }));
    parts.push(coc);
    parts.push(el("p", { class: "d-nolan-head", text: `Nolan coverage — ${rScore(r.nolan)}/7 clear` }));
    parts.push(renderPrinciples(r.nolan));
  } else if (r.mode === "inherited") {
    if (safeUrl) parts.push(el("p", { class: "d-coc" }, [el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "Website" })]));
    const box = el("div", { class: "d-inherited" }, [el("b", { text: `Nolan coverage inherited from ${r.from}` }),
      el("span", { text: ` — ${rScore(r.nolan)}/7. Covered by the umbrella code, not assessed individually.` })]);
    if (r.coc && r.coc.url && /^https?:\/\//i.test(r.coc.url)) { box.appendChild(document.createTextNode(" ")); box.appendChild(el("a", { href: r.coc.url, target: "_blank", rel: "noopener", text: "umbrella source" })); }
    parts.push(box);
    parts.push(renderPrinciples(r.nolan));
  } else {
    if (safeUrl) parts.push(el("p", { class: "d-coc" }, [el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "Website" })]));
    parts.push(el("div", { class: "d-pending", text: "Nolan coding pending. The seven-principle assessment fills in as the code-of-conduct review progresses across the register." }));
  }
  box.replaceChildren(...parts);
}

function selectOrg(id, orgs) {
  S.selectedId = id;
  renderTable(orgs);
  renderDetail(orgs.find((o) => o.id === id));
}

/* ---------- query cycle ---------- */
async function refresh() {
  const res = await DataSource.query({
    search: $("search").value, scope: $("f-scope").value,
    classification: $("f-class").value, category: $("f-cat").value,
  });
  const orgs = res.orgs;
  if (S.selectedId && !orgs.some((o) => o.id === S.selectedId)) S.selectedId = null;
  const shown = res.total != null ? res.total : orgs.length;
  $("result-count").textContent = `${shown.toLocaleString("en-GB")}${S.meta.total ? " of " + S.meta.total.toLocaleString("en-GB") : ""} shown`;
  renderTable(orgs);
  renderDetail(S.selectedId ? orgs.find((o) => o.id === S.selectedId) : null);
}

function fillSelect(id, facets, allLabel) {
  const sel = $(id);
  sel.replaceChildren(el("option", { value: "", text: allLabel }));
  facets.filter((f) => f.value).forEach((f) => sel.appendChild(el("option", { value: f.value,
    text: `${f.label || f.value} (${f.count.toLocaleString("en-GB")})` })));
}

function renderLegend() {
  $("nolan-legend").replaceChildren(...[["cov-yes", "clear"], ["cov-partial", "partial"], ["cov-no", "no provision"], ["cov-unknown", "not coded"]]
    .map(([c, l]) => el("span", {}, [el("i", { class: c }), l])));
}

async function boot() {
  const meta = await DataSource.init();
  S.meta = meta; S.principles = meta.principles; S.scopeLabels = meta.scopeLabels; S.umbrellas = meta.umbrellas || {};
  $("subtitle").textContent = meta.note || $("subtitle").textContent;
  $("table-hint").textContent = "Nolan is a seven-dot column: coded directly, inherited from an umbrella code (↳ DfE for schools, ↳ LGA for councils), or pending.";
  $("foot").textContent = `Front end for a Datasette-backed register (${meta.mode} mode). Scope/classification totals are the full dataset; Nolan tags are evidenced from each coded organisation's published code.`;
  renderSnapshot(); renderScope(); renderLegend();
  renderFacet("facet-class", meta.classificationFacets);
  renderFacet("facet-cat", meta.categoryFacets);
  fillSelect("f-scope", meta.scopeFacets, "All scopes");
  fillSelect("f-class", meta.classificationFacets, "All classifications");
  fillSelect("f-cat", meta.categoryFacets, "All categories");
  const all = await DataSource.query({});
  S.coded = all.orgs.filter((o) => o.coded && !o.is_umbrella);
  renderPrincipleStrip();
  $("search").addEventListener("input", refresh);
  ["f-scope", "f-class", "f-cat"].forEach((id) => $(id).addEventListener("change", refresh));
  await refresh();
}

boot().catch((err) => {
  document.querySelector(".wrap").prepend(el("p", { class: "load-error",
    text: `Could not load data (${err.message}). In local mode, serve this folder over HTTP (python3 -m http.server).` }));
});
