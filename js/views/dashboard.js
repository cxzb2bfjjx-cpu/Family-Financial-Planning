// ---------- Tandem · dashboards (Ours / partner 1 / partner 2) ----------

import { getState, addGoal, updateGoal, deleteGoal, addSnapshot, addAccount, deleteAccount } from "../store.js";
import { fmt, fmtPct, escapeHtml, lastNMonthKeys, thisMonthKey, todayISO, sum, mean, monthLabel } from "../util.js";
import {
  monthlySeries, categoryTotals, merchantTotals, savingsRate, dailySpend,
  netWorthSeries, currentNetWorth, latestBalances, financeInsights, allSubscriptions,
  ownedBy, effAmount,
} from "../finance.js";
import * as charts from "../charts.js";
import { openModal, closeModal, formData, field, ownerSelect, toast, ownerName } from "../ui.js";
import { catIcon, catLabel } from "../categorize.js";

export function renderDashboard(root, owner, navigate) {
  const state = getState();
  const s = state.settings;
  const names = { p1: s.p1Name, p2: s.p2Name };
  const monthly = monthlySeries(state.transactions, owner, 12);
  const cur = monthly[monthly.length - 1];
  // compare month-to-date against the SAME point of last month — otherwise every
  // dashboard looks like a crisis on the 5th (rent posts early, paydays don't)
  const dom = todayISO().slice(8, 10);
  const prevKey = monthly[monthly.length - 2]?.key;
  const prevMTD = { income: 0, expense: 0 };
  if (prevKey) {
    for (const t of state.transactions) {
      if (!t.date.startsWith(prevKey) || t.date.slice(8, 10) > dom || !ownedBy(t, owner)) continue;
      const a = effAmount(t, owner);
      if (a > 0) prevMTD.income += a; else prevMTD.expense += -a;
    }
  }
  // savings gauge: average of the last 3 complete months (current month is partial)
  const fullMonths = monthly.slice(-4, -1).filter((m) => m.income > 0);
  const gaugeRate = fullMonths.length
    ? fullMonths.reduce((a, m) => a + savingsRate(m), 0) / fullMonths.length
    : savingsRate(cur);
  const nw = currentNetWorth(state, owner);
  const nwSeries = netWorthSeries(state, 18, owner);
  const nwVals = nwSeries.filter((x) => x.value != null);
  const nwPrev = nwVals.length > 1 ? nwVals[nwVals.length - 2].value : null;
  const last3 = lastNMonthKeys(3);
  const cats = categoryTotals(state.transactions, owner, [thisMonthKey()]);
  const cats3 = categoryTotals(state.transactions, owner, last3);
  const merchants = merchantTotals(state.transactions, owner, last3);
  const insights = owner === "all" ? financeInsights(state, names) : personInsights(state, owner, names);
  const balances = latestBalances(state).filter((x) => owner === "all" || x.account.owner === owner || x.account.owner === "joint");
  const subs = allSubscriptions(state).filter((x) => x.active && x.kind === "sub" && (owner === "all" || x.owner === owner || x.owner === "joint"));
  const subMonthly = sum(subs.map((x) => x.monthlyCost * (owner !== "all" && x.owner === "joint" ? 0.5 : 1)));

  const title = owner === "all" ? escapeHtml(s.householdName) : `${escapeHtml(ownerName(owner))}'s money`;
  const accent = owner === "p1" ? "var(--p1)" : owner === "p2" ? "var(--p2)" : "var(--joint)";

  const delta = (now, before, flip = false, label = "vs last month") => {
    if (before == null || before === 0) return "";
    const d = (now - before) / Math.abs(before);
    const good = flip ? d < 0 : d >= 0;
    return `<div class="delta ${good ? "up" : "down"}">${d >= 0 ? "▲" : "▼"} ${Math.abs(d * 100).toFixed(1)}% ${label}</div>`;
  };

  root.innerHTML = `
    <div class="seg">
      <button class="t-all ${owner === "all" ? "active" : ""}" data-o="all">🏠 Ours</button>
      <button class="t-p1 ${owner === "p1" ? "active" : ""}" data-o="p1">${escapeHtml(names.p1)}</button>
      <button class="t-p2 ${owner === "p2" ? "active" : ""}" data-o="p2">${escapeHtml(names.p2)}</button>
    </div>

    <div class="kpis">
      <div class="kpi" style="border-top:2px solid ${accent}">
        <div class="lbl">${owner === "all" ? "Net worth" : "Net worth (your share)"}</div>
        <div class="val">${nwVals.length ? fmt(nw) : "—"}</div>
        ${nwVals.length ? delta(nw, nwPrev) : `<div class="delta">add accounts below</div>`}
        <div class="spark" id="spark-nw"></div>
      </div>
      <div class="kpi">
        <div class="lbl">Income · ${monthLabel(cur.key)}</div>
        <div class="val" style="color:var(--green)">${fmt(cur.income)}</div>
        ${delta(cur.income, prevMTD.income, false, "vs this point last mo")}
        <div class="spark" id="spark-inc"></div>
      </div>
      <div class="kpi">
        <div class="lbl">Spending · ${monthLabel(cur.key)}</div>
        <div class="val" style="color:var(--red)">${fmt(cur.expense)}</div>
        ${delta(cur.expense, prevMTD.expense, true, "vs this point last mo")}
        <div class="spark" id="spark-exp"></div>
      </div>
      <div class="kpi">
        <div class="lbl">Subscriptions / mo</div>
        <div class="val" style="color:var(--p1)">${fmt(subMonthly)}</div>
        <div class="delta">${subs.length} active — bills tracked separately</div>
        <div class="spark" id="spark-gauge"></div>
      </div>
    </div>

    ${insights.length ? `<div>${insights.slice(0, 4).map(insightHtml).join("")}</div>` : ""}

    <div class="grid">
      <div class="card s8">
        <h3>Net worth trajectory <span class="sub">18 months + 6-mo projection</span></h3>
        ${nwVals.length > 1 ? `<div class="chart" id="ch-nw"></div>` : emptyNote("Track account balances to unlock this chart", "Add an account below and post a balance once a month — that's it.")}
      </div>
      <div class="card s4">
        <h3>Savings rate <span class="sub">3-month average</span></h3>
        <div class="chart" id="ch-gauge"></div>
        <p class="muted" style="text-align:center;margin-top:-26px">${rateComment(gaugeRate)}</p>
      </div>

      <div class="card s6">
        <h3>Cash flow <span class="sub">last 12 months</span></h3>
        <div class="chart" id="ch-flow"></div>
      </div>
      <div class="card s6">
        <h3>Where it went <span class="sub">${monthLabel(cur.key)} — tap a slice</span></h3>
        ${cats.length ? `<div class="chart" id="ch-donut"></div>` : emptyNote("No spending recorded this month yet")}
      </div>

      ${owner === "all" ? `
      <div class="card s12" style="grid-column: span 12">
        <h3>Money river <span class="sub">average month, last 3</span></h3>
        ${cats3.length ? `<div class="chart tall" id="ch-sankey"></div>` : emptyNote("Add income and spending to see the flow")}
      </div>
      <div class="card s6">
        <h3>${escapeHtml(names.p1)} vs ${escapeHtml(names.p2)} <span class="sub">spending mix, last 3 months</span></h3>
        <div class="chart" id="ch-radar"></div>
      </div>` : ""}

      <div class="card ${owner === "all" ? "s6" : "s6"}">
        <h3>Spending heat <span class="sub">daily, ~3 months</span></h3>
        <div class="chart short" id="ch-heat"></div>
        <p class="muted">Brighter cells = heavier days. Weekend habits show up fast.</p>
      </div>

      ${owner !== "all" ? `
      <div class="card s6">
        <h3>Top merchants <span class="sub">last 3 months</span></h3>
        ${merchants.length ? `<div class="chart" id="ch-merch"></div>` : emptyNote("Nothing yet")}
      </div>` : `
      <div class="card s6">
        <h3>Top merchants <span class="sub">last 3 months</span></h3>
        ${merchants.length ? `<div class="chart" id="ch-merch"></div>` : emptyNote("Nothing yet")}
      </div>`}

      ${owner === "all" ? `
      <div class="card s6">
        <h3>Goals <button class="btn small ghost" id="btn-goal">+ goal</button></h3>
        ${state.goals.length ? `<div class="goals">${state.goals.map(goalHtml).join("")}</div>` : emptyNote("Set a shared goal — emergency fund, trip, down payment…")}
      </div>` : ""}

      <div class="card s6">
        <h3>Accounts <span><button class="btn small ghost" id="btn-acc">+ account</button> <button class="btn small" id="btn-bal">Update balances</button></span></h3>
        ${balances.length ? `<div class="list">${balances.map(accHtml).join("")}</div>` : emptyNote("Add checking, savings, 401(k), loans — balances power net worth, runway and the market comparison.")}
      </div>
    </div>`;

  // segment switching
  root.querySelectorAll(".seg button").forEach((b) =>
    b.addEventListener("click", () => navigate(`dash/${b.dataset.o}`)));

  // ----- charts -----
  const el = (id) => root.querySelector("#" + id);
  const ownColor = owner === "p1" ? charts.PALETTE.p1 : owner === "p2" ? charts.PALETTE.p2 : charts.PALETTE.joint;

  if (nwVals.length) charts.spark(el("spark-nw"), nwVals.map((x) => x.value), ownColor);
  charts.spark(el("spark-inc"), monthly.map((m) => m.income), charts.PALETTE.income);
  charts.spark(el("spark-exp"), monthly.map((m) => m.expense), charts.PALETTE.expense);
  const creepVals = monthly.map((m) => m.byCat.subs || 0);
  charts.spark(el("spark-gauge"), creepVals.some((v) => v > 0) ? creepVals : [1, 1, 1], charts.PALETTE.p1);

  if (nwVals.length > 1) {
    const startIdx = nwSeries.findIndex((x) => x.value != null);
    const keys = nwSeries.slice(startIdx).map((x) => x.key);
    const vals = nwSeries.slice(startIdx).map((x) => x.value);
    // simple projection: average monthly change carried 6 months
    const diffs = [];
    for (let i = 1; i < vals.length; i++) diffs.push(vals[i] - vals[i - 1]);
    const drift = mean(diffs.slice(-6));
    const projKeys = lastNMonthKeys(6, addM(thisMonthKey(), 6));
    const projVals = projKeys.map((_, i) => vals[vals.length - 1] + drift * (i + 1));
    charts.netWorth(el("ch-nw"), keys, vals, projKeys, projVals);
  }
  charts.gauge(el("ch-gauge"), gaugeRate);
  charts.cashflow(el("ch-flow"), monthly);
  if (cats.length) charts.donut(el("ch-donut"), cats.slice(0, 9), (p) => {
    if (p?.data?.catId) navigate(`activity?cat=${p.data.catId}&owner=${owner}`);
  });

  if (owner === "all" && cats3.length) {
    const incomeBySource = incomeSources(state, last3);
    const catAvg = cats3.map(([c, v]) => [c, v / 3]).filter(([, v]) => v >= 1);
    const inc3 = sum(incomeBySource.map(([, v]) => v));
    const spend3 = sum(catAvg.map(([, v]) => v));
    charts.sankey(el("ch-sankey"), incomeBySource, catAvg, inc3 - spend3);

    const topCats = cats3.slice(0, 6).map(([c]) => c);
    const p1Vals = topCats.map((c) => catTotalFor(state, "p1", last3, c) / 3);
    const p2Vals = topCats.map((c) => catTotalFor(state, "p2", last3, c) / 3);
    charts.radar(el("ch-radar"), topCats, p1Vals, p2Vals, names.p1, names.p2);
  }

  const ds = dailySpend(state.transactions, owner);
  charts.heatmap(el("ch-heat"), ds.start, ds.end, ds.map);
  if (merchants.length) charts.topBars(el("ch-merch"), merchants, ownColor);

  // ----- actions -----
  el("btn-bal")?.addEventListener("click", () => balancesModal(navigate));
  el("btn-acc")?.addEventListener("click", () => accountModal(owner, navigate));
  el("btn-goal")?.addEventListener("click", () => goalModal(null, navigate));
  root.querySelectorAll("[data-goal]").forEach((g) =>
    g.addEventListener("click", () => goalModal(g.dataset.goal, navigate)));
  root.querySelectorAll("[data-acct]").forEach((a) =>
    a.addEventListener("click", () => accountDetailModal(a.dataset.acct, navigate)));
}

