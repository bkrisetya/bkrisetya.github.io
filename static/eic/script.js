"use strict";

const S = { meta: null, principles: [], scopeLabels: {}, umbrellas: {}, coded: [], selectedId: null, page: 0 };
const PAGE_SIZE = 12;
const NAVY_RAMP = ["#1b2c49","#23395d","#31517d","#456a99","#5f80ac","#8098c0","#a6b6d2","#c9d3e2"];
const TEAL_RAMP = ["#0f4a47","#146b66","#197d78","#38928a","#5aa69d","#82bab2","#aacfc9","#d3e2de"];

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
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
const fmt = (n) => (n == null ? "-" : n.toLocaleString("en-GB"));

const OUT_OF_SCOPE = ["POS", "LOOS", "NA"];
const SCOPE_SHORT = { IS: "In scope", LIS: "Likely in", POS: "Periphery", LOOS: "Likely out", NA: "Not applicable", "": "Not yet scoped" };
const UMBRELLA_SHORT = { DfE: "the DfE code for schools", LGA: "the LGA code for councils", NHS: "the NHS code", Police: "the College of Policing code" };
const humanCov = (c) => ({ yes: "covered", partial: "partly covered", no: "not covered", unknown: "not checked" }[c] || c);
const scopeClass = (s) => "sc-" + (s && S.scopeLabels[s] !== undefined ? s : (s || "none"));

function resolveNolan(o) {
  if (o.coded && o.nolan) return { mode: "own", nolan: o.nolan, coc: o.coc };
  const u = o.umbrella && S.umbrellas[o.umbrella];
  if (u) return { mode: "inherited", nolan: u.nolan, from: u.name, fromId: o.umbrella, coc: u.coc };
  if (OUT_OF_SCOPE.includes(o.scope)) return { mode: "na", nolan: null };
  return { mode: "none", nolan: null };
}
const rCov = (n, pid) => (n && n[pid] && n[pid].covered) || "unknown";
const rScore = (n) => S.principles.filter((p) => rCov(n, p.id) === "yes").length;

/* ---------- summary: the three questions ---------- */
function renderSummary() {
  const m = S.meta;
  const scope = (v) => (m.scopeFacets.find((f) => f.value === v) || {}).count || 0;
  $("q1-figure").textContent = `${fmt(scope("IS"))} in scope`;
  $("q1-note").textContent = `of ${fmt(m.total)} bodies. ${fmt(scope("POS"))} are on the periphery of scope, and ${fmt(scope(""))} are not yet scoped.`;

  const codes = [...S.coded, ...Object.values(S.umbrellas)];
  const explicit = codes.filter((c) => (c.coc && c.coc.explicit_seven_ref) === true).length;
  const cov = m.coverage || {};
  $("q2-figure").textContent = `${fmt(codes.length)} codes read`;
  $("q2-note").textContent = `${fmt(cov.own)} bodies' own codes, plus ${Object.keys(S.umbrellas).length} shared sector codes that cover ${fmt(cov.shared)} schools, councils, health and police bodies. All ${explicit} shared codes name the seven principles.`;

  const counts = S.principles.map((p) => ({ p, yes: S.coded.filter((o) => rCov(o.nolan, p.id) === "yes").length }));
  counts.sort((a, b) => a.yes - b.yes);
  const weak = counts[0], strong = counts[counts.length - 1];
  $("q3-figure").textContent = `${weak.p.name} is left out most`;
  $("q3-note").textContent = `Nearly every code covers ${strong.p.name.toLowerCase()}; ${weak.p.name.toLowerCase()} is the one codes most often miss.`;
}

