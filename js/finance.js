// ---------- Tandem · analytics engine ----------

import { sum, mean, std, linreg, groupBy, lastNMonthKeys, monthKey, addMonths, daysBetween, todayISO, thisMonthKey, rng, gauss, percentile, clamp } from "./util.js";
import { merchantKey, KNOWN_SUB_RE, autoCategory } from "./categorize.js";

export const ownedBy = (tx, owner) =>
  owner === "all" ? true : owner === "joint" ? tx.owner === "joint" : (tx.owner === owner || tx.owner === "joint");

// For individual dashboards joint items count half toward each partner.
export function effAmount(tx, owner) {
  if (owner === "all" || tx.owner === owner) return tx.amount;
  if (tx.owner === "joint") return tx.amount / 2;
  return 0;
}

// ---------- monthly aggregates ----------
export function monthlySeries(transactions, owner = "all", months = 12, endKey = thisMonthKey()) {
  const keys = lastNMonthKeys(months, endKey);
  const idx = new Map(keys.map((k, i) => [k, i]));
  const rows = keys.map((k) => ({ key: k, income: 0, expense: 0, net: 0, byCat: {} }));
  for (const t of transactions) {
    const i = idx.get(monthKey(t.date));
    if (i == null || !ownedBy(t, owner)) continue;
    const amt = effAmount(t, owner);
    const r = rows[i];
    if (amt > 0) r.income += amt;
    else {
      r.expense += -amt;
      r.byCat[t.category] = (r.byCat[t.category] || 0) + -amt;
    }
  }
  rows.forEach((r) => (r.net = r.income - r.expense));
  return rows;
}

