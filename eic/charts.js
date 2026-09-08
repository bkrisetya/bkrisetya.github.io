"use strict";

/* Charts for the EIC dashboard. ECharts via CDN when available; otherwise a plain
 * DOM/SVG fallback. Force the fallback with ?nocharts=1 (test hook). */

const Charts = (() => {
  const TEAL = [0x18, 0x99, 0xa2], DEEP_TEAL = [0x08, 0x45, 0x4c], GREY = "#C3CAD5";
  const PAPER = [0xf4, 0xf6, 0xfe]; // 0% share: looks empty, because nothing is there

  const hex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  /* Sequential teal scale: 0% = near-paper (empty, not celebrated), 50% = EIC teal,
   * 100% = deep teal. Colour carries exactly one meaning: how many of the sector's
   * codes mention the principle. No endpoint is "rewarded"; ink is earned by mentions. */
  function shareColour(share) {
    const s = Math.max(0, Math.min(1, share));
    return s <= 0.5 ? lerp(PAPER, TEAL, s * 2) : lerp(TEAL, DEEP_TEAL, (s - 0.5) * 2);
  }

  function cellColor(share) {
    if (share === null || share === undefined || isNaN(share)) return GREY;
    return hex(shareColour(share));
  }

  function available() {
    if (typeof window === "undefined") return false;
    if (new URLSearchParams(window.location.search).has("nocharts")) return false;
    return !!window.echarts;
  }

  /* ---------- heatmap ---------- */
  function tipText(cat, principleName, cell) {
    if (!cell.total) return `${principleName} — ${cat}\nWe have not read any codes in this sector yet.`;
    let t = `${principleName} — ${cat}\n${cell.yes} of the ${cell.total} codes we read mention this principle.`;
    if (cell.note) t += `\n${cell.note}`;
    return t;
  }

  function renderHeatmap(el, hm, onCellClick) {
    if (available()) return echartsHeatmap(el, hm, onCellClick);
    return domHeatmap(el, hm, onCellClick);
  }

  function echartsHeatmap(el, hm, onCellClick) {
    const chart = echarts.init(el, null, { renderer: "canvas" });
    el.style.height = Math.max(220, hm.rows.length * 34 + 60) + "px";
    const data = [];
    hm.rows.forEach((r, y) => hm.cols.forEach((c, x) => {
      const cell = hm.cells.get(r.name + "|" + c.id) || { share: null, total: 0, yes: 0 };
      data.push({ value: [x, y, cell.share], cell, itemStyle: { color: cellColor(cell.share), borderColor: "#fff", borderWidth: 2 } });
    }));
    chart.setOption({
      grid: { left: 4, right: 8, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: hm.cols.map((c) => c.name), axisLabel: { fontSize: 11, interval: 0, rotate: 30 }, axisTick: { show: false }, axisLine: { show: false } },
      yAxis: { type: "category", data: hm.rows.map((r) => r.label || r.name), inverse: true, axisLabel: { fontSize: 11 }, axisTick: { show: false }, axisLine: { show: false } },
      tooltip: { formatter: (p) => tipText(hm.rows[p.value[1]].label || hm.rows[p.value[1]].name, hm.cols[p.value[0]].name, p.data.cell).replace(/\n/g, "<br>") },
      series: [{ type: "heatmap", data, label: { show: false }, emphasis: { itemStyle: { borderColor: "#1A1463", borderWidth: 2 } } }],
    });
    chart.on("click", (p) => { const r = hm.rows[p.value[1]], c = hm.cols[p.value[0]]; const cell = hm.cells.get(r.name + "|" + c.id); if (cell && cell.total) onCellClick(r.name, c.id); });
    window.addEventListener("resize", () => chart.resize());
    return chart;
  }

  function domHeatmap(el, hm, onCellClick) {
    const table = document.createElement("table");
    table.className = "hm-table";
    const head = table.createTHead().insertRow();
    head.appendChild(document.createElement("th")).className = "hm-cat";
    hm.cols.forEach((c) => { const th = document.createElement("th"); th.textContent = c.name; head.appendChild(th); });
    head.appendChild(document.createElement("th")).textContent = "Codes read";
    const body = table.createTBody();
    hm.rows.forEach((r) => {
      const tr = body.insertRow();
      const th = document.createElement("th"); th.className = "hm-cat"; th.textContent = r.label || r.name; tr.appendChild(th);
      hm.cols.forEach((c) => {
        const cell = hm.cells.get(r.name + "|" + c.id) || { share: null, total: 0, yes: 0 };
        const td = tr.insertCell();
        const btn = document.createElement("button");
        btn.className = "hm-cell"; btn.type = "button"; btn.style.width = "100%";
        btn.style.background = cellColor(cell.share);
        btn.title = tipText(r.label || r.name, c.name, cell);
        btn.dataset.cat = r.name; btn.dataset.pid = c.id;
        if (!cell.total) btn.disabled = true;
        else btn.addEventListener("click", () => onCellClick(r.name, c.id));
        td.appendChild(btn);
      });
      const tdN = tr.insertCell(); tdN.className = "hm-count"; tdN.textContent = String(r.coded);
    });
    el.replaceChildren(table);
  }

  function renderScaleLegend(el) {
    el.replaceChildren();
    const mk = (txt) => { const s = document.createElement("span"); s.textContent = txt; return s; };
    el.appendChild(mk("None mention it"));
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      const sw = document.createElement("i"); sw.className = "sw"; sw.style.background = cellColor(v); el.appendChild(sw);
    });
    el.appendChild(mk("All mention it"));
    const g = document.createElement("span");
    const sw = document.createElement("i"); sw.className = "sw"; sw.style.background = GREY;
    g.appendChild(sw); g.appendChild(document.createTextNode(" none read yet"));
    el.appendChild(g);
  }

  /* ---------- score waffle ---------- */
  /* EIC families as a readable progression: magenta -> purple -> sky -> teal */
  const BAND_COLOURS = ["#E41E7C", "#9851FB", "#3CB7F4", "#1899A2"]; // none / 1-2 / 3-5 / 6-7

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

  function renderScoreWaffle(el, bands) {
    const total = bands.reduce((a, b) => a + b.count, 0);
    const wrap = document.createElement("div");
    wrap.className = "waffle";
    waffleSquares(bands, total).forEach((band) => {
      const sq = document.createElement("i");
      sq.className = "waffle-sq";
      sq.style.background = BAND_COLOURS[band];
      sq.title = `${bands[band].label}: ${bands[band].count.toLocaleString("en-GB")} codes`;
      wrap.appendChild(sq);
    });
    const legend = document.createElement("div");
    legend.className = "waffle-legend";
    bands.forEach((b, i) => {
      const item = document.createElement("span");
      const sw = document.createElement("i"); sw.style.background = BAND_COLOURS[i];
      item.appendChild(sw);
      item.appendChild(document.createTextNode(` ${b.label} — ${b.count.toLocaleString("en-GB")}`));
      legend.appendChild(item);
    });
    el.replaceChildren(wrap, legend);
  }

  const api = { available, cellColor, waffleSquares, renderHeatmap, renderScaleLegend, renderScoreWaffle, BAND_COLOURS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  return api;
})();
if (typeof window !== "undefined") window.Charts = Charts;