/* ---------- table: one row answers all three ---------- */
function scopePill(o) {
  return el("span", { class: `pill ${scopeClass(o.scope)}`, text: SCOPE_SHORT[o.scope] || "Not scoped" });
}
function codeCell(o) {
  const r = resolveNolan(o);
  if (r.mode === "na") return el("span", { class: "muted-cell", text: o.scope === "POS" ? "Periphery of scope" : "Out of scope" });
  if (r.mode === "none") return el("span", { class: "muted-cell", text: "Not checked yet" });
  const e7 = r.mode === "own" ? (o.coc ? o.coc.explicit_seven_ref : null) : true;
  const name = r.mode === "own" ? o.coc.doc_type : `Covered by ${UMBRELLA_SHORT[r.fromId] || r.fromId}`;
  const cell = el("span", { class: "code-cell" }, [el("span", { class: "code-name", text: name })]);
  if (e7 === true) cell.appendChild(el("span", { class: "code-badge exp", text: "names the principles" }));
  else if (e7 === false) cell.appendChild(el("span", { class: "code-badge imp", text: "doesn't name them" }));
  return cell;
}
function nolanCell(o) {
  const r = resolveNolan(o);
  if (r.mode === "na") return el("span", { class: "muted-cell", text: "-" });
  if (r.mode === "none") return el("span", { class: "muted-cell", text: "not checked" });
  const wrap = el("span", { class: "nolan-mini" });
  S.principles.forEach((p) => wrap.appendChild(el("i", { class: `cov-${rCov(r.nolan, p.id)}`, title: `${p.name}: ${humanCov(rCov(r.nolan, p.id))}` })));
  wrap.appendChild(el("span", { class: "score", text: `${rScore(r.nolan)} of 7` }));
  return wrap;
}
function renderTable(orgs) {
  const head = $("orgtable-head"), body = $("orgtable-body");
  head.replaceChildren(el("tr", {}, ["Organisation", "In scope?", "Their code", "Seven principles"].map((h) => el("th", { text: h }))));
  if (!orgs.length) { body.replaceChildren(el("tr", {}, [el("td", { colspan: 4, text: "Nothing matches that search." })])); return; }
  body.replaceChildren(...orgs.map((o) => {
    const row = el("tr", {
      class: o.id === S.selectedId ? "active" : "", tabindex: "0", role: "button",
      "aria-label": `See details for ${o.name}`,
      onclick: () => selectOrg(o.id, orgs),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectOrg(o.id, orgs); } },
    });
    row.appendChild(el("td", {}, [el("span", { class: "org-name", text: o.name })]));
    row.appendChild(el("td", {}, [scopePill(o)]));
    row.appendChild(el("td", {}, [codeCell(o)]));
    row.appendChild(el("td", {}, [nolanCell(o)]));
    return row;
  }));
}

