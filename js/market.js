// ---------- Tandem · market data & insights ----------
// Live quotes come from a FREE api key (Finnhub or Alpha Vantage) that you create yourself —
// no paid aggregators, no bank linking. Without a key the tab runs in clearly-labeled demo mode.

import { rng, todayISO, monthKey, lastNMonthKeys, mean, std, linreg } from "./util.js";
import { getState, logQuotes } from "./store.js";

// Approximate S&P 500 month-end closes, bundled so the 401(k) benchmark works offline
// with zero setup. Update via Settings → "Benchmark", or it extends itself from live
// SPY quotes once you add a key. Values are approximate (±1%), which is plenty for
// "is my 401k keeping up?" — not for trading.
export const SP500_MONTHLY = [
  ["2019-01", 2704], ["2019-02", 2784], ["2019-03", 2834], ["2019-04", 2945], ["2019-05", 2752], ["2019-06", 2941],
  ["2019-07", 2980], ["2019-08", 2926], ["2019-09", 2976], ["2019-10", 3037], ["2019-11", 3140], ["2019-12", 3230],
  ["2020-01", 3225], ["2020-02", 2954], ["2020-03", 2584], ["2020-04", 2912], ["2020-05", 3044], ["2020-06", 3100],
  ["2020-07", 3271], ["2020-08", 3500], ["2020-09", 3363], ["2020-10", 3269], ["2020-11", 3621], ["2020-12", 3756],
  ["2021-01", 3714], ["2021-02", 3811], ["2021-03", 3972], ["2021-04", 4181], ["2021-05", 4204], ["2021-06", 4297],
  ["2021-07", 4395], ["2021-08", 4522], ["2021-09", 4307], ["2021-10", 4605], ["2021-11", 4567], ["2021-12", 4766],
  ["2022-01", 4515], ["2022-02", 4373], ["2022-03", 4530], ["2022-04", 4131], ["2022-05", 4132], ["2022-06", 3785],
  ["2022-07", 4130], ["2022-08", 3955], ["2022-09", 3585], ["2022-10", 3871], ["2022-11", 4080], ["2022-12", 3839],
  ["2023-01", 4076], ["2023-02", 3970], ["2023-03", 4109], ["2023-04", 4169], ["2023-05", 4179], ["2023-06", 4450],
  ["2023-07", 4588], ["2023-08", 4507], ["2023-09", 4288], ["2023-10", 4193], ["2023-11", 4567], ["2023-12", 4769],
  ["2024-01", 4845], ["2024-02", 5096], ["2024-03", 5254], ["2024-04", 5035], ["2024-05", 5277], ["2024-06", 5460],
  ["2024-07", 5522], ["2024-08", 5648], ["2024-09", 5762], ["2024-10", 5705], ["2024-11", 6032], ["2024-12", 5881],
  ["2025-01", 6040], ["2025-02", 5954], ["2025-03", 5611], ["2025-04", 5569], ["2025-05", 5911], ["2025-06", 6204],
  ["2025-07", 6339], ["2025-08", 6460], ["2025-09", 6688], ["2025-10", 6840], ["2025-11", 6849], ["2025-12", 6940],
];

export const SYMBOLS = [
  { symbol: "SPY", label: "S&P 500", blurb: "500 biggest US companies — the default yardstick" },
  { symbol: "QQQ", label: "Nasdaq 100", blurb: "Tech & growth heavyweights" },
  { symbol: "DIA", label: "Dow Jones", blurb: "30 blue-chip industrials" },
  { symbol: "IWM", label: "Russell 2000", blurb: "Small-cap America" },
];

// Benchmark monthly series, extended with any live SPY history we've accumulated,
// then trend-estimated up to the current month so comparisons never flatline as the
// bundled data ages. Estimated months are replaced by real data once a key is added.
export function benchmarkMonthly() {
  const series = [...SP500_MONTHLY];
  const log = getState().quoteLog?.SPY || [];
  const lastBundled = series[series.length - 1][0];
  const byMonth = new Map();
  for (const p of log) {
    const mk = monthKey(p.d);
    if (mk > lastBundled) byMonth.set(mk, p.c * 10); // SPY ≈ index/10
  }
  for (const [mk, v] of [...byMonth.entries()].sort()) series.push([mk, Math.round(v)]);

  const target = monthKey(todayISO());
  let lastKey = series[series.length - 1][0];
  if (lastKey < target) {
    // geometric mean of trailing 24 monthly returns, carried forward
    const tail = series.slice(-25);
    let g = 1;
    for (let i = 1; i < tail.length; i++) g *= tail[i][1] / tail[i - 1][1];
    const avg = Math.pow(g, 1 / (tail.length - 1));
    let v = series[series.length - 1][1];
    while (lastKey < target) {
      lastKey = nextMonthKey(lastKey, 1);
      v *= avg;
      series.push([lastKey, Math.round(v)]);
    }
  }
  return series;
}

