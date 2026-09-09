"use strict";

/* Charts for the EIC dashboard. ECharts is vendored at ./vendor/echarts.min.js
 * (pinned 5.5.1) so the page does not depend on a CDN. If the library has not
 * finished loading when a chart is first rendered, a plain DOM/SVG fallback is
 * drawn immediately and upgraded to ECharts on the script's load event.
 * Force the fallback with ?nocharts=1 (test hook). */

const Charts = (() => {
  const TEAL = [0x18, 0x99, 0xa2], DEEP_TEAL = [0x08, 0x45, 0x4c], GREY = "#C3CAD5";
  const NAVY = [0x1a, 0x14, 0x63], MID_NAVY = [0x7c, 0x7a, 0xa9];
  const PAPER = [0xf4, 0xf6, 0xfe]; // 0% share: looks empty, because nothing is there

  const hex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  /* Sequential scales: 0% = near-paper (empty, not celebrated), 100% = the deepest
   * brand colour. Individual codes use the teal family; the shared-code view uses
   * the navy family so it matches the "Shared code" badges and register dots.
   * Colour carries exactly one meaning: how much is covered. */
  function shareColour(share, unit) {
    const s = Math.max(0, Math.min(1, share));
    if (unit === "bodies") return s <= 0.5 ? lerp(PAPER, MID_NAVY, s * 2) : lerp(MID_NAVY, NAVY, (s - 0.5) * 2);
    return s <= 0.5 ? lerp(PAPER, TEAL, s * 2) : lerp(TEAL, DEEP_TEAL, (s - 0.5) * 2);
  }

  function cellColor(share, unit) {
    if (share === null || share === undefined || isNaN(share)) return GREY;
    return hex(shareColour(share, unit));
  }

  function available() {
    if (typeof window === "undefined") return false;
    if (new URLSearchParams(window.location.search).has("nocharts")) return false;
    return !!window.echarts;
  }

  /* Run cb once window.echarts exists: immediately if already loaded, otherwise
   * on the vendored script's load event. Never fires on ?nocharts=1 or if the
   * script failed (the caller's fallback render simply stays). */
  function onEchartsReady(cb) {
    if (!available()) {
      if (new URLSearchParams(window.location.search).has("nocharts")) return;
      const tag = document.getElementById("echarts-lib");
      if (!tag || window.__echartsFailed) return;
      tag.addEventListener("load", () => { if (window.echarts) cb(); }, { once: true });
      tag.addEventListener("error", () => { window.__echartsFailed = true; }, { once: true });
      return;
    }
    cb();
  }

  /* ---------- heatmap ---------- */
  function tipText(cat, principleName, cell, unit) {
    if (unit === "bodies") {
      if (!cell.total) return `${principleName} — ${cat}\nNo shared code in this sector.`;
      let t = `${principleName} — ${cat}\n${cell.yes.toLocaleString("en-GB")} of ${cell.total.toLocaleString("en-GB")} bodies have this principle in their sector's shared code.`;
      if (cell.note) t += `\n${cell.note}`;
      return t;
    }
    if (!cell.total) return `${principleName} — ${cat}\nWe have not read any codes in this sector yet.`;
    let t = `${principleName} — ${cat}\n${cell.yes} of the ${cell.total} codes we read mention this principle.`;
    if (cell.note) t += `\n${cell.note}`;
    return t;
  }

  function renderHeatmap(el, hm, onCellClick) {
    if (available()) {
      /* If ECharts itself throws (blocked script, canvas/GPU issue, zero-size
       * init), fall back to the plain table rather than leaving a blank panel. */
      try { return echartsHeatmap(el, hm, onCellClick); }
      catch (e) { console.warn("echarts heatmap failed, using table fallback", e); }
    }
    return domHeatmap(el, hm, onCellClick);
  }

  function echartsHeatmap(el, hm, onCellClick) {
    const prev = echarts.getInstanceByDom(el);
    if (prev) prev.dispose();
    /* Height must be set before init: ECharts measures the element at init time
     * and a 0-height canvas stays blank even after the height changes. */
    el.style.height = Math.max(220, hm.rows.length * 34 + 60) + "px";
    const chart = echarts.init(el, null, { renderer: "canvas" });
    const data = [];
    hm.rows.forEach((r, y) => hm.cols.forEach((c, x) => {
      const cell = hm.cells.get(r.name + "|" + c.id) || { share: null, total: 0, yes: 0 };
      /* ECharts skips null values entirely, so a "no data" cell would render
       * transparent instead of grey — carry 0 in the value, grey in the style. */
      const v = cell.share === null || cell.share === undefined || isNaN(cell.share) ? 0 : cell.share;
      data.push({ value: [x, y, v], cell, itemStyle: { color: cellColor(cell.share, hm.unit), borderColor: "#fff", borderWidth: 2 } });
    }));
    chart.setOption({
      grid: { left: 4, right: 8, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: hm.cols.map((c) => c.name), axisLabel: { fontSize: 11, interval: 0, rotate: 30 }, axisTick: { show: false }, axisLine: { show: false } },
      yAxis: { type: "category", data: hm.rows.map((r) => r.label || r.name), inverse: true, axisLabel: { fontSize: 11 }, axisTick: { show: false }, axisLine: { show: false } },
      tooltip: { formatter: (p) => tipText(hm.rows[p.value[1]].label || hm.rows[p.value[1]].name, hm.cols[p.value[0]].name, p.data.cell, hm.unit).replace(/\n/g, "<br>") },
      series: [{ type: "heatmap", data, label: { show: false }, emphasis: { itemStyle: { borderColor: "#1A1463", borderWidth: 2 } } }],
    });
    chart.on("click", (p) => { const r = hm.rows[p.value[1]], c = hm.cols[p.value[0]]; const cell = hm.cells.get(r.name + "|" + c.id); if (cell && cell.total) onCellClick(r.name, c.id); });
    /* Fonts and layout can settle after init; re-measure on the next frame and
     * on resize so the canvas never stays at a stale size. */
    requestAnimationFrame(() => chart.resize());
    window.addEventListener("resize", () => chart.resize());
    return chart;
  }

  function domHeatmap(el, hm, onCellClick) {
    const table = document.createElement("table");
    table.className = "hm-table";
    const head = table.createTHead().insertRow();
    head.appendChild(document.createElement("th")).className = "hm-cat";
    hm.cols.forEach((c) => { const th = document.createElement("th"); th.textContent = c.name; head.appendChild(th); });
    head.appendChild(document.createElement("th")).textContent = hm.unit === "bodies" ? "Bodies" : "Codes read";
    const body = table.createTBody();
    hm.rows.forEach((r) => {
      const tr = body.insertRow();
      const th = document.createElement("th"); th.className = "hm-cat"; th.textContent = r.label || r.name; tr.appendChild(th);
      hm.cols.forEach((c) => {
        const cell = hm.cells.get(r.name + "|" + c.id) || { share: null, total: 0, yes: 0 };
        const td = tr.insertCell();
        const btn = document.createElement("button");
        btn.className = "hm-cell"; btn.type = "button"; btn.style.width = "100%";
        btn.style.background = cellColor(cell.share, hm.unit);
        btn.title = tipText(r.label || r.name, c.name, cell, hm.unit);
        btn.dataset.cat = r.name; btn.dataset.pid = c.id;
        if (!cell.total) btn.disabled = true;
        else btn.addEventListener("click", () => onCellClick(r.name, c.id));
        td.appendChild(btn);
      });
      const tdN = tr.insertCell(); tdN.className = "hm-count"; tdN.textContent = (hm.unit === "bodies" ? r.bodies : r.coded).toLocaleString("en-GB");
    });
    el.replaceChildren(table);
  }

  function renderScaleLegend(el, unit) {
    el.replaceChildren();
    const mk = (txt) => { const s = document.createElement("span"); s.textContent = txt; return s; };
    el.appendChild(mk("0%"));
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      const sw = document.createElement("i"); sw.className = "sw"; sw.style.background = cellColor(v, unit); el.appendChild(sw);
    });
    el.appendChild(mk("100%"));
    const g = document.createElement("span");
    const sw = document.createElement("i"); sw.className = "sw"; sw.style.background = GREY;
    g.appendChild(sw); g.appendChild(document.createTextNode(" No data"));
    el.appendChild(g);
  }

  /* ---------- score waffle ---------- */
  /* EIC families as a readable progression: magenta -> purple -> sky -> teal.
   * The shared-code tab switches to a navy ramp to match the "Shared code"
   * badges and register dots. */
  const BAND_COLOURS = ["#E41E7C", "#9851FB", "#3CB7F4", "#1899A2"]; // none / 1-2 / 3-5 / 6-7
  const BAND_COLOURS_SHARED = ["#D8D6EE", "#9B97CF", "#56519E", "#1A1463"];

  /* 100 squares, worst band first. Largest-remainder rounding so squares sum to 100. */
  function waffleSquares(bands, total) {
    const t = total || bands.reduce((a, b) => a + b.count, 0) || 1;
    const exact = bands.map((b) => (b.count / t) * 100);
    const floor = exact.map(Math.floor);
    let left = 100 - floor.reduce((a, v) => a + v, 0);
    const order = exact.map((v, i) => [v - floor[i], i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < left; k++) floor[order[k % order.length][1]]++;
    const out = [];
    floor.forEach((nSquares, band) => { for (let i = 0; i < nSquares; i++) out.push(band); });
    while (out.length < 100) out.push(bands.length - 1);
    return out.slice(0, 100);
  }

  function renderScoreWaffle(el, bands, unit) {
    unit = unit || "codes";
    const palette = unit === "bodies" ? BAND_COLOURS_SHARED : BAND_COLOURS;
    const total = bands.reduce((a, b) => a + b.count, 0);
    const wrap = document.createElement("div");
    wrap.className = "waffle";
    waffleSquares(bands, total).forEach((band) => {
      const sq = document.createElement("i");
      sq.className = "waffle-sq";
      sq.style.background = palette[band];
      sq.title = `${bands[band].label}: ${bands[band].count.toLocaleString("en-GB")} ${unit}`;
      wrap.appendChild(sq);
    });
    const legend = document.createElement("div");
    legend.className = "waffle-legend";
    bands.forEach((b, i) => {
      const item = document.createElement("span");
      const sw = document.createElement("i"); sw.style.background = palette[i];
      item.appendChild(sw);
      item.appendChild(document.createTextNode(` ${b.label} — ${b.count.toLocaleString("en-GB")}`));
      legend.appendChild(item);
    });
    el.replaceChildren(wrap, legend);
  }

  const api = { available, onEchartsReady, cellColor, waffleSquares, renderHeatmap, renderScaleLegend, renderScoreWaffle, BAND_COLOURS, BAND_COLOURS_SHARED };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  return api;
})();
if (typeof window !== "undefined") window.Charts = Charts;