/* ---------- detail ---------- */
function principleList(nolan) {
  const grid = el("div", { class: "d-princ" });
  S.principles.forEach((p) => {
    const cov = rCov(nolan, p.id);
    grid.appendChild(el("div", { class: "pr" }, [el("span", { class: `dot cov-${cov}` }),
      el("div", {}, [el("b", { text: `${p.name}: ${humanCov(cov)}` }), el("span", { class: "ev", text: (nolan[p.id] && nolan[p.id].evidence) || "" })])]));
  });
  return grid;
}
function renderDetail(o) {
  const box = $("detail");
  if (!o) { box.replaceChildren(el("p", { class: "d-empty", text: "Pick an organisation to see whether it is a public authority, what code it has, and how well the code follows the seven principles." })); return; }
  const parts = [
    el("h3", { text: o.name }),
    el("p", { class: "d-sub", text: [o.category, o.classification].filter(Boolean).join(" · ") || "-" }),
    el("div", { class: "d-class" }, [
      el("div", { class: "row" }, [el("span", { text: "In scope?" }), el("span", { text: S.scopeLabels[o.scope] || "Not yet scoped" })]),
      el("div", { class: "row" }, [el("span", { text: "Type of body" }), el("span", { text: o.classification || "-" })]),
      el("div", { class: "row" }, [el("span", { text: "Sector" }), el("span", { text: o.category || "-" })]),
    ]),
  ];
  if (o.notes) parts.push(el("p", { class: "d-notes", text: o.notes }));
  const safeUrl = o.url && /^https?:\/\//i.test(o.url) ? o.url : null;
  const r = resolveNolan(o);
  if (r.mode === "own") {
    const codeUrl = o.coc && o.coc.url && /^https?:\/\//i.test(o.coc.url) ? o.coc.url : null;
    const coc = el("p", { class: "d-coc" }, [el("b", { text: `Their code: ${o.coc.doc_type}` })]);
    if (codeUrl) { coc.appendChild(document.createTextNode(" ")); coc.appendChild(el("a", { href: codeUrl, target: "_blank", rel: "noopener", text: "read it" })); }
    parts.push(coc);
    if (safeUrl) parts.push(el("p", { class: "d-coc" }, [el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "Website" })]));
    if (o.coc.explicit_seven_ref === true) parts.push(el("p", { class: "d-coc", text: "This code names the seven principles." }));
    else if (o.coc.explicit_seven_ref === false) parts.push(el("p", { class: "d-coc", text: "This code does not name the seven principles." }));
    if (o.coc.note) parts.push(el("p", { class: "d-notes", text: o.coc.note }));
    parts.push(el("p", { class: "d-nolan-head", text: `Follows ${rScore(r.nolan)} of the 7 principles` }));
    parts.push(principleList(r.nolan));
  } else if (r.mode === "inherited") {
    if (safeUrl) parts.push(el("p", { class: "d-coc" }, [el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "Website" })]));
    const box2 = el("div", { class: "d-inherited" }, [el("b", { text: `Covered by ${UMBRELLA_SHORT[r.fromId] || r.from}.` }),
      el("span", { text: ` We have not read this body's own code; it falls under the shared code, which follows ${rScore(r.nolan)} of the 7 principles.` })]);
    if (r.coc && r.coc.url && /^https?:\/\//i.test(r.coc.url)) { box2.appendChild(document.createTextNode(" ")); box2.appendChild(el("a", { href: r.coc.url, target: "_blank", rel: "noopener", text: "read the shared code" })); }
    parts.push(box2);
    parts.push(principleList(r.nolan));
  } else if (r.mode === "na") {
    if (safeUrl) parts.push(el("p", { class: "d-coc" }, [el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "Website" })]));
    parts.push(el("div", { class: "d-pending", text: o.scope === "POS"
      ? "This body sits on the periphery of scope, so we have not checked its code against the seven principles yet. That changes if it is brought fully into scope."
      : "This body looks to be out of scope, so we have not checked its code against the seven principles. That changes if it is brought into scope." }));
  } else {
    if (safeUrl) parts.push(el("p", { class: "d-coc" }, [el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "Website" })]));
    parts.push(el("div", { class: "d-pending", text: "We have not checked this body's code yet. It is in scope, so it is on the list to look at." }));
  }
  box.replaceChildren(...parts);
}

/* ---------- lens 1: why hard to place ---------- */
function renderMatrix() {
  const q = (cls, label) => el("div", { class: `quad ${cls}`, text: label });
  $("pa-matrix").replaceChildren(
    el("span", { class: "axis y-top", text: "Public function" }),
    el("span", { class: "axis y-bot", text: "No public function" }),
    el("span", { class: "axis x-left", text: "Privately funded" }),
    el("span", { class: "axis x-right", text: "Publicly funded" }),
    q("q-tl", "Public function, private funding: often borderline"),
    q("q-tr", "Public function, public funding: usually a public authority"),
    q("q-bl", "No public function, private funding: usually not"),
    q("q-br", "Public funding, no clear function: often borderline"),
  );
}
function renderScope() {
  const facets = S.meta.scopeFacets;
  const total = facets.reduce((a, f) => a + f.count, 0) || 1;
  $("scope-spectrum").replaceChildren(...facets.map((f) => {
    const w = (f.count / total) * 100;
    return el("div", { class: `seg ${scopeClass(f.value)}`, style: `width:${w}%`, title: `${f.label}: ${fmt(f.count)}`, text: w > 10 ? SCOPE_SHORT[f.value] : "" });
  }));
  $("scope-legend").replaceChildren(...facets.map((f) =>
    el("span", {}, [el("i", { class: scopeClass(f.value) }), el("b", { text: f.label }), ` ${fmt(f.count)}`])));
}

/* ---------- lens 2: what kind of code ---------- */
function renderLadder() {
  const rungs = ["No discoverable code", "General statement", "Published document", "Code of Conduct (or its variants)", "Binding rules", "Enforced rules"];
  $("coc-ladder").replaceChildren(...rungs.map((t, i) =>
    el("li", {}, [el("span", { class: "rung-n", text: String(i + 1) }), el("span", { text: t })])));
}
function renderNaming() {
  const names = [...new Set(S.coded.filter((o) => o.coc && o.coc.found).map((o) => o.coc.doc_type))];
  $("naming-list").replaceChildren(...names.map((n) => el("span", { class: "name-chip", text: n })));
}