export function categoryTotals(transactions, owner, monthKeys) {
  const set = new Set(monthKeys);
  const totals = {};
  for (const t of transactions) {
    if (t.amount >= 0 || !set.has(monthKey(t.date)) || !ownedBy(t, owner)) continue;
    totals[t.category] = (totals[t.category] || 0) + -effAmount(t, owner);
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

export function merchantTotals(transactions, owner, monthKeys, limit = 8) {
  const set = new Set(monthKeys);
  const totals = new Map();
  for (const t of transactions) {
    if (t.amount >= 0 || !set.has(monthKey(t.date)) || !ownedBy(t, owner)) continue;
    const k = t.merchant || "Unknown";
    totals.set(k, (totals.get(k) || 0) + -effAmount(t, owner));
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function savingsRate(row) {
  return row.income > 0 ? (row.income - row.expense) / row.income : 0;
}

// Daily spending for the calendar heatmap (last ~13 weeks)
export function dailySpend(transactions, owner, days = 91) {
  const end = todayISO();
  const start = addMonths(end, -4);
  const map = new Map();
  for (const t of transactions) {
    if (t.amount >= 0 || t.date < start || t.date > end || !ownedBy(t, owner)) continue;
    map.set(t.date, (map.get(t.date) || 0) + -effAmount(t, owner));
  }
  return { start, end, map };
}

// ---------- big-expense flags ----------
export function flaggedExpenses(transactions, threshold) {
  return transactions
    .filter((t) => t.amount <= -threshold)
    .sort((a, b) => b.date.localeCompare(a.date));
}
export const unreviewedFlags = (transactions, threshold) =>
  flaggedExpenses(transactions, threshold).filter((t) => !t.flagAck);

// ---------- subscription detection ----------
// Groups expenses by normalized merchant, looks for steady amounts on a steady cadence.
// Recurring charges in these categories are "bills" (you chose them deliberately),
// everything else recurring is a "subscription" (the kind that quietly multiplies).
const BILL_CATS = new Set(["housing", "utilities", "insurance", "debt", "health", "transport"]);

export function detectSubscriptions(transactions, mutedKeys = []) {
  const muted = new Set(mutedKeys);
  const expenses = transactions.filter((t) => t.amount < 0);
  const byMerchant = groupBy(expenses, (t) => merchantKey(t.merchant));
  const subs = [];
  const today = todayISO();

  for (const [key, txs] of byMerchant) {
    if (!key || muted.has(key)) continue;
    txs.sort((a, b) => a.date.localeCompare(b.date));
    const known = KNOWN_SUB_RE.test(key);
    if (txs.length < (known ? 1 : 3)) continue;

    // cadence from median gap
    let cadence = "monthly", medGap = 30;
    if (txs.length >= 2) {
      const gaps = [];
      for (let i = 1; i < txs.length; i++) gaps.push(daysBetween(txs[i - 1].date, txs[i].date));
      gaps.sort((a, b) => a - b);
      medGap = gaps[Math.floor(gaps.length / 2)];
      if (medGap < 5) continue;                       // groceries, not a subscription
      if (medGap <= 9) cadence = "weekly";
      else if (medGap <= 45) cadence = "monthly";
      else if (medGap <= 120) cadence = "quarterly";
      else cadence = "yearly";
      if (!known) {
        const spread = std(gaps);
        if (spread > medGap * 0.45) continue;          // too irregular
      }
    } else cadence = "monthly";

    // a real quarterly subscription shows up 4+ times — 3 dentist visits don't count
    if (!known && cadence === "quarterly" && txs.length < 4) continue;
    // unknown "yearly subscriptions" are usually just annual vacations or repairs;
    // only trust the pattern in categories where annual billing is actually a thing
    if (!known && cadence === "yearly" && !["subs", "insurance", "utilities", "health"].includes(txs[0].category)) continue;

    // amount steadiness
    const amts = txs.map((t) => -t.amount);
    const m = mean(amts);
    if (!known && std(amts) > Math.max(2, m * 0.12)) continue;
    if (m < 1) continue;

    const last = txs[txs.length - 1];
    const cadenceDays = { weekly: 7, monthly: 30, quarterly: 91, yearly: 365 }[cadence];
    const nextDate = addMonths(last.date, 0) && (() => {
      const d = new Date(last.date); d.setDate(d.getDate() + cadenceDays);
      return d.toISOString().slice(0, 10);
    })();
    const active = daysBetween(last.date, today) <= cadenceDays * 1.8;

    // price hike: most recent step-up, if it happened within the last ~6 charges
    const lastAmt = amts[amts.length - 1];
    let hike = null;
    for (let i = amts.length - 1; i >= Math.max(1, amts.length - 6); i--) {
      if (amts[i] > amts[i - 1] * 1.02) { hike = { from: amts[i - 1], to: amts[i] }; break; }
    }

    const monthly = { weekly: lastAmt * 4.33, monthly: lastAmt, quarterly: lastAmt / 3, yearly: lastAmt / 12 }[cadence];

    subs.push({
      key, name: last.merchant, owner: last.owner, category: last.category,
      kind: known || !BILL_CATS.has(last.category) ? "sub" : "bill",
      amount: lastAmt, cadence, monthlyCost: monthly,
      lastDate: last.date, nextDate, active, hike,
      count: txs.length, firstDate: txs[0].date,
      history: txs.map((t) => ({ date: t.date, amount: -t.amount })),
      source: "auto",
    });
  }
  return subs.sort((a, b) => b.monthlyCost - a.monthlyCost);
}

export function allSubscriptions(state) {
  const auto = detectSubscriptions(state.transactions, state.subsMuted);
  const manual = state.subsManual.map((s) => ({
    ...s, key: "manual:" + s.id, active: true, source: "manual",
    kind: BILL_CATS.has(s.category) ? "bill" : "sub",
    monthlyCost: s.cadence === "yearly" ? s.amount / 12 : s.cadence === "weekly" ? s.amount * 4.33 : s.amount,
    history: [], count: 0, hike: null, lastDate: null,
  }));
  return [...auto, ...manual];
}

// total monthly sub cost per month (subscription creep trend) — true subs only, not bills
export function subCreepSeries(transactions, mutedKeys, months = 12) {
  const subs = detectSubscriptions(transactions, mutedKeys).filter((s) => s.kind === "sub");
  const keys = lastNMonthKeys(months);
  return keys.map((k) => {
    let total = 0;
    for (const s of subs)
      for (const h of s.history)
        if (monthKey(h.date) === k) total += s.cadence === "yearly" ? h.amount / 12 : h.amount;
    return { key: k, total };
  });
}

// ---------- net worth ----------
export function latestBalances(state) {
  const latest = new Map();
  for (const s of [...state.snapshots].sort((a, b) => a.date.localeCompare(b.date)))
    latest.set(s.accountId, s);
  return state.accounts.map((a) => ({ account: a, snap: latest.get(a.id) || null }));
}

// joint accounts count half toward each partner's individual view
const accWeight = (a, owner) =>
  owner === "all" ? 1 : a.owner === owner ? 1 : a.owner === "joint" ? 0.5 : 0;

export function netWorthSeries(state, months = 18, owner = "all") {
  const keys = lastNMonthKeys(months);
  const byAcc = groupBy(state.snapshots, (s) => s.accountId);
  for (const arr of byAcc.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  return keys.map((k) => {
    let total = 0, has = false;
    for (const a of state.accounts) {
      const w = accWeight(a, owner);
      if (!w) continue;
      const snaps = byAcc.get(a.id) || [];
      let best = null;
      for (const s of snaps) { if (monthKey(s.date) <= k) best = s; else break; }
      if (best) { total += best.balance * w; has = true; }
    }
    return { key: k, value: has ? total : null };
  });
}

export function currentNetWorth(state, owner = "all") {
  return sum(latestBalances(state).map((x) => (x.snap ? x.snap.balance * accWeight(x.account, owner) : 0)));
}

// ---------- personal rate of return (Modified Dietz per period, chained) ----------
export function dietzSeries(snapshots) {
  const snaps = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  if (snaps.length < 2) return [];
  const out = [{ date: snaps[0].date, ret: 0, index: 100 }];
  let index = 100;
  for (let i = 1; i < snaps.length; i++) {
    const bmv = snaps[i - 1].balance, emv = snaps[i].balance, c = snaps[i].contrib || 0;
    const denom = bmv + 0.5 * c;
    const r = denom > 0 ? (emv - bmv - c) / denom : 0;
    index *= 1 + r;
    out.push({ date: snaps[i].date, ret: r, index });
  }
  return out;
}

// ---------- forecasting ----------
// 12-month cash-flow projection: trend + seasonality-free band from residual spread
export function forecastCashflow(monthly, horizon = 12) {
  const nets = monthly.map((m) => m.net);
  const recent = nets.slice(-12);
  const { slope, intercept, residStd } = linreg(recent);
  const lastIdx = recent.length - 1;
  const lastKey = monthly[monthly.length - 1].key;
  const out = [];
  for (let h = 1; h <= horizon; h++) {
    const v = intercept + slope * (lastIdx + h);
    const band = residStd * Math.sqrt(1 + h / 12) * 1.28; // ~80% band, widening
    out.push({ key: addMonths(lastKey + "-01", h).slice(0, 7), mid: v, lo: v - band, hi: v + band });
  }
  return out;
}

// Monte Carlo wealth fan: monthly contributions + lognormal-ish market returns
export function monteCarloWealth({ start, monthlyContrib, months, annualReturn, annualVol, sims = 400, seed = 42, contribGrowth = 0.02 }) {
  const mu = annualReturn / 12, sigma = annualVol / Math.sqrt(12);
  const paths = [];
  for (let s = 0; s < sims; s++) {
    const rand = rng(seed + s * 7919);
    let w = start, c = monthlyContrib;
    const path = new Float64Array(months + 1);
    path[0] = w;
    for (let m = 1; m <= months; m++) {
      const r = mu + gauss(rand) * sigma;
      w = Math.max(0, w * (1 + r) + c);
      if (m % 12 === 0) c *= 1 + contribGrowth;
      path[m] = w;
    }
    paths.push(path);
  }
  const bands = { p10: [], p25: [], p50: [], p75: [], p90: [] };
  for (let m = 0; m <= months; m++) {
    const col = paths.map((p) => p[m]).sort((a, b) => a - b);
    bands.p10.push(percentile(col, 0.10));
    bands.p25.push(percentile(col, 0.25));
    bands.p50.push(percentile(col, 0.50));
    bands.p75.push(percentile(col, 0.75));
    bands.p90.push(percentile(col, 0.90));
  }
  return bands;
}

// ---------- insight engine (plain-English findings about YOUR money) ----------
export function financeInsights(state, names) {
  const out = [];
  const tx = state.transactions;
  const monthly = monthlySeries(tx, "all", 13);
  const cur = monthly[monthly.length - 1], prev = monthly[monthly.length - 2];
  const nameOf = (o) => (o === "p1" ? names.p1 : o === "p2" ? names.p2 : "Joint");

  if (prev && prev.expense > 0 && cur.expense > 0) {
    // biggest category swing month-over-month
    const cats = new Set([...Object.keys(cur.byCat), ...Object.keys(prev.byCat)]);
    let bestCat = null, bestDelta = 0;
    for (const c of cats) {
      const d = (cur.byCat[c] || 0) - (prev.byCat[c] || 0);
      if (Math.abs(d) > Math.abs(bestDelta)) { bestDelta = d; bestCat = c; }
    }
    if (bestCat && Math.abs(bestDelta) > Math.max(75, prev.expense * 0.04)) {
      out.push({
        tone: bestDelta > 0 ? "warn" : "good",
        icon: bestDelta > 0 ? "📈" : "📉",
        title: `${bestCat === "subs" ? "Subscriptions" : bestCat[0].toUpperCase() + bestCat.slice(1)} ${bestDelta > 0 ? "up" : "down"} this month`,
        body: `${bestDelta > 0 ? "Up" : "Down"} ${fmt0(bestDelta)} vs last month — the biggest swing in your spending mix.`,
        amount: bestDelta,
      });
    }
  }

  // savings-rate trend over 6 months
  const rates = monthly.slice(-7, -1).map(savingsRate);
  if (rates.length >= 4) {
    const { slope } = linreg(rates);
    const avg = mean(rates);
    if (slope > 0.012) out.push({ tone: "good", icon: "🌱", title: "Savings rate is climbing", body: `You've averaged ${(avg * 100).toFixed(0)}% over six months and the trend is up. Compounding loves you.` });
    else if (slope < -0.012) out.push({ tone: "warn", icon: "🪫", title: "Savings rate is slipping", body: `Down trend over six months (avg ${(avg * 100).toFixed(0)}%). Worth a look at the categories below.` });
  }

  // unusual category this month (z-score vs trailing 6)
  const trail = monthly.slice(-7, -1);
  for (const [cat, amt] of Object.entries(cur.byCat)) {
    const hist = trail.map((m) => m.byCat[cat] || 0);
    const m = mean(hist), sd = std(hist);
    if (sd > 0 && amt > m + 2.2 * sd && amt - m > 120) {
      out.push({ tone: "warn", icon: "🔎", title: `Unusual ${cat} spending`, body: `${fmt0(amt)} this month vs a ${fmt0(m)} average — ${((amt / Math.max(1, m) - 1) * 100).toFixed(0)}% above normal.` });
      break;
    }
  }

  // subscription creep
  const creep = subCreepSeries(tx, state.subsMuted, 12).filter((c) => c.total > 0);
  if (creep.length >= 6) {
    const first = mean(creep.slice(0, 3).map((c) => c.total));
    const last = mean(creep.slice(-3).map((c) => c.total));
    if (last > first * 1.12 && last - first > 8)
      out.push({ tone: "warn", icon: "🐌", title: "Subscription creep detected", body: `Recurring charges have grown from ~${fmt0(first)} to ~${fmt0(last)}/mo over the year. That's ${fmt0((last - first) * 12)}/yr of quiet drift.` });
  }

  // price hikes
  const subs = detectSubscriptions(tx, state.subsMuted);
  const hiked = subs.filter((s) => s.hike && s.active);
  if (hiked.length) {
    const h = hiked[0];
    out.push({ tone: "warn", icon: "📣", title: `${h.name} raised its price`, body: `${fmt0(h.hike.from)} → ${fmt0(h.hike.to)} per ${h.cadence.replace("ly", "")}. ${hiked.length > 1 ? `(+${hiked.length - 1} more hike${hiked.length > 2 ? "s" : ""} in Subs.)` : "Still worth it?"}` });
  }

  // possibly-zombie subscription
  const stale = subs.filter((s) => !s.active && s.count >= 3 && s.monthlyCost >= 5);
  if (stale.length === 0) {
    const dupes = subs.filter((s) => s.active && /netflix|hulu|disney|hbo|max|paramount|peacock|crunchyroll/i.test(s.key));
    if (dupes.length >= 3)
      out.push({ tone: "info", icon: "📺", title: `${dupes.length} streaming services running`, body: `${dupes.map((d) => d.name.split(" ")[0]).join(", ")} — ${fmt0(sum(dupes.map((d) => d.monthlyCost)))}/mo combined. Rotation beats accumulation.` });
  }

  // who-spent-what balance
  const p1Spend = sum(tx.filter((t) => t.amount < 0 && monthKey(t.date) === cur.key && t.owner === "p1").map((t) => -t.amount));
  const p2Spend = sum(tx.filter((t) => t.amount < 0 && monthKey(t.date) === cur.key && t.owner === "p2").map((t) => -t.amount));
  if (p1Spend + p2Spend > 500 && Math.max(p1Spend, p2Spend) > (p1Spend + p2Spend) * 0.7) {
    const big = p1Spend > p2Spend ? "p1" : "p2";
    out.push({ tone: "info", icon: "⚖️", title: "Spending is lopsided this month", body: `${nameOf(big)} has covered ${Math.round((Math.max(p1Spend, p2Spend) / (p1Spend + p2Spend)) * 100)}% of individual spending. Maybe the next date night is on ${nameOf(big === "p1" ? "p2" : "p1")}.` });
  }

  // runway
  const avgBurn = mean(monthly.slice(-6).map((m) => m.expense));
  const liquid = latestBalances(state).filter((x) => x.snap && ["checking", "savings"].includes(x.account.type)).reduce((a, x) => a + x.snap.balance, 0);
  if (avgBurn > 0 && liquid > 0) {
    const runway = liquid / avgBurn;
    out.push({
      tone: runway >= 4 ? "good" : runway >= 2.5 ? "info" : "warn",
      icon: runway >= 4 ? "🛟" : "⏳",
      title: `${runway.toFixed(1)} months of runway`,
      body: `Liquid cash (${fmt0(liquid)}) ÷ average burn (${fmt0(avgBurn)}/mo). ${runway >= 6 ? "Fortress status." : runway >= 3 ? "Healthy buffer — the classic target is 3–6 months." : "Below the classic 3-month floor; the emergency fund goal earns its keep."}`,
    });
  }

  // unreviewed flags
  const flags = unreviewedFlags(tx, state.settings.bigExpenseThreshold);
  if (flags.length)
    out.push({ tone: "warn", icon: "🚩", title: `${flags.length} large expense${flags.length > 1 ? "s" : ""} to review`, body: `Charges over ${fmt0(state.settings.bigExpenseThreshold)} are waiting in Activity → Flagged.` });

  return out;
}

const fmt0 = (n) => "$" + Math.round(Math.abs(n)).toLocaleString();

// guess merchant→category for imports
export { autoCategory };
export const clampMonths = clamp;