// ---------- helpers ----------
function addM(mk, n) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const emptyNote = (t, b = "") => `<div class="empty"><div class="big">✨</div>${t}${b ? `<br/><span class="muted">${b}</span>` : ""}</div>`;

export const insightHtml = (i) => `
  <div class="insight ${i.tone || "info"}">
    <div class="em">${i.icon}</div>
    <div><div class="t">${escapeHtml(i.title)}</div><div class="b">${escapeHtml(i.body)}</div></div>
  </div>`;

function rateComment(r) {
  if (r >= 0.25) return "Elite. A quarter of income compounds fast.";
  if (r >= 0.15) return "Solid — right around the classic 15–20% target.";
  if (r >= 0.05) return "Positive, but there's room. The Future tab shows what +5% does.";
  if (r >= 0) return "Breaking even. One trimmed category flips this green.";
  return "Spending exceeded income this month — check the flags in Activity.";
}

function goalHtml(g) {
  const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
  return `<div class="goal" data-goal="${g.id}">
    <div class="nm">${g.emoji || "🎯"} ${escapeHtml(g.name)}</div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="meta">${fmt(g.saved)} / ${fmt(g.target)} · ${pct}%</div>
  </div>`;
}

function accHtml({ account, snap }) {
  const TYPE_IC = { checking: "🏦", savings: "🛟", investment: "📈", "401k": "🪺", debt: "💳" };
  return `<div class="litem" data-acct="${account.id}">
    <div class="ic">${TYPE_IC[account.type] || "🏦"}</div>
    <div class="mid">
      <div class="t1">${escapeHtml(account.name)}</div>
      <div class="t2">${ownerName(account.owner)} · ${account.type}${snap ? ` · as of ${snap.date}` : ""}</div>
    </div>
    <div class="amt ${snap && snap.balance >= 0 ? "" : ""}" style="color:${snap && snap.balance < 0 ? "var(--red)" : "var(--text)"}">${snap ? fmt(snap.balance) : "—"}</div>
  </div>`;
}