export function benchmarkReturns(series = benchmarkMonthly()) {
  const out = [];
  for (let i = 1; i < series.length; i++) out.push([series[i][0], series[i][1] / series[i - 1][1] - 1]);
  return out;
}

// ---------- quotes ----------
const CACHE_KEY = "tandem.quotes.v1";
const TTL = { finnhub: 10 * 60e3, alphavantage: 60 * 60e3, demo: 30 * 60e3 };

function demoQuotes() {
  // Deterministic per-day wiggle so demo mode still "moves" daily. Clearly labeled in the UI.
  const seed = Number(todayISO().replace(/-/g, ""));
  const base = { SPY: 694.2, QQQ: 628.5, DIA: 482.1, IWM: 254.8 };
  return SYMBOLS.map(({ symbol }, i) => {
    const rand = rng(seed * 13 + i * 101);
    const dp = (rand() - 0.47) * 2.4;                 // −1.1% … +1.3%, slight up bias
    const price = base[symbol] * (1 + dp / 100);
    return { symbol, price: +price.toFixed(2), changePct: +dp.toFixed(2), change: +(price * dp / 100 / (1 + dp / 100)).toFixed(2), demo: true };
  });
}

async function fetchFinnhub(key) {
  const out = [];
  for (const { symbol } of SYMBOLS) {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error(`Finnhub ${r.status}`);
    const j = await r.json();
    if (!j.c) throw new Error("Finnhub returned no price — check your key");
    out.push({ symbol, price: j.c, change: j.d, changePct: j.dp, demo: false });
  }
  return out;
}

async function fetchAlphaVantage(key) {
  const out = [];
  for (const { symbol } of SYMBOLS) {
    const r = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error(`Alpha Vantage ${r.status}`);
    const j = await r.json();
    const q = j["Global Quote"];
    if (!q || !q["05. price"]) throw new Error(j["Note"] ? "Alpha Vantage rate limit hit — try later" : "Alpha Vantage returned no data — check your key");
    out.push({
      symbol,
      price: parseFloat(q["05. price"]),
      change: parseFloat(q["09. change"]),
      changePct: parseFloat(String(q["10. change percent"]).replace("%", "")),
      demo: false,
    });
  }
  return out;
}

export async function getQuotes(force = false) {
  const { marketProvider, marketApiKey } = getState().settings;
  const provider = marketApiKey && marketProvider !== "demo" ? marketProvider : "demo";
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!force && cached && cached.provider === provider && Date.now() - cached.at < TTL[provider])
      return { quotes: cached.quotes, provider, fetchedAt: cached.at, error: null };
  } catch { /* bad cache, refetch */ }

  let quotes, error = null;
  if (provider === "demo") quotes = demoQuotes();
  else {
    try {
      quotes = provider === "finnhub" ? await fetchFinnhub(marketApiKey) : await fetchAlphaVantage(marketApiKey);
      logQuotes(quotes);
    } catch (e) {
      error = e.message || String(e);
      quotes = demoQuotes();
    }
  }
  const at = Date.now();
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at, provider: error ? "demo" : provider, quotes })); } catch { /* ignore */ }
  return { quotes, provider: error ? "demo" : provider, fetchedAt: at, error };
}

export function sparkHistory(symbol, quotes) {
  // Self-built history: every live fetch is logged, so sparklines grow richer over time.
  const log = getState().quoteLog?.[symbol] || [];
  if (log.length >= 5) return log.map((p) => p.c);
  // demo fallback: plausible 30-point walk ending at today's quote
  const q = quotes.find((x) => x.symbol === symbol);
  const end = q ? q.price : 100;
  const rand = rng(symbol.split("").reduce((a, c) => a + c.charCodeAt(0) * 7, 3) + Number(todayISO().slice(0, 7).replace("-", "")));
  const pts = [end];
  for (let i = 0; i < 29; i++) pts.unshift(pts[0] / (1 + (rand() - 0.485) * 0.018));
  return pts;
}

