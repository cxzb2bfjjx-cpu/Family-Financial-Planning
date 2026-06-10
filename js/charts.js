// ---------- Tandem · chart factory (ECharts) ----------

import { monthLabel, fmt, fmtCompact } from "./util.js";
import { catColor, catLabel } from "./categorize.js";

const E = window.echarts;

export const PALETTE = {
  p1: "#22d3ee", p2: "#fb7185", joint: "#a78bfa",
  income: "#34d399", expense: "#f87171",
  text: "#cbd5e1", dim: "#64748b", grid: "rgba(148,163,184,0.08)",
};

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;

const baseText = { color: PALETTE.text, fontFamily: FONT };

export function grad(color, dir = "v", a1 = 0.45, a2 = 0.02) {
  const [x2, y2] = dir === "v" ? [0, 1] : [1, 0];
  return new E.graphic.LinearGradient(0, 0, x2, y2, [
    { offset: 0, color: hexA(color, a1) },
    { offset: 1, color: hexA(color, a2) },
  ]);
}
export function hexA(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const charts = new Map();

export function mount(el, option, opts = {}) {
  if (!el) return null;
  let c = charts.get(el);
  if (!c || c.isDisposed()) {
    c = E.init(el, null, { renderer: "canvas" });
    charts.set(el, c);
  }
  c.setOption({ animationDuration: 700, animationEasing: "cubicOut", ...option }, { notMerge: true });
  if (opts.onClick) { c.off("click"); c.on("click", opts.onClick); }
  return c;
}
export function disposeAll() {
  for (const [el, c] of charts) { if (!document.body.contains(el)) { c.dispose(); charts.delete(el); } }
}
window.addEventListener("resize", () => { for (const c of charts.values()) if (!c.isDisposed()) c.resize(); });

const tooltip = (formatter) => ({
  trigger: "axis",
  backgroundColor: "rgba(10,14,25,0.92)",
  borderColor: "rgba(148,163,184,0.2)",
  borderWidth: 1,
  textStyle: { ...baseText, fontSize: 12 },
  ...(formatter ? { formatter } : {}),
  axisPointer: { type: "line", lineStyle: { color: "rgba(148,163,184,0.3)" } },
});

const xMonths = (keys) => ({
  type: "category",
  data: keys.map(monthLabel),
  axisLine: { lineStyle: { color: "rgba(148,163,184,0.18)" } },
  axisTick: { show: false },
  axisLabel: { color: PALETTE.dim, fontSize: 10, fontFamily: FONT },
});
const yMoney = (compact = true) => ({
  type: "value",
  splitLine: { lineStyle: { color: PALETTE.grid } },
  axisLabel: { color: PALETTE.dim, fontSize: 10, fontFamily: FONT, formatter: (v) => (compact ? shortMoney(v) : fmt(v)) },
});
export function shortMoney(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return `${sign}$${Math.round(a)}`;
}
const GRID = { left: 46, right: 14, top: 26, bottom: 26 };

// ---------- sparkline (KPI cards) ----------
export function spark(el, data, color = PALETTE.p1) {
  return mount(el, {
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: "category", show: false, data: data.map((_, i) => i) },
    yAxis: { type: "value", show: false, min: "dataMin", max: "dataMax" },
    series: [{
      type: "line", data, smooth: 0.5, symbol: "none",
      lineStyle: { width: 2, color }, areaStyle: { color: grad(color, "v", 0.35, 0) },
    }],
    animationDuration: 500,
  });
}

