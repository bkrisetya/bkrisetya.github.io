"use strict";

const S = { meta: null, principles: [], scopeLabels: {}, umbrellas: {}, coded: [], selectedId: null, page: 0, hm: null, principleMissing: null, heatmapCat: null, docType: null, sharedRows: [], sharedByCat: {} };
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

/* A body can have its own code, a shared sector code, both, or neither.
 * Each side is resolved separately so dots and badges can show both. */
function resolveNolan(o) {
  const own = o.coded && o.nolan ? { nolan: o.nolan, coc: o.coc } : null;
  const uid = o.umbrella_id || o.umbrella;
  const u = uid && S.umbrellas[uid];
  const shared = u ? { nolan: u.nolan, name: u.name, fromId: uid, coc: u.coc } : null;
  return { own, shared };
}
const rCov = (n, pid) => (n && n[pid] && n[pid].covered) || "unknown";
const rScore = (n) => S.principles.filter((p) => rCov(n, p.id) === "yes").length;
/* Union score: principles covered by the body's own code or the shared code. */
const uScore = (r) => S.principles.filter((p) =>
  (r.own && rCov(r.own.nolan, p.id) === "yes") || (r.shared && rCov(r.shared.nolan, p.id) === "yes")).length;

/* Per-principle dot: teal = their own code covers it, navy = the shared code
 * does, split teal/navy = both do. */
function dotInfo(r, pid) {
  const ownC = r.own ? rCov(r.own.nolan, pid) : null;
  const shrC = r.shared ? rCov(r.shared.nolan, pid) : null;
  if (ownC === "yes" && shrC === "yes") return { cls: "cov-yes-both", label: "covered by both their own code and the shared code" };
  if (ownC === "yes") return { cls: "cov-yes", label: "covered by their own code" };
  if (shrC === "yes") return { cls: "cov-yes-shared", label: "covered by the shared code" };
  const c = ownC || shrC || "unknown";
  return { cls: `cov-${c}`, label: humanCov(c) };
}
/* Covered dots match the badge colours: teal = the body's own code, navy = a
 * shared sector code. Used by the safety net, whose rows are the shared codes. */
const covClass = (cov, mode) => (cov === "yes" && mode === "inherited" ? "cov-yes-shared" : `cov-${cov}`);

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
function renderSafetyNet(rows) {
  $("net-rows").replaceChildren(...rows.map((r) =>
    el("div", { class: "net-row" }, [
      el("div", { class: "net-name" }, [r.name, el("small", { text: r.id }),
        r.strength ? el("span", { class: "net-strength", text: r.strength }) : null,
        r.basis ? el("small", { class: "net-basis", text: r.basis }) : null,
        r.source ? el("a", { class: "net-source", href: r.source.url, target: "_blank", rel: "noopener", text: `Source: ${r.source.label}` }) : null,
      ].filter(Boolean)),
      el("div", { class: "net-bodies" }, [el("b", { text: fmt(r.bodies) }), " bodies covered"]),
      (() => { const w = el("span", { class: "nolan-mini" });
        S.principles.forEach((p) => w.appendChild(el("i", { class: covClass(rCov(r.nolan, p.id), "inherited"), title: `${p.name}: ${humanCov(rCov(r.nolan, p.id))}` })));
        return w; })(),
    ])));
}

/* The safety net needs raw [id,name,category,umbrella] rows, which DataSource.query
 * maps to objects. Re-derive the row shape from one big page; if the adapter later
 * grows a raw-rows accessor, only this function changes. The same rows feed the
 * shared-code layer of the waffle, strip and heatmap. */
