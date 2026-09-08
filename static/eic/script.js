"use strict";

const S = { meta: null, principles: [], scopeLabels: {}, umbrellas: {}, coded: [], selectedId: null, page: 0, hm: null, principleMissing: null, heatmapCat: null };
const PAGE_SIZE = 25;

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

const UMBRELLA_SHORT = { DfE: "the DfE code for schools", LGA: "the LGA code for councils", NHS: "the NHS code", Police: "the College of Policing code" };
const humanCov = (c) => ({ yes: "covered", partial: "partly covered", no: "not covered", unknown: "not checked" }[c] || c);

function resolveNolan(o) {
  if (o.coded && o.nolan) return { mode: "own", nolan: o.nolan, coc: o.coc };
  const uid = o.umbrella_id || o.umbrella;
  const u = uid && S.umbrellas[uid];
  if (u) return { mode: "inherited", nolan: u.nolan, from: u.name, fromId: uid, coc: u.coc };
  return { mode: "none", nolan: null };
}
const rCov = (n, pid) => (n && n[pid] && n[pid].covered) || "unknown";
const rScore = (n) => S.principles.filter((p) => rCov(n, p.id) === "yes").length;

/* ---------- hero ---------- */
function renderHero() {
  const h = Aggregates.heroNumbers(S.meta);
  if (!h.reconciles) console.warn("hero numbers do not reconcile", h);
  const stats = [
    [h.total, "bodies on the register"],
    [h.shared, "covered by 4 shared codes"],
    [h.own, "own codes read"],
    [h.tocheck, "still to check"],
  ];
  $("hero-stats").replaceChildren(...stats.map(([n, label]) =>
    el("div", { class: "stat", role: "listitem" }, [el("b", { text: fmt(n) }), el("span", { text: label })])));
}

/* ---------- safety net ---------- */
function renderSafetyNet(orgRows) {
  const rows = Aggregates.safetyNetRows(S.umbrellas, orgRows, S.coded);
  $("net-rows").replaceChildren(...rows.map((r) =>
    el("div", { class: "net-row" }, [
      el("div", { class: "net-name" }, [r.name, el("small", { text: r.id })]),
      el("div", { class: "net-bodies" }, [el("b", { text: fmt(r.bodies) }), " bodies covered"]),
      (() => { const w = el("span", { class: "nolan-mini" });
        S.principles.forEach((p) => w.appendChild(el("i", { class: `cov-${rCov(r.nolan, p.id)}`, title: `${p.name}: ${humanCov(rCov(r.nolan, p.id))}` })));
        return w; })(),
    ])));
}

/* renderSafetyNet needs raw [id,name,category,umbrella] rows, which DataSource.query
 * maps to objects. Re-derive the row shape from one big page; if the adapter later
 * grows a raw-rows accessor, only this function changes. */
async function renderSafetyNetFromQuery() {
  try {
    const res = await DataSource.query({ page: 0, pageSize: Number.MAX_SAFE_INTEGER });
    const rows = res.orgs.map((o) => [o.id, o.name, o.category, o.umbrella || ""]);
    renderSafetyNet(rows);
  } catch (e) { $("net-rows").replaceChildren(el("p", { class: "hint", text: "Could not load umbrella coverage." })); }
}