// ---------- net worth with optional dotted projection ----------
export function netWorth(el, keys, values, projKeys = [], projVals = []) {
  const allKeys = [...keys, ...projKeys];
  const histPad = [...values, ...projKeys.map(() => null)];
  const projPad = [...keys.map((_, i) => (i === keys.length - 1 ? values[i] : null)), ...projVals];
  return mount(el, {
    tooltip: tooltip((ps) => {
      const p = ps.find((p) => p.value != null);
      return p ? `<b>${p.axisValue}</b><br/>${p.seriesName}: <b>${fmt(p.value)}</b>` : "";
    }),
    grid: GRID,
    xAxis: xMonths(allKeys),
    yAxis: yMoney(),
    series: [
      {
        name: "Net worth", type: "line", data: histPad, smooth: 0.4, symbol: "none",
        lineStyle: { width: 3, color: PALETTE.joint, shadowColor: hexA(PALETTE.joint, 0.5), shadowBlur: 12 },
        areaStyle: { color: grad(PALETTE.joint) },
      },
      ...(projVals.length ? [{
        name: "Projected", type: "line", data: projPad, smooth: 0.4, symbol: "none",
        lineStyle: { width: 2, color: PALETTE.joint, type: "dashed", opacity: 0.7 },
      }] : []),
    ],
  });
}

// ---------- income vs expense bars + net line ----------
export function cashflow(el, rows) {
  return mount(el, {
    tooltip: tooltip(),
    legend: { textStyle: { ...baseText, fontSize: 11 }, top: 0, icon: "roundRect", itemWidth: 12, itemHeight: 6 },
    grid: { ...GRID, top: 34 },
    xAxis: xMonths(rows.map((r) => r.key)),
    yAxis: yMoney(),
    series: [
      { name: "Income", type: "bar", data: rows.map((r) => Math.round(r.income)), barWidth: "32%", itemStyle: { borderRadius: [4, 4, 0, 0], color: grad(PALETTE.income, "v", 0.95, 0.45) } },
      { name: "Spending", type: "bar", data: rows.map((r) => Math.round(r.expense)), barWidth: "32%", itemStyle: { borderRadius: [4, 4, 0, 0], color: grad(PALETTE.expense, "v", 0.9, 0.4) } },
      { name: "Net", type: "line", data: rows.map((r) => Math.round(r.net)), smooth: 0.4, symbol: "circle", symbolSize: 5, lineStyle: { width: 2, color: "#fbbf24" }, itemStyle: { color: "#fbbf24" } },
    ],
  });
}

// ---------- category donut ----------
export function donut(el, entries, onClick) {
  const total = entries.reduce((a, [, v]) => a + v, 0);
  return mount(el, {
    tooltip: { trigger: "item", backgroundColor: "rgba(10,14,25,0.92)", borderColor: "rgba(148,163,184,0.2)", textStyle: baseText, formatter: (p) => `${p.marker} ${p.name}: <b>${fmt(p.value)}</b> (${p.percent}%)` },
    series: [{
      type: "pie", radius: ["58%", "82%"], center: ["50%", "50%"],
      avoidLabelOverlap: true, padAngle: 2,
      itemStyle: { borderRadius: 8, borderColor: "#0b0f1a", borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, formatter: "{b}\n{d}%", color: PALETTE.text, fontSize: 12, fontWeight: 600 }, scaleSize: 6 },
      data: entries.map(([cat, v]) => ({ name: catLabel(cat), value: Math.round(v), catId: cat, itemStyle: { color: catColor(cat) } })),
    }],
    graphic: [{
      type: "text", left: "center", top: "middle",
      style: { text: `${shortMoney(total)}\nspent`, textAlign: "center", fill: PALETTE.text, fontSize: 15, fontWeight: 700, lineHeight: 18, fontFamily: FONT },
    }],
  }, { onClick });
}