async function renderSafetyNetFromQuery() {
  try {
    const res = await DataSource.query({ page: 0, pageSize: Number.MAX_SAFE_INTEGER });
    const rows = res.orgs.map((o) => [o.id, o.name, o.category, o.umbrella || ""]);
    S.sharedRows = Aggregates.safetyNetRows(S.umbrellas, rows, S.coded);
    /* Per-category shared bodies (scrape-wins: net of own-coded), for the
     * heatmap's "with shared codes" tab. */
    const byCat = {};
    rows.forEach((r) => { if (r[3]) byCat[r[2]] = byCat[r[2]] || { umbrella: r[3], bodies: 0 }, byCat[r[2]].bodies++; });
    const ownByCat = {};
    S.coded.forEach((o) => { if (o.umbrella) ownByCat[o.category] = (ownByCat[o.category] || 0) + 1; });
    S.sharedByCat = {};
    Object.entries(byCat).forEach(([cat, v]) => {
      const u = S.umbrellas[v.umbrella];
      const net = v.bodies - (ownByCat[cat] || 0);
      if (u && net > 0) S.sharedByCat[cat] = { nolan: u.nolan, bodies: net };
    });
    renderSafetyNet(S.sharedRows);
  } catch (e) { $("net-rows").replaceChildren(el("p", { class: "hint", text: "Could not load umbrella coverage." })); }
}

/* ---------- patchwork ---------- */
function hmRowCats(name) {
  const r = S.hm && S.hm.rows.find((x) => x.name === name);
  return r ? (r.cats || [r.name]) : [name];
}
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
  renderHm();
  renderDist();
  renderStrip();
}

function renderHm() {
  const catNames = (S.meta.coverageByCategory || []).map((g) => g.name);
  S.hm = Aggregates.heatmap(S.coded, catNames, S.principles, null);
  /* Navy dot on rows whose sector has a shared code (all four cover all seven). */
  const marks = new Set(Object.keys(S.sharedByCat));
  Charts.renderHeatmap($("heatmap"), S.hm, onHeatmapCell, marks);
  /* If the chart library has not finished loading yet, the fallback table was
   * just drawn; swap in the real heatmap as soon as it is ready. */
  if (!Charts.available()) {
    Charts.onEchartsReady(() => {
      const box = $("heatmap");
      box.replaceChildren();
      Charts.renderHeatmap(box, S.hm, onHeatmapCell, marks);
    });
  }
  Charts.renderScaleLegend($("heatmap-legend"), "codes");
  if (marks.size) {
    $("heatmap-legend").appendChild(el("span", { class: "hm-mark-note" },
      [el("i", { class: "hm-mark" }), " A shared code covers all seven principles in this sector"]));
  }
}

/* sharedRows are the umbrella totals after scrape-wins (bodies whose own code we
 * read count under their own code, not the umbrella). */
function sharedBodies() {
  return S.sharedRows.reduce((a, r) => a + r.bodies, 0);
}
function notChecked() {
  return (S.meta.coverage && S.meta.coverage.tocheck) || 0;
}

/* One story everywhere: teal = the body's own code, navy = the shared code
 * backstops it, grey = not covered / not checked. */
function renderDist() {
  const bands = Aggregates.scoreBands(S.coded, null).map((b, i) => ({
    label: `Own code: ${b.label.toLowerCase()}`, count: b.count, colour: Charts.BAND_COLOURS[i],
  }));
  bands.push({ label: "Shared code: all 7", count: sharedBodies(), colour: "#1A1463" });
  bands.push({ label: "Not checked", count: notChecked(), colour: "#C3CAD5" });
  Charts.renderScoreWaffle($("dist-chart"), bands);
  $("dist-hint").textContent = "Each square is one percent of the register.";
}

/* ---------- the seven principles strip, weakest first ---------- */
function renderStrip() {
  const rows = Aggregates.principleBars(S.coded, S.principles, null);
  /* Bodies covered through a shared code, per principle. */
  const sharedYes = {};
  S.sharedRows.forEach((s) => S.principles.forEach((p) => {
    if (rCov(s.nolan, p.id) === "yes") sharedYes[p.id] = (sharedYes[p.id] || 0) + s.bodies;
  }));
  rows.forEach((r) => { r.shared = sharedYes[r.id] || 0; });
  rows.sort((a, b) => (a.yes + a.shared) - (b.yes + b.shared) || a.name.localeCompare(b.name));
  const total = S.coded.length + sharedBodies() + notChecked();
  const n = total || 1;
  $("strip-rows").replaceChildren(...rows.map((r) => {
    const covered = r.yes + r.shared;
    const tip = `${r.yes} of the ${fmt(S.coded.length)} codes we read mention ${r.name}; ${fmt(r.shared)} more bodies have it through a shared code; ${fmt(notChecked())} bodies not checked.`;
    const bar = el("div", { class: "strip-bar", title: tip });
    for (const [k, v] of [["yes", r.yes], ["shared", r.shared], ["no", r.no], ["unchecked", notChecked()]]) {
      const w = (v / n) * 100; if (w > 0) bar.appendChild(el("span", { class: `s-${k}`, style: `width:${w}%` }));
    }
    return el("div", { class: "strip-row", title: tip }, [el("div", { class: "p-name", text: r.name }), bar, el("div", { class: "p-count", text: `${covered === n ? 100 : Math.min(99, Math.round((covered / n) * 100))}%` })]);
  }));
  $("strip-legend").replaceChildren(...[["s-yes", "own code mentions it"], ["s-shared", "shared code covers it"], ["s-no", "not mentioned"], ["s-unchecked", "not checked"]]
    .map(([c, l]) => el("span", {}, [el("i", { class: `sl ${c}` }), l])));
}

