"use strict";

const state = { data: null, selectedId: null };

/* ---------- small DOM helper ---------- */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "title") node.title = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

/* ---------- derived helpers ---------- */
const covOf = (org, pid) => (org.nolan[pid] && org.nolan[pid].covered) || "unknown";
const evOf = (org, pid) => (org.nolan[pid] && org.nolan[pid].evidence) || "";
const found = (org) => !!org.coc.found;
const isExplicit = (org) => org.coc.explicit_seven_ref === true;
const scoreYes = (org) => state.data.principles.filter((p) => covOf(org, p.id) === "yes").length;
const meetsAll = (org) => state.data.principles.every((p) => covOf(org, p.id) === "yes");
const hasGap = (org) => found(org) && state.data.principles.some((p) => ["no", "partial"].includes(covOf(org, p.id)));

/* ---------- filtering ---------- */
function applyFilters() {
  const q = document.querySelector("#search").value.trim().toLowerCase();
  const sector = document.querySelector("#sector").value;
  const mode = document.querySelector("#coverage").value;
  return state.data.orgs.filter((o) => {
    if (q && !(`${o.name} ${o.sector}`.toLowerCase().includes(q))) return false;
    if (sector !== "all" && o.sector !== sector) return false;
    if (mode === "explicit" && !isExplicit(o)) return false;
    if (mode === "meets-all" && !meetsAll(o)) return false;
    if (mode === "gaps" && !hasGap(o)) return false;
    if (mode === "missing" && found(o)) return false;
    return true;
  });
}

/* ---------- renders ---------- */
function renderSnapshot() {
  const all = state.data.orgs;
  const items = [
    ["Organisations", all.length],
    ["Adopt the 7", all.filter(isExplicit).length],
    ["Meet all 7", all.filter(meetsAll).length],
    ["Codes located", `${all.filter(found).length}/${all.length}`],
  ];
  const dl = document.querySelector("#snapshot");
  dl.innerHTML = "";
  for (const [k, v] of items) dl.appendChild(el("div", {}, [el("dt", { text: k }), el("dd", { text: String(v) })]));
}

function renderLegend() {
  const legend = document.querySelector("#legend");
  legend.innerHTML = "";
  const pairs = [["cov-yes", "Explicit / clear"], ["cov-partial", "Partial"], ["cov-no", "No provision"], ["cov-unknown", "Not located"]];
  for (const [cls, label] of pairs) legend.appendChild(el("span", {}, [el("i", { class: cls }), label]));
}

function renderStrip(list) {
  const wrap = document.querySelector("#principle-strip");
  wrap.innerHTML = "";
  const n = list.length || 1;
  const rows = state.data.principles.map((p) => {
    const counts = { yes: 0, partial: 0, no: 0, unknown: 0 };
    list.forEach((o) => { counts[covOf(o, p.id)]++; });
    return { p, counts };
  });
  rows.sort((a, b) => b.counts.yes - a.counts.yes || b.counts.partial - a.counts.partial);
  for (const { p, counts } of rows) {
    const bar = el("div", { class: "strip-bar", title: `${counts.yes} clear, ${counts.partial} partial, ${counts.no} none, ${counts.unknown} not located` });
    for (const k of ["yes", "partial", "no", "unknown"]) {
      const w = (counts[k] / n) * 100;
      if (w > 0) bar.appendChild(el("span", { class: `s-${k}`, style: `width:${w}%` }));
    }
    wrap.appendChild(el("div", { class: "strip-row" }, [
      el("div", { class: "p-name", text: p.name }),
      bar,
      el("div", { class: "p-count", text: `${counts.yes}/${list.length} clear` }),
    ]));
  }
}

function renderMatrix(list) {
  const head = document.querySelector("#matrix-head");
  const body = document.querySelector("#matrix-body");
  head.innerHTML = "";
  body.innerHTML = "";

  const hr = el("tr", {}, [el("th", { class: "org-col", text: "Organisation" })]);
  state.data.principles.forEach((p) => hr.appendChild(el("th", { text: p.name.slice(0, 3), title: p.name })));
  hr.appendChild(el("th", { text: "Adopts 7", title: "Explicitly adopts the Seven Principles of Public Life" }));
  hr.appendChild(el("th", { text: "Score", title: "Principles clearly covered, out of seven" }));
  head.appendChild(hr);

  if (list.length === 0) {
    body.appendChild(el("tr", {}, [el("td", { class: "org-col", colspan: state.data.principles.length + 3, text: "No organisations match these filters." })]));
    return;
  }

  for (const o of list) {
    const row = el("tr", {
      class: o.id === state.selectedId ? "active" : "",
      tabindex: "0",
      role: "button",
      "aria-label": `Show details for ${o.name}`,
      onclick: () => selectOrg(o.id),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectOrg(o.id); } },
    });
    row.appendChild(el("td", { class: "org-col" }, [
      el("span", { class: "org-name", text: o.name }),
      el("span", { class: "org-sector", text: o.sector }),
    ]));
    state.data.principles.forEach((p) => {
      const cov = covOf(o, p.id);
      row.appendChild(el("td", {}, [el("span", { class: `cell cov-${cov}`, "aria-label": `${p.name}: ${cov}`, title: `${p.name}: ${cov}${evOf(o, p.id) ? " — " + evOf(o, p.id) : ""}` })]));
    });
    const ex = isExplicit(o);
    row.appendChild(el("td", {}, [el("span", { class: `adopt ${ex ? "yes" : "no"}`, text: ex ? "Yes" : "No" })]));
    row.appendChild(el("td", {}, [el("span", { class: "score", text: found(o) ? `${scoreYes(o)}/7` : "—" })]));
    body.appendChild(row);
  }
}