// ---------- sankey: where the money flows ----------
export function sankey(el, incomeBySource, spendByCat, netSavings) {
  const nodes = [], links = [];
  const seen = new Set();
  const add = (name, color) => { if (!seen.has(name)) { seen.add(name); nodes.push({ name, itemStyle: { color, borderWidth: 0 } }); } };
  add("Household", "#94a3b8");
  for (const [src, v] of incomeBySource) {
    add(src, PALETTE.income);
    links.push({ source: src, target: "Household", value: Math.round(v) });
  }
  for (const [cat, v] of spendByCat) {
    add(catLabel(cat), catColor(cat));
    links.push({ source: "Household", target: catLabel(cat), value: Math.round(v) });
  }
  if (netSavings > 0) {
    add("💰 Saved", "#2dd4bf");
    links.push({ source: "Household", target: "💰 Saved", value: Math.round(netSavings) });
  }
  return mount(el, {
    tooltip: { trigger: "item", backgroundColor: "rgba(10,14,25,0.92)", borderColor: "rgba(148,163,184,0.2)", textStyle: baseText, formatter: (p) => p.dataType === "edge" ? `${p.data.source} → ${p.data.target}: <b>${fmt(p.data.value)}</b>` : p.name },
    series: [{
      type: "sankey", left: 8, right: 110, top: 10, bottom: 10,
      nodeWidth: 12, nodeGap: 10, nodeAlign: "justify",
      data: nodes, links,
      lineStyle: { color: "gradient", opacity: 0.28, curveness: 0.55 },
      label: { color: PALETTE.text, fontSize: 11, fontFamily: FONT, formatter: (p) => p.name },
      itemStyle: { borderRadius: 4 },
      emphasis: { focus: "adjacency" },
    }],
  });
}

// ---------- calendar heatmap of daily spending ----------
export function heatmap(el, start, end, map) {
  const data = [...map.entries()].map(([d, v]) => [d, Math.round(v)]);
  const max = Math.max(60, ...data.map((d) => d[1]));
  return mount(el, {
    tooltip: { backgroundColor: "rgba(10,14,25,0.92)", borderColor: "rgba(148,163,184,0.2)", textStyle: baseText, formatter: (p) => `${p.value[0]}<br/>Spent: <b>${fmt(p.value[1])}</b>` },
    visualMap: {
      min: 0, max, show: false,
      inRange: { color: ["rgba(34,211,238,0.06)", "rgba(34,211,238,0.45)", "rgba(167,139,250,0.85)", "rgba(251,113,133,1)"] },
    },
    calendar: {
      range: [start, end], left: 28, right: 6, top: 22, bottom: 4, cellSize: ["auto", 13],
      itemStyle: { color: "rgba(148,163,184,0.04)", borderColor: "#0b0f1a", borderWidth: 2.5, borderRadius: 3 },
      splitLine: { show: false },
      dayLabel: { color: PALETTE.dim, fontSize: 9, firstDay: 1, nameMap: ["S", "M", "T", "W", "T", "F", "S"] },
      monthLabel: { color: PALETTE.dim, fontSize: 10 },
      yearLabel: { show: false },
    },
    series: [{ type: "heatmap", coordinateSystem: "calendar", data }],
  });
}

// ---------- radar: who spends on what ----------
export function radar(el, cats, p1Vals, p2Vals, p1Name, p2Name) {
  return mount(el, {
    tooltip: { trigger: "item", backgroundColor: "rgba(10,14,25,0.92)", borderColor: "rgba(148,163,184,0.2)", textStyle: baseText },
    legend: { textStyle: { ...baseText, fontSize: 11 }, top: 0, icon: "circle", itemWidth: 8 },
    radar: {
      // per-axis max, so one giant category (hi, mortgage) doesn't flatten the rest
      indicator: cats.map((c, i) => ({ name: catLabel(c), max: Math.max(p1Vals[i], p2Vals[i], 1) * 1.2 })),
      radius: "62%", center: ["50%", "55%"],
      splitArea: { areaStyle: { color: ["rgba(148,163,184,0.02)", "rgba(148,163,184,0.05)"] } },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.12)" } },
      axisLine: { lineStyle: { color: "rgba(148,163,184,0.12)" } },
      axisName: { color: PALETTE.dim, fontSize: 10, fontFamily: FONT },
    },
    series: [{
      type: "radar",
      data: [
        { name: p1Name, value: p1Vals.map(Math.round), lineStyle: { color: PALETTE.p1, width: 2 }, itemStyle: { color: PALETTE.p1 }, areaStyle: { color: hexA(PALETTE.p1, 0.25) }, symbolSize: 4 },
        { name: p2Name, value: p2Vals.map(Math.round), lineStyle: { color: PALETTE.p2, width: 2 }, itemStyle: { color: PALETTE.p2 }, areaStyle: { color: hexA(PALETTE.p2, 0.25) }, symbolSize: 4 },
      ],
    }],
  });
}

