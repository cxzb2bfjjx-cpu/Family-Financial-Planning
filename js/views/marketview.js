// ---------- Tandem · market & your 401(k) vs the world ----------

import { getState } from "../store.js";
import { fmt, escapeHtml, monthKey, fmtPctPlain } from "../util.js";
import { dietzSeries } from "../finance.js";
import { getQuotes, SYMBOLS, sparkHistory, marketInsights, benchmarkMonthly, benchmarkProjection } from "../market.js";
import * as charts from "../charts.js";
import { insightHtml } from "./dashboard.js";

export async function renderMarket(root, navigate) {
  const state = getState();
  root.innerHTML = `<div class="empty"><div class="big">📡</div>Reading the tape…</div>`;

  const { quotes, provider, fetchedAt, error } = await getQuotes();
  const insights = marketInsights(quotes);
  const series = benchmarkMonthly();
  const projection = benchmarkProjection(12);

  // ----- your retirement accounts vs the benchmark -----
  const retireAccs = state.accounts.filter((a) => ["401k", "investment"].includes(a.type));
  const comparisons = retireAccs.map((acc) => {
    const snaps = state.snapshots.filter((s) => s.accountId === acc.id);
    return { acc, dietz: dietzSeries(snaps) };
  }).filter((c) => c.dietz.length >= 3);

  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div class="muted">
        ${provider === "demo"
          ? `🧪 <b>Demo quotes</b> — add a free API key in ⚙️ Settings for live data`
          : `🟢 Live via ${provider} · ${new Date(fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
        ${error ? `<br/>⚠️ ${escapeHtml(error)} — showing demo data` : ""}
      </div>
      <button class="btn small ghost" id="btn-refresh">↻ refresh</button>
    </div>

    <div class="quotes">
      ${quotes.map((q) => {
        const meta = SYMBOLS.find((s) => s.symbol === q.symbol) || {};
        const up = q.changePct >= 0;
        return `<div class="quote">
          <div class="sym">${q.symbol}${q.demo ? " · demo" : ""}</div>
          <div class="nm">${meta.label || q.symbol}</div>
          <div class="px">$${q.price.toFixed(2)}</div>
          <div class="chg ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(q.changePct).toFixed(2)}%</div>
          <div class="spark" id="spark-${q.symbol}"></div>
        </div>`;
      }).join("")}
    </div>

    <div class="section-title">Why the market is doing what it's doing</div>
    ${insights.map(insightHtml).join("")}

    <div class="grid" style="margin-top:14px">
      <div class="card s12" style="grid-column: span 12">
        <h3>S&P 500 · the long game <span class="sub">monthly closes + 12-mo trend cone</span></h3>
        <div class="chart tall" id="ch-bench"></div>
        <p class="muted" style="margin-top:6px">Bundled benchmark history is approximate (±1%); months newer than it are trend-estimated until live quotes (free key in ⚙️ Settings) take over. The dashed cone is a trend extrapolation with an uncertainty band — a compass, not a promise.</p>
      </div>
    </div>

    <div class="section-title">Your retirement money vs the market</div>
    ${comparisons.length ? comparisons.map((c, i) => comparisonCard(c, i)).join("") : `
      <div class="card">
        <div class="empty"><div class="big">🪺</div>
          No 401(k) history to compare yet.<br/>
          <span class="muted">Add a 401(k)/investment account on the Dashboard, then log its balance + your contributions once a month
          (statement day works great). After 3 snapshots, Tandem computes your <b>personal rate of return</b>
          (Modified Dietz — the same math advisors use) and plots it against the S&P 500 right here.</span>
        </div>
      </div>`}
  `;

  // charts
  for (const q of quotes) {
    const el = root.querySelector(`#spark-${q.symbol}`);
    if (el) charts.spark(el, sparkHistory(q.symbol, quotes), q.changePct >= 0 ? charts.PALETTE.income : charts.PALETTE.expense);
  }
  charts.benchmark(root.querySelector("#ch-bench"), series.slice(-48), projection);

  comparisons.forEach((c, i) => mountComparison(root, c, i, series));

  root.querySelector("#btn-refresh").addEventListener("click", async () => {
    await getQuotes(true);
    navigate(null);
  });
}

function comparisonCard({ acc, dietz }, i) {
  return `
    <div class="card" style="margin-bottom:14px">
      <h3>${escapeHtml(acc.name)} vs S&P 500 <span class="sub">growth of equal starting value — contributions stripped out</span></h3>
      <div class="chart" id="ch-cmp-${i}"></div>
      <div class="statgrid" id="st-cmp-${i}"></div>
      <p class="muted" id="note-cmp-${i}"></p>
    </div>`;
}

function mountComparison(root, { acc, dietz }, i, benchSeries) {
  // align: personal index by month; benchmark normalized to 100 at the personal series' first month
  const keys = dietz.map((d) => monthKey(d.date));
  const personal = dietz.map((d) => d.index);
  const benchMap = new Map(benchSeries);
  const firstBench = findBench(benchMap, keys[0]);
  const bench = keys.map((k) => {
    const v = findBench(benchMap, k);
    return v && firstBench ? (v / firstBench) * 100 : null;
  });

  charts.compare(root.querySelector(`#ch-cmp-${i}`), keys, [
    { name: "Your " + (acc.type === "401k" ? "401(k)" : "portfolio"), data: personal, color: charts.PALETTE.p1, area: true },
    { name: "S&P 500", data: bench, color: charts.PALETTE.income, dashed: true },
  ]);

  const youTotal = personal[personal.length - 1] / 100 - 1;
  const spTotal = (bench[bench.length - 1] ?? 100) / 100 - 1;
  const months = personal.length - 1;
  const you1y = trailing(personal, 12), sp1y = trailing(bench, 12);
  const gap = youTotal - spTotal;

  root.querySelector(`#st-cmp-${i}`).innerHTML = `
    <div class="stat"><div class="l">You · ${months}mo</div><div class="v ${cls(youTotal)}">${pct(youTotal)}</div></div>
    <div class="stat"><div class="l">S&P · same span</div><div class="v ${cls(spTotal)}">${pct(spTotal)}</div></div>
    <div class="stat"><div class="l">Gap</div><div class="v ${cls(gap)}">${pct(gap)}</div></div>
    ${you1y != null ? `<div class="stat"><div class="l">You · 1yr</div><div class="v ${cls(you1y)}">${pct(you1y)}</div></div>` : ""}
    ${sp1y != null ? `<div class="stat"><div class="l">S&P · 1yr</div><div class="v ${cls(sp1y)}">${pct(sp1y)}</div></div>` : ""}
  `;

  const note = root.querySelector(`#note-cmp-${i}`);
  if (Math.abs(gap) < 0.02)
    note.textContent = "You're tracking the index almost exactly — typical for a target-date or index-heavy fund. Boring is beautiful here.";
  else if (gap > 0)
    note.textContent = "You're ahead of the S&P over this span. Check whether that's skill, luck, or a hot sector tilt before celebrating too hard — and remember the comparison strips out your contributions, so this is pure investment performance.";
  else
    note.textContent = "You're trailing the S&P. Common (and often fine) reasons: bond/international allocation in a target-date fund smoothing the ride, or fund fees. If the gap keeps widening, the expense ratios in your plan are worth ten minutes of your time.";
}

function findBench(map, key) {
  if (map.has(key)) return map.get(key);
  // fall back to nearest earlier month (snapshot mid-month etc.)
  for (let i = 0; i < 3; i++) {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 - (i + 1), 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (map.has(k)) return map.get(k);
  }
  return null;
}
function trailing(series, n) {
  if (series.length <= n) return null;
  const a = series[series.length - 1 - n], b = series[series.length - 1];
  return a && b ? b / a - 1 : null;
}
const cls = (v) => (v >= 0 ? "pos" : "neg");
const pct = (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