/* ---------- lens 3: the seven principles ---------- */
function renderStrip() {
  const coded = S.coded, n = coded.length || 1;
  $("nolan-strip-tag").textContent = `${coded.length} codes`;
  const si = $("strip-intro"); if (si) si.textContent = `How each principle is covered across the ${fmt(coded.length)} codes of conduct.`;
  const rows = S.principles.map((p) => {
    const c = { yes: 0, partial: 0, no: 0, unknown: 0 };
    coded.forEach((o) => { c[rCov(o.nolan, p.id)]++; });
    return { p, c };
  });
  rows.sort((a, b) => b.c.yes - a.c.yes || b.c.partial - a.c.partial);
  $("principle-strip").replaceChildren(...rows.map(({ p, c }) => {
    const bar = el("div", { class: "strip-bar", title: `${c.yes} covered, ${c.partial} partly, ${c.no} not` });
    for (const k of ["yes", "partial", "no", "unknown"]) { const w = (c[k] / n) * 100; if (w > 0) bar.appendChild(el("span", { class: `s-${k}`, style: `width:${w}%` })); }
    return el("div", { class: "strip-row" }, [el("div", { class: "p-name", text: p.name }), bar, el("div", { class: "p-count", text: `${c.yes} of ${coded.length}` })]);
  }));
}

function renderCoverage() {
  const m = S.meta;
  const scope = (v) => (m.scopeFacets.find((f) => f.value === v) || {}).count || 0;
  const cov = m.coverage || {};
  // one bucket per body, so the four numbers sum to the whole register
  const segs = (cov.own != null) ? [
    { cls: "c-done", label: "Covered by a shared sector code", n: cov.shared },
    { cls: "c-own", label: "Own code read", n: cov.own },
    { cls: "c-todo", label: "In scope, still to check", n: cov.tocheck },
    { cls: "c-none", label: "Periphery, out of scope or not yet scoped", n: cov.periphery_out + cov.notscoped },
  ] : [
    { cls: "c-done", label: "In scope, code checked", n: m.assessed || 0 },
    { cls: "c-todo", label: "In scope, still to check", n: Math.max(0, scope("IS") + scope("LIS") - (m.assessed || 0)) },
    { cls: "c-out", label: "Out of scope or periphery", n: (m.out_of_scope != null) ? m.out_of_scope : (scope("POS") + scope("LOOS") + scope("NA")) },
    { cls: "c-none", label: "Not yet scoped", n: scope("") },
  ];
  const total = segs.reduce((a, x) => a + x.n, 0) || 1;
  $("coverage-bar").replaceChildren(...segs.filter((x) => x.n > 0).map((x) =>
    el("div", { class: `cov-seg ${x.cls}`, style: `width:${(x.n / total) * 100}%`, title: `${x.label}: ${fmt(x.n)}` })));
  $("coverage-legend").replaceChildren(...segs.map((x) =>
    el("span", {}, [el("i", { class: x.cls }), el("b", { text: x.label }), ` ${fmt(x.n)}`])));
}
function renderDonut(elId, facets) {
  const box = $(elId); if (!box) return;
  const colors = { IS: "#197d78", LIS: "#4a9e93", POS: "#b7791f", LOOS: "#a14d43", NA: "#6b7482", "": "#c3cad5" };
  const total = facets.reduce((a, f) => a + f.count, 0) || 1;
  let acc = 0; const stops = [];
  facets.forEach((f) => { const from = (acc / total) * 100, to = ((acc + f.count) / total) * 100; stops.push(`${colors[f.value] || "#c3cad5"} ${from}% ${to}%`); acc += f.count; });
  const inScope = (facets.find((f) => f.value === "IS") || {}).count || 0;
  box.replaceChildren(
    el("div", { class: "donut", style: `background:conic-gradient(${stops.join(",")})` }, [
      el("div", { class: "donut-hole" }, [el("div", { class: "donut-pct", text: Math.round((inScope / total) * 100) + "%" }), el("div", { class: "donut-lbl", text: "in scope" })])]),
    el("div", { class: "donut-legend" }, facets.filter((f) => f.count > 0).map((f) =>
      el("span", {}, [el("i", { style: `background:${colors[f.value] || "#c3cad5"}` }), el("b", { text: f.label }), ` ${fmt(f.count)}`]))));
}
function treemapLayout(items, x, y, w, h, out) {
  if (!items.length) return;
  if (items.length === 1) { out.push(Object.assign({ x, y, w, h }, items[0])); return; }
  const total = items.reduce((a, i) => a + i.value, 0);
  let acc = 0, k = 0;
  while (k < items.length - 1 && acc + items[k].value < total / 2) { acc += items[k].value; k++; }
  const a = items.slice(0, k + 1), b = items.slice(k + 1);
  const f = a.reduce((sm, i) => sm + i.value, 0) / total;
  if (w >= h) { treemapLayout(a, x, y, w * f, h, out); treemapLayout(b, x + w * f, y, w * (1 - f), h, out); }
  else { treemapLayout(a, x, y, w, h * f, out); treemapLayout(b, x, y + h * f, w, h * (1 - f), out); }
}
function renderTreemap(elId, facets, topN, ramp) {
  const box = $(elId); if (!box) return;
  const w = Math.max(240, Math.round(box.getBoundingClientRect().width || 300)), h = 210;
  let items = facets.filter((f) => f.value).map((f) => ({ name: f.value, value: f.count }));
  if (items.length > topN) {
    const tail = items.slice(topN).reduce((sm, i) => sm + i.value, 0);
    items = items.slice(0, topN); items.push({ name: "Other", value: tail });
  }
  items.sort((a, b) => b.value - a.value);
  const rankOf = new Map(items.map((it, i) => [it.name, i]));
  const rects = []; treemapLayout(items, 0, 0, w, h, rects);
  box.style.height = h + "px";
  box.replaceChildren(...rects.map((r) => {
    const rank = rankOf.get(r.name) || 0, dark = rank < 4;
    const cell = el("div", { class: "tm-cell", title: `${r.name}: ${fmt(r.value)}`,
      style: `left:${r.x}px;top:${r.y}px;width:${Math.max(0, r.w - 2)}px;height:${Math.max(0, r.h - 2)}px;background:${ramp[Math.min(rank, ramp.length - 1)]};color:${dark ? "#fff" : "#172033"}` });
    if (r.w > 66 && r.h > 30) { cell.appendChild(el("div", { class: "tm-name", text: r.name })); cell.appendChild(el("div", { class: "tm-val", text: fmt(r.value) })); }
    return cell;
  }));
}
function renderOverviewCharts() {
  renderDonut("ov-scope", S.meta.scopeFacets);
  renderTreemap("ov-class", S.meta.classificationFacets, 8, NAVY_RAMP);
  renderTreemap("ov-cat", S.meta.categoryFacets, 8, TEAL_RAMP);
}