/* ---------- footnote: what bodies call their code ---------- */
function renderLadderNote() {
  const counts = {};
  S.coded.forEach((o) => { const n2 = o.coc && o.coc.doc_type; if (n2) counts[n2] = (counts[n2] || 0) + 1; });
  const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  const box = $("ladder-note");
  box.replaceChildren(document.createTextNode("Bodies call their code different things — "));
  names.forEach((n2) => {
    const chip = el("button", { class: "name-chip", type: "button", text: `${n2} (${fmt(counts[n2])})` });
    chip.setAttribute("aria-pressed", String(S.docType === n2));
    chip.addEventListener("click", () => {
      S.docType = S.docType === n2 ? null : n2;
      S.page = 0;
      renderLadderNote();
      refresh();
      if (S.docType) document.querySelector(".register").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    box.appendChild(chip);
  });
  box.appendChild(document.createTextNode(" — from general statements to binding, enforced rules."));
}

/* ---------- table ---------- */
function codeCell(o) {
  const r = resolveNolan(o);
  if (!r.own && !r.shared) return el("span", { class: "muted-cell", text: "Not checked" });
  const name = r.own ? ((o.coc && o.coc.doc_type) || "Own code") : `Covered by ${UMBRELLA_SHORT[r.shared.fromId] || r.shared.fromId}`;
  const badges = [];
  if (r.own) badges.push(el("span", { class: "code-badge own", text: "Own code" }));
  if (r.shared) badges.push(el("span", {
    class: "code-badge shared",
    title: r.own ? `Also covered by ${UMBRELLA_SHORT[r.shared.fromId] || r.shared.name}` : null,
    text: "Shared code",
  }));
  return el("span", { class: "code-cell" }, [el("span", { class: "code-name", text: name }), ...badges]);
}
function nolanCell(o) {
  const r = resolveNolan(o);
  if (!r.own && !r.shared) return el("span", { class: "muted-cell", text: "not checked" });
  const wrap = el("span", { class: "nolan-mini" });
  S.principles.forEach((p) => { const d = dotInfo(r, p.id); wrap.appendChild(el("i", { class: d.cls, title: `${p.name}: ${d.label}` })); });
  wrap.appendChild(el("span", { class: "score", text: `${uScore(r)} of 7` }));
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
function principleList(r) {
  const grid = el("div", { class: "d-princ" });
  S.principles.forEach((p) => {
    const d = dotInfo(r, p.id);
    const ev = (r.own && r.own.nolan[p.id] && r.own.nolan[p.id].evidence) || (r.shared && r.shared.nolan[p.id] && r.shared.nolan[p.id].evidence) || "";
    grid.appendChild(el("div", { class: "pr" }, [el("span", { class: `dot ${d.cls}` }),
      el("div", {}, [el("b", { text: `${p.name}: ${d.label}` }), el("span", { class: "ev", text: ev })])]));
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
  if (r.own) {
    const codeUrl = o.coc && o.coc.url && /^https?:\/\//i.test(o.coc.url) ? o.coc.url : null;
    const coc = el("p", { class: "d-coc" }, [el("b", { text: `Their code: ${(o.coc && o.coc.doc_type) || "Own code"}` })]);
    if (codeUrl) { coc.appendChild(document.createTextNode(" ")); coc.appendChild(el("a", { href: codeUrl, target: "_blank", rel: "noopener", text: "read it" })); }
    parts.push(coc);
    if (safeUrl) parts.push(el("p", { class: "d-coc" }, [el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "Website" })]));
    if (o.coc && o.coc.note) parts.push(el("p", { class: "d-notes", text: o.coc.note }));
    if (r.shared) {
      const sharedName = UMBRELLA_SHORT[r.shared.fromId] || r.shared.name;
      const also = el("p", { class: "d-coc" }, [el("b", { text: `Also covered by ${sharedName}.` }),
        el("span", { text: ` On its own it mentions ${rScore(r.shared.nolan)} of the 7 principles.` })]);
      if (r.shared.coc && r.shared.coc.url && /^https?:\/\//i.test(r.shared.coc.url)) { also.appendChild(document.createTextNode(" ")); also.appendChild(el("a", { href: r.shared.coc.url, target: "_blank", rel: "noopener", text: "read the shared code" })); }
      parts.push(also);
    }
    parts.push(el("p", { class: "d-nolan-head", text: `Mentions ${uScore(r)} of the 7 principles` }));
    parts.push(principleList(r));
  } else if (r.shared) {
    if (safeUrl) parts.push(el("p", { class: "d-coc" }, [el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "Website" })]));
    const box2 = el("div", { class: "d-inherited" }, [el("b", { text: `Covered by ${UMBRELLA_SHORT[r.shared.fromId] || r.shared.name}.` }),
      el("span", { text: ` We have not read this body's own code; it falls under the shared code, which mentions ${rScore(r.shared.nolan)} of the 7 principles.` })]);
    if (r.shared.coc && r.shared.coc.url && /^https?:\/\//i.test(r.shared.coc.url)) { box2.appendChild(document.createTextNode(" ")); box2.appendChild(el("a", { href: r.shared.coc.url, target: "_blank", rel: "noopener", text: "read the shared code" })); }
    parts.push(box2);
    parts.push(principleList(r));
  } else {
    if (safeUrl) parts.push(el("p", { class: "d-coc" }, [el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "Website" })]));
    parts.push(el("div", { class: "d-pending", text: "We have not checked this body's code yet." }));
  }
  box.replaceChildren(...parts);
}

/* ---------- legend ---------- */
function renderLegend() {
  $("nolan-legend").replaceChildren(...[["cov-yes", "covered"], ["cov-yes-shared", "covered by a shared code"], ["cov-yes-both", "covered by both"], ["cov-no", "not covered"], ["cov-unknown", "not checked"]]
    .map(([c, l]) => el("span", {}, [el("i", { class: c }), l])));
}

/* ---------- query cycle ---------- */
function selectOrg(id, orgs) { S.selectedId = id; renderTable(orgs); renderDetail(orgs.find((o) => o.id === id)); }
async function refresh() {
  try {
    const q = { search: $("search").value, category: [...new Set([...checkedVals("f-cat"), ...(S.heatmapCat ? hmRowCats(S.heatmapCat) : [])])], page: 0, pageSize: Number.MAX_SAFE_INTEGER };
    const res = await DataSource.query(q);
    let all = res.orgs.filter((o) => !o.is_umbrella);
    if (S.docType) all = all.filter((o) => o.coded && o.coc && o.coc.doc_type === S.docType);
    if (S.principleMissing) {
      all = all.filter((o) => {
        const r = resolveNolan(o);
        if (!r.own && !r.shared) return false;
        return rCov(r.own && r.own.nolan, S.principleMissing) !== "yes"
          && rCov(r.shared && r.shared.nolan, S.principleMissing) !== "yes";
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
    i.checked = !!(S.heatmapCat && hmRowCats(S.heatmapCat).includes(i.value));
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
  await renderSafetyNetFromQuery(); // populates S.sharedRows, the shared-code layer
  renderPatchwork();
  renderLadderNote();
  renderLegend();
  fillChecks("f-cat", meta.categoryFacets);
  fillPrincipleChecks();
  $("search").addEventListener("input", () => { S.page = 0; refresh(); });
  await refresh();
}

boot().catch((err) => {
  document.querySelector(".wrap").prepend(el("p", { class: "load-error", text: `Could not load the data (${err.message}). If you are running this locally, serve the folder over HTTP.` }));
});