function renderDetail(org) {
  const box = document.querySelector("#detail");
  box.innerHTML = "";
  if (!org) {
    box.appendChild(el("p", { class: "d-empty", text: "Select an organisation from the table to see its classification and the evidence behind each Nolan tag." }));
    return;
  }
  box.appendChild(el("h3", { text: org.name }));
  box.appendChild(el("p", { class: "d-sector", text: org.sector }));

  const cls = el("div", { class: "d-class" }, [
    el("div", { class: "row" }, [el("span", { text: "Public authority status" }), el("span", { text: org.classification.status })]),
    el("div", { class: "row" }, [el("span", { text: "Basis" }), el("span", { text: org.classification.basis })]),
    el("div", { class: "row" }, [el("span", { text: "Confidence" }), el("span", { text: org.classification.confidence })]),
  ]);
  box.appendChild(cls);

  const coc = el("p", { class: "d-coc" });
  coc.appendChild(el("b", { text: org.coc.doc_type }));
  const safeUrl = org.coc.url && /^https?:\/\//i.test(org.coc.url) ? org.coc.url : null;
  if (org.coc.found && safeUrl) {
    coc.appendChild(document.createTextNode(" · "));
    coc.appendChild(el("a", { href: safeUrl, target: "_blank", rel: "noopener", text: "source" }));
  }
  coc.appendChild(el("span", { text: (org.coc.note ? " · " + org.coc.note : "") }));
  box.appendChild(coc);

  const grid = el("div", { class: "d-princ" });
  state.data.principles.forEach((p) => {
    const cov = covOf(org, p.id);
    grid.appendChild(el("div", { class: "pr" }, [
      el("span", { class: `dot cov-${cov}` }),
      el("div", {}, [el("b", { text: `${p.name} — ${cov}` }), el("span", { class: "ev", text: evOf(org, p.id) })]),
    ]));
  });
  box.appendChild(grid);
}

function renderClassification(list) {
  const wrap = document.querySelector("#classification");
  wrap.innerHTML = "";
  const statusClass = (s) => {
    const t = s.toLowerCase();
    if (t.includes("likely public")) return "status-yes";
    if (t.includes("outside")) return "status-no";
    if (t.includes("judgement") || t.includes("context")) return "status-judge";
    return "status-unknown";
  };
  for (const o of list) {
    wrap.appendChild(el("div", { class: "class-row" }, [
      el("div", { class: "c-name", text: o.name }),
      el("div", {}, [el("span", { class: `pill ${statusClass(o.classification.status)}`, text: o.classification.status })]),
      el("div", { class: "c-basis", text: o.classification.basis }),
      el("div", { class: "c-basis", text: `Confidence: ${o.classification.confidence}` }),
    ]));
  }
}

function renderResultCount(list) {
  document.querySelector("#result-count").textContent = `${list.length} of ${state.data.orgs.length} shown`;
}

function selectOrg(id) {
  state.selectedId = id;
  renderMatrix(applyFilters());
  renderDetail(state.data.orgs.find((o) => o.id === id));
}

function refresh() {
  const list = applyFilters();
  if (state.selectedId && !list.some((o) => o.id === state.selectedId)) state.selectedId = null;
  renderResultCount(list);
  renderStrip(list);
  renderMatrix(list);
  renderClassification(list);
  renderDetail(state.selectedId ? state.data.orgs.find((o) => o.id === state.selectedId) : null);
}

function populateSectors() {
  const sel = document.querySelector("#sector");
  const sectors = Array.from(new Set(state.data.orgs.map((o) => o.sector))).sort();
  sel.appendChild(el("option", { value: "all", text: "All sectors" }));
  sectors.forEach((s) => sel.appendChild(el("option", { value: s, text: s })));
}

function init(data) {
  state.data = data;
  document.querySelector("#subtitle").textContent =
    `${data.meta.snapshot} snapshot. ${data.meta.note}`;
  document.querySelector("#foot").textContent =
    "Working sample for EIC discussion. Nolan tags are evidenced from each organisation's published code; coverage reflects substantive reading, not only literal mentions.";
  renderSnapshot();
  renderLegend();
  populateSectors();
  ["search"].forEach((id) => document.querySelector(`#${id}`).addEventListener("input", refresh));
  ["sector", "coverage"].forEach((id) => document.querySelector(`#${id}`).addEventListener("change", refresh));
  refresh();
}

fetch("./data.json")
  .then((r) => { if (!r.ok) throw new Error(`data.json ${r.status}`); return r.json(); })
  .then(init)
  .catch((err) => {
    const msg = el("p", {
      class: "load-error",
      text: `Could not load data.json (${err.message}). Serve this folder over HTTP (e.g. python3 -m http.server).`,
    });
    document.querySelector(".wrap").prepend(msg);
  });