function incomeSources(state, monthKeys) {
  const set = new Set(monthKeys);
  const m = new Map();
  for (const t of state.transactions) {
    if (t.amount <= 0 || !set.has(t.date.slice(0, 7))) continue;
    const k = (t.merchant || "Income").split("—")[0].trim().slice(0, 22);
    m.set(k, (m.get(k) || 0) + t.amount / monthKeys.length);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function catTotalFor(state, owner, monthKeys, cat) {
  const set = new Set(monthKeys);
  let total = 0;
  for (const t of state.transactions) {
    if (t.amount >= 0 || t.category !== cat || !set.has(t.date.slice(0, 7))) continue;
    if (t.owner === owner) total += -t.amount;
    else if (t.owner === "joint") total += -t.amount / 2;
  }
  return total;
}

function personInsights(state, owner, names) {
  const all = financeInsights(state, names);
  const monthly = monthlySeries(state.transactions, owner, 7);
  const out = [];
  const cur = monthly[monthly.length - 1];
  const rate = savingsRate(cur);
  if (cur.income > 0)
    out.push({
      tone: rate >= 0.15 ? "good" : rate >= 0 ? "info" : "warn", icon: rate >= 0.15 ? "🌱" : rate >= 0 ? "⚖️" : "🔥",
      title: `${ownerName(owner)} is saving ${Math.round(rate * 100)}% this month`,
      body: rate >= 0 ? `${fmt(cur.net)} kept out of ${fmt(cur.income)} earned (joint costs split 50/50).` : `Spending ran ${fmt(-cur.net)} over income this month.`,
    });
  return [...out, ...all.slice(0, 2)];
}

// ---------- modals ----------
function balancesModal(navigate) {
  const state = getState();
  const rows = latestBalances(state);
  if (!rows.length) { toast("Add an account first"); return; }
  openModal(`
    <h2>Update balances</h2>
    <p class="muted" style="margin-bottom:12px">A 2-minute monthly ritual. For 401(k)/investment accounts, also enter what you contributed since last time — it's how Tandem separates <b>your money</b> from <b>market growth</b>.</p>
    ${rows.map(({ account, snap }) => `
      <div class="row2" style="margin-bottom:4px">
        ${field("bal_" + account.id, escapeHtml(account.name) + (snap ? ` (was ${fmt(snap.balance)})` : ""), `inputmode="decimal" placeholder="${snap ? snap.balance : "0"}"`)}
        ${["401k", "investment"].includes(account.type) ? field("con_" + account.id, "contributed since", `inputmode="decimal" placeholder="0"`) : "<div></div>"}
      </div>`).join("")}
    <div class="actions"><button class="btn ghost" data-x>Cancel</button><button class="btn" data-save>Save snapshot</button></div>
  `, (m) => {
    m.querySelector("[data-x]").onclick = closeModal;
    m.querySelector("[data-save]").onclick = () => {
      const data = formData(m);
      let n = 0;
      for (const { account } of rows) {
        const v = parseFloat(data["bal_" + account.id]);
        if (isNaN(v)) continue;
        addSnapshot({ accountId: account.id, date: todayISO(), balance: v, contrib: parseFloat(data["con_" + account.id]) || 0 });
        n++;
      }
      closeModal();
      toast(n ? `Saved ${n} balance${n > 1 ? "s" : ""} ✓` : "Nothing entered");
      if (n) navigate(null);
    };
  });
}

function accountModal(owner, navigate) {
  openModal(`
    <h2>New account</h2>
    ${field("name", "Name", `placeholder="e.g. Fidelity 401(k)"`)}
    ${ownerSelect("owner", owner === "all" ? "joint" : owner)}
    <label class="fld"><span>Type</span><select name="type">
      <option value="checking">Checking</option><option value="savings">Savings</option>
      <option value="investment">Investment / brokerage</option><option value="401k">401(k) / retirement</option>
      <option value="debt">Debt (loan, card)</option>
    </select></label>
    ${field("balance", "Current balance (negative for debt)", `inputmode="decimal" placeholder="0"`)}
    <div class="actions"><button class="btn ghost" data-x>Cancel</button><button class="btn" data-save>Add</button></div>
  `, (m) => {
    m.querySelector("[data-x]").onclick = closeModal;
    m.querySelector("[data-save]").onclick = () => {
      const d = formData(m);
      if (!d.name) { toast("Give it a name"); return; }
      const acc = addAccount({ name: d.name, owner: d.owner, type: d.type });
      const bal = parseFloat(d.balance);
      if (!isNaN(bal)) addSnapshot({ accountId: acc.id, date: todayISO(), balance: bal, contrib: 0 });
      closeModal(); toast("Account added ✓"); navigate(null);
    };
  });
}

function accountDetailModal(accId, navigate) {
  const state = getState();
  const acc = state.accounts.find((a) => a.id === accId);
  if (!acc) return;
  const snaps = state.snapshots.filter((s) => s.accountId === accId).sort((a, b) => b.date.localeCompare(a.date));
  openModal(`
    <h2>${escapeHtml(acc.name)}</h2>
    <p class="muted" style="margin-bottom:10px">${ownerName(acc.owner)} · ${acc.type} · ${snaps.length} snapshot${snaps.length === 1 ? "" : "s"}</p>
    <div class="list" style="max-height:300px;overflow-y:auto">
      ${snaps.map((s) => `<div class="litem"><div class="mid"><div class="t1">${fmt(s.balance)}</div><div class="t2">${s.date}${s.contrib ? ` · contributed ${fmt(s.contrib)}` : ""}</div></div></div>`).join("") || `<p class="muted">No balances yet.</p>`}
    </div>
    <div class="actions"><button class="btn danger" data-del>Delete account</button><button class="btn ghost" data-x>Close</button></div>
  `, (m) => {
    m.querySelector("[data-x]").onclick = closeModal;
    m.querySelector("[data-del]").onclick = () => {
      if (confirm(`Delete "${acc.name}" and its history?`)) { deleteAccount(accId); closeModal(); navigate(null); }
    };
  });
}

function goalModal(goalId, navigate) {
  const g = goalId ? getState().goals.find((x) => x.id === goalId) : null;
  openModal(`
    <h2>${g ? "Edit goal" : "New shared goal"}</h2>
    <div class="row2">
      ${field("emoji", "Emoji", `maxlength="4" placeholder="🎯"`, "text", g?.emoji || "")}
      ${field("name", "Name", `placeholder="Japan trip"`, "text", g?.name || "")}
    </div>
    <div class="row2">
      ${field("target", "Target", `inputmode="decimal"`, "text", g?.target ?? "")}
      ${field("saved", "Saved so far", `inputmode="decimal"`, "text", g?.saved ?? "")}
    </div>
    ${field("targetDate", "Target date", "", "date", g?.targetDate || "")}
    <div class="actions">
      ${g ? `<button class="btn danger" data-del>Delete</button>` : `<button class="btn ghost" data-x>Cancel</button>`}
      <button class="btn" data-save>Save</button>
    </div>
  `, (m) => {
    m.querySelector("[data-x]")?.addEventListener("click", closeModal);
    m.querySelector("[data-del]")?.addEventListener("click", () => { deleteGoal(goalId); closeModal(); navigate(null); });
    m.querySelector("[data-save]").onclick = () => {
      const d = formData(m);
      const target = parseFloat(d.target), saved = parseFloat(d.saved) || 0;
      if (!d.name || isNaN(target) || target <= 0) { toast("Name + target needed"); return; }
      const payload = { name: d.name, emoji: d.emoji || "🎯", target, saved, targetDate: d.targetDate || null };
      if (g) updateGoal(goalId, payload); else addGoal(payload);
      closeModal(); navigate(null);
    };
  });
}