// ---------- stacked category trend ----------
export function categoryTrend(el, keys, byCat) {
  const series = Object.entries(byCat).map(([cat, vals]) => ({
    name: catLabel(cat), type: "line", stack: "total", smooth: 0.4, symbol: "none",
    lineStyle: { width: 0 }, areaStyle: { color: hexA(catColor(cat), 0.55) }, emphasis: { focus: "series" },
    data: vals.map(Math.round), itemStyle: { color: catColor(cat) },
  }));
  return mount(el, {
    tooltip: tooltip((ps) => {
      const rows = ps.filter((p) => p.value > 0).sort((a, b) => b.value - a.value)
        .map((p) => `${p.marker} ${p.seriesName}: <b>${fmt(p.value)}</b>`).join("<br/>");
      const total = ps.reduce((a, p) => a + (p.value || 0), 0);
      return `<b>${ps[0]?.axisValue}</b> · total ${fmt(total)}<br/>${rows}`;
    }),
    legend: { type: "scroll", textStyle: { ...baseText, fontSize: 10 }, top: 0, icon: "circle", itemWidth: 8, pageIconColor: PALETTE.text },
    grid: { ...GRID, top: 34 },
    xAxis: xMonths(keys),
    yAxis: yMoney(),
    series,
  });
}

// ---------- Monte Carlo fan chart ----------
export function fan(el, keys, bands, color = PALETTE.p1, historical = null) {
  const diff = (a, b) => a.map((v, i) => Math.max(0, b[i] - v));
  const series = [
    { name: "_base", type: "line", data: bands.p10.map(Math.round), stack: "fan", symbol: "none", lineStyle: { width: 0 }, silent: true },
    { name: "10–25%", type: "line", data: diff(bands.p10, bands.p25).map(Math.round), stack: "fan", symbol: "none", lineStyle: { width: 0 }, areaStyle: { color: hexA(color, 0.10) }, silent: true },
    { name: "25–75%", type: "line", data: diff(bands.p25, bands.p75).map(Math.round), stack: "fan", symbol: "none", lineStyle: { width: 0 }, areaStyle: { color: hexA(color, 0.22) }, silent: true },
    { name: "75–90%", type: "line", data: diff(bands.p75, bands.p90).map(Math.round), stack: "fan", symbol: "none", lineStyle: { width: 0 }, areaStyle: { color: hexA(color, 0.10) }, silent: true },
    { name: "Median path", type: "line", data: bands.p50.map(Math.round), symbol: "none", smooth: 0.3, lineStyle: { width: 2.5, color, shadowColor: hexA(color, 0.4), shadowBlur: 10 } },
  ];
  if (historical) series.push({ name: "So far", type: "line", data: historical, symbol: "none", lineStyle: { width: 2, color: PALETTE.text } });
  return mount(el, {
    tooltip: tooltip((ps) => {
      const med = ps.find((p) => p.seriesName === "Median path");
      if (!med) return "";
      const i = med.dataIndex;
      return `Optimistic (90th): <b>${shortMoney(bands.p90[i])}</b><br/>Median: <b>${shortMoney(bands.p50[i])}</b><br/>Pessimistic (10th): <b>${shortMoney(bands.p10[i])}</b>`;
    }),
    grid: GRID,
    // keys arrive pre-formatted here (sparse year labels for long horizons)
    xAxis: {
      type: "category", data: keys, axisTick: { show: false },
      axisLine: { lineStyle: { color: "rgba(148,163,184,0.18)" } },
      axisLabel: { color: PALETTE.dim, fontSize: 10, interval: (i, v) => v !== "" },
    },
    yAxis: yMoney(),
    series,
  });
}