/* ---------- patchwork ---------- */
function onHeatmapCell(cat, pid) {
  S.heatmapCat = (S.heatmapCat === cat && S.principleMissing === pid) ? null : cat;
  S.principleMissing = S.heatmapCat ? pid : null;
  syncFilterChips();
  S.page = 0;
  refresh();
  document.querySelector(".register").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPatchwork() {
  const own = S.coded;
  const none = own.filter((o) => Aggregates.scoreOf(o.nolan) === 0).length;
  $("patchwork-intro").textContent =
    `We have read ${fmt(own.length)} individual codes. Most mention only a few of the seven principles; ${fmt(none)} mention none.`;
  const catNames = (S.meta.coverageByCategory || []).map((g) => g.name);
  S.hm = Aggregates.heatmap(own, catNames, S.principles);
  Charts.renderHeatmap($("heatmap"), S.hm, onHeatmapCell);
  Charts.renderScaleLegend($("heatmap-legend"));
  Charts.renderDistribution($("dist-chart"), Aggregates.scoreDistribution(own));
  renderStrip();
}

/* ---------- the seven principles strip, weakest first ---------- */
function renderStrip() {
  const coded = S.coded;
  const rows = Aggregates.principleBars(coded, S.principles);
  const n = coded.length || 1;
  $("strip-rows").replaceChildren(...rows.map(({ name, yes, partial, no, unknown }) => {
    const bar = el("div", { class: "strip-bar", title: `${yes} covered, ${no} not, ${unknown} not checked` });
    for (const [k, v] of [["yes", yes], ["no", no], ["unknown", unknown]]) {
      const w = (v / n) * 100; if (w > 0) bar.appendChild(el("span", { class: `s-${k}`, style: `width:${w}%` }));
    }
    return el("div", { class: "strip-row" }, [el("div", { class: "p-name", text: name }), bar, el("div", { class: "p-count", text: `${yes} of ${coded.length}` })]);
  }));
}

/* ---------- footnote: what bodies call their code ---------- */
function renderLadderNote() {
  const counts = {};
  S.coded.forEach((o) => { const n2 = o.coc && o.coc.doc_type; if (n2) counts[n2] = (counts[n2] || 0) + 1; });
  const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  const box = $("ladder-note");
  box.appendChild(document.createTextNode("Bodies call their code different things — "));
  names.forEach((n2) => box.appendChild(el("span", { class: "name-chip", text: `${n2} (${fmt(counts[n2])})` })));
  box.appendChild(document.createTextNode(" — from general statements to binding, enforced rules."));
}

/* ---------- table ---------- */
function codeCell(o) {
  const r = resolveNolan(o);
  if (r.mode === "none") return el("span", { class: "muted-cell", text: "Not checked yet" });
  const name = r.mode === "own" ? ((o.coc && o.coc.doc_type) || "Own code") : `Covered by ${UMBRELLA_SHORT[r.fromId] || r.fromId}`;
  const cell = el("span", { class: "code-cell" }, [el("span", { class: "code-name", text: name })]);
  const sc = rScore(r.nolan);
  const [cls, txt] = sc === 7 ? ["exp", "fully covered"] : sc > 0 ? ["imp", "partially covered"] : ["non", "None covered"];
  cell.appendChild(el("span", { class: `code-badge ${cls}`, text: txt }));
  return cell;
}
function nolanCell(o) {
  const r = resolveNolan(o);
  if (r.mode === "none") return el("span", { class: "muted-cell", text: "not checked" });
  const wrap = el("span", { class: "nolan-mini" });
  S.principles.forEach((p) => wrap.appendChild(el("i", { class: `cov-${rCov(r.nolan, p.id)}`, title: `${p.name}: ${humanCov(rCov(r.nolan, p.id))}` })));
  wrap.appendChild(el("span", { class: "score", text: `${rScore(r.nolan)} of 7` }));
  return wrap;
}
function renderTable(orgs) {
  const head = $("orgtable-head"), body = $("orgtable-body");
  const cols = ["Organisation", "Their code", "Seven principles"];
  head.replaceChildren(el("tr", {}, cols.map((h) => el("th", { text: h }))));
  if (!orgs.length) { body.replaceChildren(el("tr", {}, [el("td", { colspan: cols.length, text: "Nothing matches that search." })])); return; }
  body.replaceChildren(...orgs.map((o) => {
    const row = el("tr", {
      class: o.id === S.selectedId ? "active" : "", tabindex: "0", role: "button",
      "aria-label": `See details for ${o.name}`,
      onclick: () => selectOrg(o.id, orgs),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectOrg(o.id, orgs); } },
    });
    row.appendChild(el("td", {}, [el("span", { class: "org-name", text: o.name })]));
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
  if (!o) { box.replaceChildren(el("p", { class: "d-empty", text: "Pick an organisation to see what code it has, and how many of the seven principles its code mentions." })); return; }
  const parts = [
    el("h3", { text: o.name }),
    el("p", { class: "d-sub", text: o.category || "-" }),
  ];
  if (o.notes) parts.push(el("p", { class: "d-notes", text: o.notes }));
  const safeUrl = o.url && /^https?:\/\//i.test(o.url) ? o.url : null;
  const r = resolveNolan(o);
  if (r.mode === "own") {
    const codeUrl = o.coc && o.coc.url && /^https?:\/\//i.test(o.coc.url) ? o.coc.url : null;
    const coc = el("p", { class: "d-coc" }, [el("b", { text: `Their code: ${(o.coc && o.coc.doc_type) || "Own code"}` })]);
    if (codeUrl) { coc.appendChild(document.createTextNode(" ")); coc.appendChild(el("a", { href: codeUrl, target: "_blank", rel: "noopener", text: "read it" })); }
    parts.push(coc);
    if (safeUrl) parts.push(el("p", { class: "d-coc" }, [el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "Website" })]));
    if (o.coc && o.coc.note) parts.push(el("p", { class: "d-notes", text: o.coc.note }));
    parts.push(el("p", { class: "d-nolan-head", text: `Mentions ${rScore(r.nolan)} of the 7 principles` }));
    parts.push(principleList(r.nolan));
  } else if (r.mode === "inherited") {
    if (safeUrl) parts.push(el("p", { class: "d-coc" }, [el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "Website" })]));
    const box2 = el("div", { class: "d-inherited" }, [el("b", { text: `Covered by ${UMBRELLA_SHORT[r.fromId] || r.from}.` }),
      el("span", { text: ` We have not read this body's own code; it falls under the shared code, which mentions ${rScore(r.nolan)} of the 7 principles.` })]);
    if (r.coc && r.coc.url && /^https?:\/\//i.test(r.coc.url)) { box2.appendChild(document.createTextNode(" ")); box2.appendChild(el("a", { href: r.coc.url, target: "_blank", rel: "noopener", text: "read the shared code" })); }
    parts.push(box2);
    parts.push(principleList(r.nolan));
  } else {
    if (safeUrl) parts.push(el("p", { class: "d-coc" }, [el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "Website" })]));
    parts.push(el("div", { class: "d-pending", text: "We have not checked this body's code yet." }));
  }
  box.replaceChildren(...parts);
}