function renderLegend() {
  $("nolan-legend").replaceChildren(...[["cov-yes", "covered"], ["cov-partial", "partly"], ["cov-no", "not covered"], ["cov-unknown", "not checked"]]
    .map(([c, l]) => el("span", {}, [el("i", { class: c }), l])));
}

/* ---------- query cycle ---------- */
function selectOrg(id, orgs) { S.selectedId = id; renderTable(orgs); renderDetail(orgs.find((o) => o.id === id)); }
async function refresh() {
  try {
    const mode = DataSource.config.mode;
    const q = { search: $("search").value, scope: checkedVals("f-scope"), classification: checkedVals("f-class"), category: checkedVals("f-cat") };
    if (mode === "datasette") q.page = S.page;
    const res = await DataSource.query(q);
    const orgs = res.orgs;
    const total = mode === "datasette" ? res.total : orgs.length;
    let pageOrgs = orgs;
    if (mode !== "datasette") {
      const pages = Math.max(1, Math.ceil(orgs.length / PAGE_SIZE));
      if (S.page >= pages) S.page = pages - 1;
      pageOrgs = orgs.slice(S.page * PAGE_SIZE, (S.page + 1) * PAGE_SIZE);
    }
    if (S.selectedId && !pageOrgs.some((o) => o.id === S.selectedId)) S.selectedId = null;
    renderTable(pageOrgs);
    renderPager(total, mode, res.hasMore);
    renderDetail(S.selectedId ? pageOrgs.find((o) => o.id === S.selectedId) : null);
  } catch (err) {
    $("orgtable-body").replaceChildren(el("tr", {}, [el("td", { colspan: 4, class: "load-error", text: `Could not load the organisations (${err.message}).` })]));
  }
}
function pagerBtn(label, disabled, onClick) {
  return el("button", { class: "pager-btn", type: "button", disabled: disabled ? "disabled" : null, onclick: onClick }, [label]);
}
function renderPager(total, mode, hasMore) {
  const box = $("pager"); if (!box) return;
  if (mode === "datasette") {
    box.replaceChildren(
      pagerBtn("Previous", S.page <= 0, () => { S.page = Math.max(0, S.page - 1); refresh(); }),
      el("span", { class: "pager-info", text: `Page ${S.page + 1}` }),
      pagerBtn("Next", !hasMore, () => { S.page += 1; refresh(); }));
    $("result-count").textContent = total != null ? `${fmt(total)} in total` : "";
    return;
  }
  const pages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const from = total ? S.page * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, (S.page + 1) * PAGE_SIZE);
  box.replaceChildren(
    pagerBtn("Previous", S.page <= 0, () => { S.page = Math.max(0, S.page - 1); refresh(); }),
    el("span", { class: "pager-info", text: `Showing ${from} to ${to} of ${fmt(total)}` }),
    pagerBtn("Next", S.page >= pages - 1, () => { S.page += 1; refresh(); }));
  $("result-count").textContent = (S.allCount && total < S.allCount)
    ? `${fmt(total)} of the ${fmt(S.allCount)} listed match`
    : `${fmt(total)} listed here, of ${fmt((S.meta && S.meta.total) || 0)} on the register`;
}
const FILTER_TOP = { "f-scope": 99, "f-class": 8, "f-cat": 10 };
function fillChecks(id, facets) {
  const box = $(id); if (!box) return;
  const vals = facets.filter((f) => f.value);
  const top = FILTER_TOP[id] || 8;
  const make = (f) => {
    const cb = el("input", { type: "checkbox", value: f.value });
    const lab = el("label", { class: "fcheck" }, [cb, `${f.label || f.value} (${fmt(f.count)})`]);
    cb.addEventListener("change", () => { lab.classList.toggle("on", cb.checked); S.page = 0; refresh(); });
    return lab;
  };
  box.replaceChildren(...vals.slice(0, top).map(make));
  if (vals.length > top) {
    const more = el("button", { class: "fmore", type: "button", text: `+ ${vals.length - top} more` });
    more.addEventListener("click", () => { more.remove(); vals.slice(top).forEach((f) => box.appendChild(make(f))); });
    box.appendChild(more);
  }
}
function checkedVals(id) { return [...$(id).querySelectorAll("input:checked")].map((c) => c.value); }

