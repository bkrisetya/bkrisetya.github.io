"use strict";

/* Charts for the EIC dashboard. ECharts via CDN when available; otherwise a plain
 * DOM/SVG fallback. Force the fallback with ?nocharts=1 (test hook). */

const Charts = (() => {
  const TEAL = [0x18, 0x99, 0xa2], MAGENTA = [0xe4, 0x1e, 0x7c], GREY = "#C3CAD5";

  function cellColor(share) {
    if (share === null || share === undefined || isNaN(share)) return GREY;
    const t = Math.max(0, Math.min(1, share));
    const mix = TEAL.map((c, i) => Math.round(c + (MAGENTA[i] - c) * (1 - t)));
    return "#" + mix.map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  function available() {
    if (typeof window === "undefined") return false;
    if (new URLSearchParams(window.location.search).has("nocharts")) return false;
    return !!window.echarts;
  }

  /* ---------- heatmap ---------- */
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
      yAxis: { type: "category", data: hm.rows.map((r) => r.name), inverse: true, axisLabel: { fontSize: 11 }, axisTick: { show: false }, axisLine: { show: false } },
      tooltip: { formatter: (p) => {
        const c = p.data.cell, r = hm.rows[p.value[1]], col = hm.cols[p.value[0]];
        return c.total ? `${r.name} · ${col.name}<br>${c.yes} of ${c.total} coded codes mention it` : `${r.name} · ${col.name}<br>No codes read yet`;
      } },
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
      const th = document.createElement("th"); th.className = "hm-cat"; th.textContent = r.name; tr.appendChild(th);
      hm.cols.forEach((c) => {
        const cell = hm.cells.get(r.name + "|" + c.id) || { share: null, total: 0, yes: 0 };
        const td = tr.insertCell();
        const btn = document.createElement("button");
        btn.className = "hm-cell"; btn.type = "button"; btn.style.width = "100%";
        btn.style.background = cellColor(cell.share);
        btn.title = cell.total ? `${r.name} · ${c.name}: ${cell.yes} of ${cell.total} coded codes mention it` : `${r.name} · ${c.name}: no codes read yet`;
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
    g.appendChild(sw); g.appendChild(document.createTextNode(" not read yet"));
    el.appendChild(g);
  }

  /* ---------- score distribution ---------- */
  function renderDistribution(el, bins) {
    if (available()) {
      const chart = echarts.init(el);
      chart.setOption({
        grid: { left: 8, right: 8, top: 24, bottom: 24, containLabel: true },
        xAxis: { type: "category", data: bins.map((b) => String(b.score)), name: "principles mentioned", nameLocation: "middle", nameGap: 26, axisTick: { show: false } },
        yAxis: { type: "value", splitLine: { lineStyle: { color: "#d8dcfc" } } },
        tooltip: { formatter: (p) => `${p.value} codes mention ${p.name} of the 7 principles` },
        series: [{ type: "bar", data: bins.map((b) => b.count), itemStyle: { color: "#1899A2", borderRadius: [4, 4, 0, 0] }, label: { show: true, position: "top", fontWeight: 600 } }],
      });
      window.addEventListener("resize", () => chart.resize());
      return chart;
    }
    const max = Math.max(...bins.map((b) => b.count), 1);
    const wrap = document.createElement("div");
    wrap.className = "dist-fallback";
    bins.forEach((b) => {
      const col = document.createElement("div"); col.className = "dist-col";
      const n = document.createElement("div"); n.className = "n"; n.textContent = b.count.toLocaleString("en-GB");
      const bar = document.createElement("div"); bar.className = "bar"; bar.style.height = Math.max(2, (b.count / max) * 100) + "%";
      const s = document.createElement("div"); s.className = "s"; s.textContent = String(b.score);
      col.title = `${b.count} codes mention ${b.score} of the 7 principles`;
      col.append(n, bar, s); wrap.appendChild(col);
    });
    el.replaceChildren(wrap);
  }

  const api = { available, cellColor, renderHeatmap, renderDistribution, renderScaleLegend };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  return api;
})();
if (typeof window !== "undefined") window.Charts = Charts;