/* ---------- legend ---------- */
function renderLegend() {
  $("nolan-legend").replaceChildren(...[["cov-yes", "covered"], ["cov-no", "not covered"], ["cov-unknown", "not checked"]]
    .map(([c, l]) => el("span", {}, [el("i", { class: c }), l])));
}

/* ---------- query cycle ---------- */
function selectOrg(id, orgs) { S.selectedId = id; renderTable(orgs); renderDetail(orgs.find((o) => o.id === id)); }
async function refresh() {
  try {
    const q = { search: $("search").value, category: [...new Set([...checkedVals("f-cat"), ...(S.heatmapCat ? [S.heatmapCat] : [])])], page: 0, pageSize: Number.MAX_SAFE_INTEGER };
    const res = await DataSource.query(q);
    let all = res.orgs.filter((o) => !o.is_umbrella);
    if (S.principleMissing) {
      all = all.filter((o) => {
        const r = resolveNolan(o);
        return r.nolan && rCov(r.nolan, S.principleMissing) !== "yes";
      });
    }
    const total = all.length;
    const pageOrgs = all.slice(S.page * PAGE_SIZE, (S.page + 1) * PAGE_SIZE);
    if (S.selectedId && !all.some((o) => o.id === S.selectedId)) S.selectedId = null;
    renderTable(pageOrgs);
    renderPager(total, S.page < Math.ceil(total / PAGE_SIZE) - 1);
    renderDetail(S.selectedId ? all.find((o) => o.id === S.selectedId) : null);
    if (S.hm) markActiveHeatmapCell();
  } catch (err) {
    $("orgtable-body").replaceChildren(el("tr", {}, [el("td", { colspan: 3, class: "load-error", text: `Could not load the organisations (${err.message}).` })]));
  }
}
function pagerBtn(label, disabled, onClick) {
  return el("button", { class: "pager-btn", type: "button", disabled: disabled ? "disabled" : null, onclick: onClick }, [label]);
}
function renderPager(total, hasMore) {
  const box = $("pager"); if (!box) return;
  const pages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const from = total ? S.page * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, (S.page + 1) * PAGE_SIZE);
  box.replaceChildren(
    pagerBtn("Previous", S.page <= 0, () => { S.page = Math.max(0, S.page - 1); refresh(); }),
    el("span", { class: "pager-info", text: `Showing ${from} to ${to} of ${fmt(total)}` }),
    pagerBtn("Next", !hasMore, () => { S.page += 1; refresh(); }));
  $("result-count").textContent = (S.allCount && total < S.allCount)
    ? `${fmt(total)} of the ${fmt(S.allCount)} bodies match`
    : `${fmt(total)} of ${fmt((S.meta && S.meta.total) || 0)} bodies on the register`;
}