// ---------- market insight engine (rule-based, explains the "why") ----------
export function marketInsights(quotes) {
  const out = [];
  const q = Object.fromEntries(quotes.map((x) => [x.symbol, x]));
  const spy = q.SPY, qqq = q.QQQ, dia = q.DIA, iwm = q.IWM;
  if (!spy) return out;

  const dir = spy.changePct >= 0;
  const mag = Math.abs(spy.changePct);
  out.push({
    icon: dir ? "🟢" : "🔴",
    title: `Stocks are ${mag < 0.25 ? "drifting" : mag < 0.9 ? (dir ? "grinding higher" : "easing lower") : dir ? "rallying" : "selling off"} today`,
    body: `The S&P 500 is ${spy.changePct >= 0 ? "up" : "down"} ${Math.abs(spy.changePct).toFixed(2)}%. ${mag < 0.3 ? "Moves this small are statistical noise — most days are like this." : mag < 1 ? "A normal day at the office; markets move ±1% about a third of all days." : "A move this size usually has a macro headline behind it — rates, inflation data, or earnings from the mega-caps."}`,
  });

  if (qqq && Math.abs(qqq.changePct - spy.changePct) > 0.3) {
    const lead = qqq.changePct > spy.changePct;
    out.push({
      icon: "💻",
      title: lead ? "Tech is leading the tape" : "Tech is lagging the tape",
      body: `Nasdaq 100 ${qqq.changePct >= 0 ? "+" : ""}${qqq.changePct.toFixed(2)}% vs S&P ${spy.changePct >= 0 ? "+" : ""}${spy.changePct.toFixed(2)}%. ${lead ? "Growth outperforming usually means investors are comfortable taking risk (or chasing AI)." : "Growth lagging often points to rising rate expectations — future profits get discounted harder."}`,
    });
  }

  if (iwm && Math.abs(iwm.changePct - spy.changePct) > 0.35) {
    const lead = iwm.changePct > spy.changePct;
    out.push({
      icon: "🏘️",
      title: lead ? "Small caps are outrunning the giants" : "Small caps are getting left behind",
      body: `Russell 2000 ${iwm.changePct >= 0 ? "+" : ""}${iwm.changePct.toFixed(2)}% vs S&P ${spy.changePct >= 0 ? "+" : ""}${spy.changePct.toFixed(2)}%. ${lead ? "Broad small-cap strength is a healthy breadth signal — the rally isn't just five mega-caps." : "Narrow leadership: money is hiding in the biggest names, often a cautious posture."}`,
    });
  }

  if (dia && qqq && dia.changePct > qqq.changePct + 0.3) {
    out.push({ icon: "🏭", title: "Old economy over new economy", body: `The Dow's industrials are beating the Nasdaq today — classic value rotation, often triggered by strong economic data or rising yields.` });
  }

  // longer-run context from the bundled benchmark
  const series = benchmarkMonthly();
  if (series.length > 13) {
    const last = series[series.length - 1][1];
    const yearAgo = series[series.length - 13][1];
    const yr = last / yearAgo - 1;
    const high = Math.max(...series.map((s) => s[1]));
    const offHigh = last / high - 1;
    out.push({
      icon: "🗓️",
      title: `S&P 500: ${(yr * 100).toFixed(1)}% over twelve months`,
      body: `${offHigh > -0.01 ? "Sitting at the highs." : `About ${Math.abs(offHigh * 100).toFixed(1)}% below its peak.`} The long-run average is ~10%/yr with a ~15% dip in a typical year — volatility is the admission price, not a malfunction.`,
    });

    const rets = benchmarkReturns(series).slice(-12).map((r) => r[1]);
    const vol = std(rets) * Math.sqrt(12);
    out.push({
      icon: vol > 0.18 ? "🌊" : "🧘",
      title: vol > 0.18 ? "Choppier waters than usual" : "A relatively calm market",
      body: `Realized volatility ≈ ${(vol * 100).toFixed(0)}% annualized over the last year (long-run norm ~15%). ${vol > 0.18 ? "Bumpy stretches are when dollar-cost averaging into a 401(k) quietly buys cheap shares." : "Calm periods are great — just don't let them talk you into more risk than you'd hold in a storm."}`,
    });
  }

  if (quotes[0]?.demo) {
    out.push({ icon: "🧪", title: "You're viewing demo market data", body: "Add a free Finnhub or Alpha Vantage key in Settings for live quotes. Keys are free, take ~2 minutes, and the data never leaves your device." });
  }
  return out;
}

// Simple S&P forward cone for the market tab: trend of log prices ± residual band
export function benchmarkProjection(months = 12) {
  const series = benchmarkMonthly();
  const recent = series.slice(-36);
  const logs = recent.map((s) => Math.log(s[1]));
  const { slope, intercept, residStd } = linreg(logs);
  const lastIdx = logs.length - 1;
  const lastKey = recent[recent.length - 1][0];
  const out = [];
  for (let h = 1; h <= months; h++) {
    const m = Math.exp(intercept + slope * (lastIdx + h));
    const band = Math.exp(residStd * Math.sqrt(h / 6));
    const key = nextMonthKey(lastKey, h);
    out.push({ key, mid: m, lo: m / band, hi: m * band });
  }
  return out;
}
function nextMonthKey(mk, n) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
