"use strict";

const S = { meta: null, principles: [], scopeLabels: {}, umbrellas: {}, coded: [], selectedId: null };

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
const fmt = (n) => (n == null ? "—" : n.toLocaleString("en-GB"));

const OUT_OF_SCOPE = ["POS", "LOOS", "NA"];
const SCOPE_SHORT = { IS: "In scope", LIS: "Likely in", POS: "Possibly out", LOOS: "Likely out", NA: "Not applicable", "": "Not yet scoped" };
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
  $("q1-note").textContent = `of ${fmt(m.total)} bodies. ${fmt(scope("POS") + scope("LOOS"))} look out of scope; ${fmt(scope(""))} are still to be checked.`;

  const codes = [...S.coded, ...Object.values(S.umbrellas)];
  const explicit = codes.filter((c) => (c.coc && c.coc.explicit_seven_ref) === true).length;
  const implicit = codes.filter((c) => c.coc && c.coc.explicit_seven_ref === false).length;
  $("q2-figure").textContent = `${fmt(m.assessed)} covered by a code`;
  $("q2-note").textContent = `Most bodies fall under a shared code. Of the codes read closely, ${explicit} name the seven principles and ${implicit} cover them without naming them.`;

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
  if (r.mode === "na") return el("span", { class: "muted-cell", text: "Out of scope" });
  if (r.mode === "none") return el("span", { class: "muted-cell", text: "Not checked yet" });
  const explicit = r.mode === "own" ? (o.coc && o.coc.explicit_seven_ref === true) : true;
  const name = r.mode === "own" ? o.coc.doc_type : `Covered by ${UMBRELLA_SHORT[r.fromId] || r.fromId}`;
  return el("span", { class: "code-cell" }, [
    el("span", { class: "code-name", text: name }),
    el("span", { class: `code-badge ${explicit ? "exp" : "imp"}`, text: explicit ? "names the principles" : "covers without naming" }),
  ]);
}
function nolanCell(o) {
  const r = resolveNolan(o);
  if (r.mode === "na") return el("span", { class: "muted-cell", text: "—" });
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
    el("p", { class: "d-sub", text: [o.category, o.classification].filter(Boolean).join(" · ") || "—" }),
    el("div", { class: "d-class" }, [
      el("div", { class: "row" }, [el("span", { text: "In scope?" }), el("span", { text: S.scopeLabels[o.scope] || "Not yet scoped" })]),
      el("div", { class: "row" }, [el("span", { text: "Type of body" }), el("span", { text: o.classification || "—" })]),
      el("div", { class: "row" }, [el("span", { text: "Sector" }), el("span", { text: o.category || "—" })]),
    ]),
  ];
  if (o.notes) parts.push(el("p", { class: "d-notes", text: o.notes }));
  const safeUrl = o.url && /^https?:\/\//i.test(o.url) ? o.url : null;
  const r = resolveNolan(o);
  if (r.mode === "own") {
    const coc = el("p", { class: "d-coc" }, [el("b", { text: `Their code: ${o.coc.doc_type}` })]);
    if (safeUrl) { coc.appendChild(document.createTextNode(" ")); coc.appendChild(el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "read it" })); }
    parts.push(coc);
    parts.push(el("p", { class: "d-coc", text: o.coc.explicit_seven_ref ? "This code names the seven principles." : "This code does not name the seven principles, but covers most of them in substance." }));
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
    parts.push(el("div", { class: "d-pending", text: "This body looks to be out of scope, so we have not checked its code against the seven principles. That changes if it is brought into scope." }));
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
    el("span", { class: "axis y-top", text: "Does a public job" }),
    el("span", { class: "axis y-bot", text: "Does a private job" }),
    el("span", { class: "axis x-left", text: "Private money" }),
    el("span", { class: "axis x-right", text: "Public money" }),
    q("q-tl", "Public job, private money: usually a judgement call"),
    q("q-tr", "Public job, public money: usually a public authority"),
    q("q-bl", "Private job, private money: usually not a public authority"),
    q("q-br", "Private job, public money: usually a judgement call"),
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
  const rungs = ["No code we can find", "A general statement of values", "A published policy", "A named code of conduct", "Binding rules staff must follow", "Rules that are actually enforced"];
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
  $("nolan-strip-tag").textContent = `${coded.length} codes read closely`;
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

function renderLegend() {
  $("nolan-legend").replaceChildren(...[["cov-yes", "covered"], ["cov-partial", "partly"], ["cov-no", "not covered"], ["cov-unknown", "not checked"]]
    .map(([c, l]) => el("span", {}, [el("i", { class: c }), l])));
}

/* ---------- query cycle ---------- */
function selectOrg(id, orgs) { S.selectedId = id; renderTable(orgs); renderDetail(orgs.find((o) => o.id === id)); }
async function refresh() {
  const res = await DataSource.query({ search: $("search").value, scope: $("f-scope").value, classification: $("f-class").value, category: $("f-cat").value });
  const orgs = res.orgs;
  if (S.selectedId && !orgs.some((o) => o.id === S.selectedId)) S.selectedId = null;
  const shown = res.total != null ? res.total : orgs.length;
  $("result-count").textContent = `Showing ${fmt(shown)} of ${fmt(S.meta.total)}`;
  renderTable(orgs);
  renderDetail(S.selectedId ? orgs.find((o) => o.id === S.selectedId) : null);
}
function fillSelect(id, facets, allLabel) {
  const sel = $(id);
  sel.replaceChildren(el("option", { value: "", text: allLabel }));
  facets.filter((f) => f.value).forEach((f) => sel.appendChild(el("option", { value: f.value, text: `${f.label || f.value} (${fmt(f.count)})` })));
}

async function boot() {
  const meta = await DataSource.init();
  S.meta = meta; S.principles = meta.principles; S.scopeLabels = meta.scopeLabels; S.umbrellas = meta.umbrellas || {};
  $("table-hint").textContent = "Each row answers the three questions. The seven dots show which principles that body's code covers; “not checked” means we have not read a code for it yet.";
  $("foot").textContent = "A working tool for the Ethics and Integrity Commission. Scope and type totals cover the whole register; codes are read from each body's own published code, or from the shared code its sector follows.";
  const all = await DataSource.query({});
  S.coded = all.orgs.filter((o) => o.coded && !o.is_umbrella);
  renderSummary(); renderMatrix(); renderScope(); renderLadder(); renderNaming(); renderStrip(); renderLegend();
  fillSelect("f-scope", meta.scopeFacets, "Any scope");
  fillSelect("f-class", meta.classificationFacets, "Any type");
  fillSelect("f-cat", meta.categoryFacets, "Any sector");
  $("search").addEventListener("input", refresh);
  ["f-scope", "f-class", "f-cat"].forEach((id) => $(id).addEventListener("change", refresh));
  await refresh();
}

boot().catch((err) => {
  document.querySelector(".wrap").prepend(el("p", { class: "load-error", text: `Could not load the data (${err.message}). If you are running this locally, serve the folder over HTTP.` }));
});