/* ---------- filters ---------- */
const FILTER_TOP = { "f-cat": 10 };
function fillChecks(id, facets) {
  const box = $(id); if (!box) return;
  const vals = facets.filter((f) => f.value);
  const top = FILTER_TOP[id] || 8;
  const make = (f) => {
    const cb = el("input", { type: "checkbox", value: f.value });
    const lab = el("label", { class: "fchip" }, [cb, `${f.label || f.value} (${fmt(f.count)})`]);
    cb.addEventListener("change", () => { lab.classList.toggle("on", cb.checked); S.heatmapCat = null; S.page = 0; refresh(); });
    return lab;
  };
  box.replaceChildren(...vals.slice(0, top).map(make));
  if (vals.length > top) {
    const more = el("button", { class: "fmore", type: "button", text: `+ ${vals.length - top} more` });
    more.addEventListener("click", () => { more.remove(); vals.slice(top).forEach((f) => box.appendChild(make(f))); });
    box.appendChild(more);
  }
}
function fillPrincipleChecks() {
  const box = $("f-principle"); if (!box) return;
  box.replaceChildren(...S.principles.map((p) => {
    const cb = el("input", { type: "checkbox", value: p.id });
    const lab = el("label", { class: "fchip" }, [cb, p.name]);
    cb.addEventListener("change", () => {
      // radio behaviour: one principle at a time
      if (cb.checked) box.querySelectorAll("input").forEach((i) => { if (i !== cb) { i.checked = false; i.closest(".fchip").classList.remove("on"); } });
      lab.classList.toggle("on", cb.checked);
      S.principleMissing = cb.checked ? p.id : null;
      S.heatmapCat = null; // manual change clears the heatmap pairing
      S.page = 0; refresh();
    });
    return lab;
  }));
}
function syncFilterChips() {
  const box = $("f-principle"); if (!box) return;
  box.querySelectorAll("input").forEach((i) => {
    i.checked = i.value === S.principleMissing;
    i.closest(".fchip").classList.toggle("on", i.checked);
  });
  // heatmap selection is authoritative for sectors: clicking a cell replaces any
  // manual sector selection; toggling the cell off clears it entirely
  const cats = $("f-cat"); if (cats) cats.querySelectorAll("input").forEach((i) => {
    i.checked = !!(S.heatmapCat && i.value === S.heatmapCat);
    i.closest(".fchip").classList.toggle("on", i.checked);
  });
}
function markActiveHeatmapCell() {
  document.querySelectorAll(".hm-cell").forEach((b) => {
    b.classList.toggle("active", !!(S.heatmapCat && b.dataset.cat === S.heatmapCat && b.dataset.pid === S.principleMissing));
  });
}
function checkedVals(id) {
  const box = $(id);
  if (!box) return [];
  return [...box.querySelectorAll("input:checked")].map((c) => c.value);
}

/* ---------- boot ---------- */
async function boot() {
  const meta = await DataSource.init();
  S.meta = meta; S.principles = meta.principles; S.scopeLabels = meta.scopeLabels; S.umbrellas = meta.umbrellas || {};
  const cap = $("snapshot"); if (cap) cap.textContent = (meta.correctAsOf || meta.snapshot) ? `Correct as of ${meta.correctAsOf || meta.snapshot}` : "";
  $("foot").textContent = "A working tool for the Ethics and Integrity Commission. Where a body has its own published code, that code is read directly; schools, councils, health and police bodies are covered by the shared code for their sector.";
  S.allCount = meta.total;
  S.coded = meta.ownOrgs || [];
  renderHero();
  renderPatchwork();
  renderLadderNote();
  renderLegend();
  fillChecks("f-cat", meta.categoryFacets);
  fillPrincipleChecks();
  $("search").addEventListener("input", () => { S.page = 0; refresh(); });
  await refresh();
  renderSafetyNetFromQuery();
}

boot().catch((err) => {
  document.querySelector(".wrap").prepend(el("p", { class: "load-error", text: `Could not load the data (${err.message}). If you are running this locally, serve the folder over HTTP.` }));
});