// ---------- forecast: history + band ----------
export function forecast(el, histKeys, histVals, fc, color = "#fbbf24") {
  const keys = [...histKeys, ...fc.map((f) => f.key)];
  const nH = histKeys.length;
  const histPad = [...histVals, ...fc.map(() => null)];
  const bridge = (arr) => [...histKeys.map((_, i) => (i === nH - 1 ? histVals[i] : null)), ...arr];
  const lo = bridge(fc.map((f) => Math.round(f.lo)));
  const hiDiff = bridge(fc.map((f) => Math.round(f.hi - f.lo)));
  const mid = bridge(fc.map((f) => Math.round(f.mid)));
  return mount(el, {
    tooltip: tooltip((ps) => {
      const rows = ps.filter((p) => p.value != null && !p.seriesName.startsWith("_"))
        .map((p) => `${p.marker} ${p.seriesName}: <b>${fmt(p.value)}</b>`).join("<br/>");
      return `<b>${ps[0]?.axisValue}</b><br/>${rows}`;
    }),
    grid: GRID,
    xAxis: xMonths(keys),
    yAxis: yMoney(),
    series: [
      { name: "Actual", type: "line", data: histPad, smooth: 0.4, symbol: "none", lineStyle: { width: 2.5, color: PALETTE.p1 }, areaStyle: { color: grad(PALETTE.p1, "v", 0.25, 0) } },
      { name: "_lo", type: "line", data: lo, stack: "band", symbol: "none", lineStyle: { width: 0 }, silent: true },
      { name: "_band", type: "line", data: hiDiff, stack: "band", symbol: "none", lineStyle: { width: 0 }, areaStyle: { color: hexA(color, 0.15) }, silent: true },
      { name: "Forecast", type: "line", data: mid, smooth: 0.4, symbol: "none", lineStyle: { width: 2, type: "dashed", color } },
    ],
  });
}

// ---------- normalized comparison (401k vs S&P) ----------
export function compare(el, keys, seriesDefs) {
  return mount(el, {
    tooltip: tooltip((ps) => {
      const rows = ps.filter((p) => p.value != null).map((p) => `${p.marker} ${p.seriesName}: <b>${(p.value - 100).toFixed(1)}%</b>`).join("<br/>");
      return `<b>${ps[0]?.axisValue}</b> (growth since start)<br/>${rows}`;
    }),
    legend: { textStyle: { ...baseText, fontSize: 11 }, top: 0, icon: "circle", itemWidth: 8 },
    grid: { ...GRID, top: 34 },
    xAxis: xMonths(keys),
    yAxis: { ...yMoney(), scale: true, axisLabel: { color: PALETTE.dim, fontSize: 10, formatter: (v) => `${(v - 100).toFixed(0)}%` } },
    series: seriesDefs.map((s) => ({
      name: s.name, type: "line", data: s.data.map((v) => (v == null ? null : +v.toFixed(1))),
      smooth: 0.3, symbol: "none",
      lineStyle: { width: s.emphasizeWidth || 2.5, color: s.color, type: s.dashed ? "dashed" : "solid", shadowColor: s.dashed ? "transparent" : hexA(s.color, 0.4), shadowBlur: s.dashed ? 0 : 8 },
      areaStyle: s.area ? { color: grad(s.color, "v", 0.2, 0) } : undefined,
    })),
  });
}

// ---------- savings gauge ----------
export function gauge(el, rate) {
  const pct = Math.round(rate * 100);
  const color = pct >= 20 ? PALETTE.income : pct >= 8 ? "#fbbf24" : PALETTE.expense;
  return mount(el, {
    series: [{
      type: "gauge", startAngle: 205, endAngle: -25, min: -10, max: 50,
      radius: "98%", center: ["50%", "62%"],
      pointer: { show: false },
      progress: { show: true, width: 12, roundCap: true, itemStyle: { color: new E.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: hexA(color, 0.5) }, { offset: 1, color }]) } },
      axisLine: { lineStyle: { width: 12, color: [[1, "rgba(148,163,184,0.1)"]] } },
      axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
      anchor: { show: false },
      title: { show: true, offsetCenter: [0, 24], color: PALETTE.dim, fontSize: 11, fontFamily: FONT },
      detail: { valueAnimation: true, offsetCenter: [0, -6], formatter: "{value}%", color: PALETTE.text, fontSize: 26, fontWeight: 700, fontFamily: FONT },
      data: [{ value: pct, name: "savings rate" }],
    }],
  });
}

