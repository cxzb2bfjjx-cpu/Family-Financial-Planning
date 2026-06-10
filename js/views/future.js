// ---------- Tandem · the Future tab: forecasts & what-ifs ----------

import { getState, setSettings } from "../store.js";
import { fmt, escapeHtml, mean, lastNMonthKeys, thisMonthKey, debounce } from "../util.js";
import { monthlySeries, forecastCashflow, monteCarloWealth, currentNetWorth, latestBalances, netWorthSeries, savingsRate } from "../finance.js";
import * as charts from "../charts.js";

export function renderFuture(root, navigate) {
  const state = getState();
  const s = state.settings;
  const monthly = monthlySeries(state.transactions, "all", 12);
  const avgNet = mean(monthly.slice(-6).map((m) => m.net));
  const avgIncome = mean(monthly.slice(-6).map((m) => m.income));
  const avgSpend = mean(monthly.slice(-6).map((m) => m.expense));
  const fc = forecastCashflow(monthly, 12);
  const nw = currentNetWorth(state);

  const retireBalance = latestBalances(state)
    .filter((x) => x.snap && ["401k", "investment"].includes(x.account.type))
    .reduce((a, x) => a + x.snap.balance, 0);
  const recentContrib = recentMonthlyContrib(state);

  const nowYear = new Date().getFullYear();
  const yearsTo = Math.max(1, (s.retireYear || nowYear + 25) - nowYear);

  root.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <h3>Next 12 months of cash flow <span class="sub">trend + 80% confidence band</span></h3>
      <div class="chart" id="ch-cf"></div>
      <p class="muted" style="margin-top:6px">
        Recent rhythm: <b>${fmt(avgIncome)}</b> in, <b>${fmt(avgSpend)}</b> out → <b style="color:${avgNet >= 0 ? "var(--green)" : "var(--red)"}">${fmt(avgNet)}/mo</b> kept.
        If the band dips below zero, a thin month is statistically on the menu — nice to know before it happens.
      </p>
    </div>

    <div class="card" style="margin-bottom:14px">
      <h3>Household net worth · 10-year Monte Carlo <span class="sub">400 simulated futures</span></h3>
      <div class="chart tall" id="ch-mc"></div>
      <div class="statgrid" id="st-mc"></div>
      <p class="muted">Each run draws random market months (your expected-return settings below). The bands are the 10th–90th percentile of outcomes: plan around the middle, sleep well knowing the floor.</p>
    </div>

    <div class="card" style="margin-bottom:14px">
      <h3>Retirement projector <span class="sub">drag the sliders — the chart answers instantly</span></h3>
      <div class="row2" style="margin-bottom:4px">
        <label class="fld"><span>Retire in year: <b id="lbl-year">${s.retireYear || nowYear + 25}</b></span>
          <input type="range" id="in-year" min="${nowYear + 1}" max="${nowYear + 45}" step="1" value="${s.retireYear || nowYear + 25}"/></label>
        <label class="fld"><span>Monthly contribution: <b id="lbl-contrib">${fmt(recentContrib)}</b></span>
          <input type="range" id="in-contrib" min="0" max="5000" step="50" value="${Math.round(recentContrib)}"/></label>
      </div>
      <div class="row2" style="margin-bottom:8px">
        <label class="fld"><span>Expected return: <b id="lbl-ret">${(s.expectedReturn * 100).toFixed(0)}%</b>/yr</span>
          <input type="range" id="in-ret" min="2" max="12" step="0.5" value="${s.expectedReturn * 100}"/></label>
        <label class="fld"><span>Volatility: <b id="lbl-vol">${(s.returnVolatility * 100).toFixed(0)}%</b></span>
          <input type="range" id="in-vol" min="5" max="25" step="1" value="${s.returnVolatility * 100}"/></label>
      </div>
      <div class="chart tall" id="ch-ret"></div>
      <div class="statgrid" id="st-ret"></div>
      <p class="muted" id="note-ret"></p>
    </div>

    <div class="card">
      <h3>What a 5% trim buys you</h3>
      <div id="trim"></div>
    </div>
  `;

  // ----- cash flow forecast -----
  charts.forecast(root.querySelector("#ch-cf"), monthly.map((m) => m.key), monthly.map((m) => Math.round(m.net)), fc);

  // ----- net worth MC -----
  const mcMonths = 120;
  const mc = monteCarloWealth({
    start: Math.max(0, nw), monthlyContrib: Math.max(0, avgNet),
    months: mcMonths, annualReturn: s.expectedReturn * 0.75 /* blended: not everything is invested */,
    annualVol: s.returnVolatility * 0.7, sims: 400, seed: 1234,
  });
  const mcKeys = lastNMonthKeys(1).concat(Array.from({ length: mcMonths }, (_, i) => addM(thisMonthKey(), i + 1)));
  charts.fan(root.querySelector("#ch-mc"), mcKeys.map(yearish), mc, charts.PALETTE.joint);
  root.querySelector("#st-mc").innerHTML = `
    <div class="stat"><div class="l">Today</div><div class="v">${charts.shortMoney(nw)}</div></div>
    <div class="stat"><div class="l">Median · 5yr</div><div class="v pos">${charts.shortMoney(mc.p50[60])}</div></div>
    <div class="stat"><div class="l">Median · 10yr</div><div class="v pos">${charts.shortMoney(mc.p50[mcMonths])}</div></div>`;

  // ----- retirement projector -----
  const els = {
    year: root.querySelector("#in-year"), contrib: root.querySelector("#in-contrib"),
    ret: root.querySelector("#in-ret"), vol: root.querySelector("#in-vol"),
  };
  const runRetire = () => {
    const year = +els.year.value, contrib = +els.contrib.value;
    const annualReturn = +els.ret.value / 100, annualVol = +els.vol.value / 100;
    root.querySelector("#lbl-year").textContent = year;
    root.querySelector("#lbl-contrib").textContent = fmt(contrib);
    root.querySelector("#lbl-ret").textContent = (annualReturn * 100).toFixed(1).replace(/\.0$/, "") + "%";
    root.querySelector("#lbl-vol").textContent = (annualVol * 100).toFixed(0) + "%";

    const months = Math.max(12, (year - nowYear) * 12);
    const bands = monteCarloWealth({ start: retireBalance, monthlyContrib: contrib, months, annualReturn, annualVol, sims: 400, seed: 7 });
    const keys = Array.from({ length: months + 1 }, (_, i) => addM(thisMonthKey(), i));
    charts.fan(root.querySelector("#ch-ret"), keys.map(yearish), bands, charts.PALETTE.p1);

    const median = bands.p50[months], lo = bands.p10[months], hi = bands.p90[months];
    const swr = median * 0.04 / 12; // 4% rule, monthly
    root.querySelector("#st-ret").innerHTML = `
      <div class="stat"><div class="l">Median at ${year}</div><div class="v pos">${charts.shortMoney(median)}</div></div>
      <div class="stat"><div class="l">10th–90th</div><div class="v">${charts.shortMoney(lo)}–${charts.shortMoney(hi)}</div></div>
      <div class="stat"><div class="l">≈ income (4% rule)</div><div class="v">${charts.shortMoney(swr)}/mo</div></div>`;
    root.querySelector("#note-ret").textContent =
      `Starting from ${fmt(retireBalance)} across your retirement accounts. The 4% rule says the median pot could sustain roughly ${fmt(swr)}/mo in retirement (today's dollars are not adjusted here — keep expectations modestly humble).`;
    setSettings({ retireYear: year, expectedReturn: annualReturn, returnVolatility: annualVol });
  };
  const lazy = debounce(runRetire, 120);
  Object.values(els).forEach((el) => el.addEventListener("input", lazy));
  runRetire();

  // ----- trim scenario -----
  const trim = avgSpend * 0.05;
  const invested = futureValue(trim, s.expectedReturn / 12, 120);
  root.querySelector("#trim").innerHTML = `
    <p class="muted" style="font-size:13px;line-height:1.7">
      Cutting spending by just <b>5%</b> (${fmt(trim)}/mo — about one subscription audit and two skipped impulse buys) and investing it instead:<br/>
      · <b style="color:var(--green)">${fmt(trim * 12)}</b> in year one<br/>
      · <b style="color:var(--green)">${fmt(futureValue(trim, s.expectedReturn / 12, 60))}</b> after 5 years at ${(s.expectedReturn * 100).toFixed(0)}%<br/>
      · <b style="color:var(--green)">${fmt(invested)}</b> after 10 years — from money you likely wouldn't miss.
    </p>`;
}

function recentMonthlyContrib(state) {
  const snaps = state.snapshots
    .filter((s) => s.contrib > 0)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return snaps.length ? mean(snaps.map((s) => s.contrib)) : 500;
}
function futureValue(monthly, r, n) {
  return r === 0 ? monthly * n : monthly * ((Math.pow(1 + r, n) - 1) / r);
}
function addM(mk, n) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// label only January + July to keep long horizons readable
function yearish(mk) { return mk.endsWith("-01") ? mk.slice(0, 4) : ""; }