async function boot() {
  const meta = await DataSource.init();
  S.meta = meta; S.principles = meta.principles; S.scopeLabels = meta.scopeLabels; S.umbrellas = meta.umbrellas || {};
  const covB = meta.coverage || {};
  $("table-hint").textContent = `The table lists every body whose own code has been read (${fmt(covB.own)}), the ${Object.keys(S.umbrellas).length} shared sector codes, and a small sample of the wider register; the charts above cover the full register of ${fmt(meta.total)}. The seven dots show which principles a code covers.`;
  $("foot").textContent = "A working tool for the Ethics and Integrity Commission. Scope and type totals cover the whole register; codes are read from each body's own published code, or from the shared code its sector follows.";
  const all = await DataSource.query({});
  S.allCount = all.orgs.length;
  S.coded = all.orgs.filter((o) => o.coded && !o.is_umbrella);
  renderSummary(); renderCoverage(); renderOverviewCharts(); renderMatrix(); renderScope(); renderLadder(); renderNaming(); renderStrip(); renderLegend();
  let _rt; window.addEventListener("resize", () => { clearTimeout(_rt); _rt = setTimeout(renderOverviewCharts, 150); });
  fillChecks("f-scope", meta.scopeFacets);
  fillChecks("f-class", meta.classificationFacets);
  fillChecks("f-cat", meta.categoryFacets);
  $("search").addEventListener("input", () => { S.page = 0; refresh(); });
  await refresh();
}

boot().catch((err) => {
  document.querySelector(".wrap").prepend(el("p", { class: "load-error", text: `Could not load the data (${err.message}). If you are running this locally, serve the folder over HTTP.` }));
});