// ---------- horizontal top merchants ----------
export function topBars(el, entries, color = PALETTE.p2) {
  const data = [...entries].reverse();
  return mount(el, {
    tooltip: { trigger: "item", backgroundColor: "rgba(10,14,25,0.92)", borderColor: "rgba(148,163,184,0.2)", textStyle: baseText, formatter: (p) => `${p.name}: <b>${fmt(p.value)}</b>` },
    grid: { left: 8, right: 40, top: 6, bottom: 6, containLabel: true },
    xAxis: { type: "value", show: false },
    yAxis: { type: "category", data: data.map(([m]) => m.length > 18 ? m.slice(0, 17) + "…" : m), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: PALETTE.text, fontSize: 11, fontFamily: FONT } },
    series: [{
      type: "bar", data: data.map(([, v]) => Math.round(v)), barWidth: 12,
      itemStyle: { borderRadius: 6, color: grad(color, "h", 0.9, 0.35) },
      label: { show: true, position: "right", color: PALETTE.dim, fontSize: 10, fontFamily: FONT, formatter: (p) => shortMoney(p.value) },
    }],
  });
}

// ---------- subscription creep ----------
export function subCreep(el, rows) {
  return mount(el, {
    tooltip: tooltip(),
    grid: GRID,
    xAxis: xMonths(rows.map((r) => r.key)),
    yAxis: yMoney(),
    series: [{
      name: "Recurring / mo", type: "line", data: rows.map((r) => +r.total.toFixed(2)),
      smooth: 0.4, symbol: "circle", symbolSize: 4,
      lineStyle: { width: 2.5, color: "#22d3ee" }, itemStyle: { color: "#22d3ee" },
      areaStyle: { color: grad("#22d3ee") },
    }],
  });
}

// ---------- market benchmark with projection cone ----------
export function benchmark(el, series, projection) {
  const histKeys = series.map((s) => s[0]);
  const keys = [...histKeys, ...projection.map((p) => p.key)];
  const nH = histKeys.length;
  const hist = [...series.map((s) => s[1]), ...projection.map(() => null)];
  const bridge = (arr) => [...histKeys.map((_, i) => (i === nH - 1 ? series[i][1] : null)), ...arr];
  return mount(el, {
    tooltip: tooltip((ps) => {
      const rows = ps.filter((p) => p.value != null && !p.seriesName.startsWith("_"))
        .map((p) => `${p.marker} ${p.seriesName}: <b>${Math.round(p.value).toLocaleString()}</b>`).join("<br/>");
      return `<b>${ps[0]?.axisValue}</b><br/>${rows}`;
    }),
    grid: GRID,
    xAxis: { ...xMonths(keys), axisLabel: { color: PALETTE.dim, fontSize: 10, interval: Math.max(1, Math.floor(keys.length / 9)) } },
    yAxis: { ...yMoney(), min: "dataMin", axisLabel: { color: PALETTE.dim, fontSize: 10, formatter: (v) => Math.round(v / 100) * 100 >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v) } },
    series: [
      { name: "S&P 500", type: "line", data: hist, symbol: "none", smooth: 0.2, lineStyle: { width: 2.5, color: PALETTE.income }, areaStyle: { color: grad(PALETTE.income, "v", 0.2, 0) } },
      { name: "_lo", type: "line", data: bridge(projection.map((p) => Math.round(p.lo))), stack: "cone", symbol: "none", lineStyle: { width: 0 }, silent: true },
      { name: "_cone", type: "line", data: bridge(projection.map((p) => Math.round(p.hi - p.lo))), stack: "cone", symbol: "none", lineStyle: { width: 0 }, areaStyle: { color: "rgba(52,211,153,0.12)" }, silent: true },
      { name: "Trend path", type: "line", data: bridge(projection.map((p) => Math.round(p.mid))), symbol: "none", lineStyle: { width: 2, type: "dashed", color: PALETTE.income, opacity: 0.8 } },
    ],
  });
}
