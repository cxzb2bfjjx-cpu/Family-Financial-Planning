// ---------- Tandem · demo household generator ----------
// Deterministic 18 months of realistic data for two partners, ending today.
// Lets you explore every feature before entering a single real number.

import { rng, gauss, isoDate, addMonths, todayISO, uid } from "./util.js";
import { autoCategory } from "./categorize.js";
import { getState, replaceState, defaultState } from "./store.js";
import { benchmarkMonthly, benchmarkReturns } from "./market.js";

const MONTHS = 18;

export function loadDemo(p1 = "Alex", p2 = "Sam") {
  const rand = rng(20260610);
  const s = defaultState();
  const today = todayISO();
  const start = addMonths(today, -(MONTHS - 1)).slice(0, 7) + "-01";

  s.onboarded = true;
  s.demo = true;
  s.settings = {
    ...s.settings,
    p1Name: p1, p2Name: p2,
    householdName: "The demo household",
    bigExpenseThreshold: 400,
  };

  const tx = [];
  const push = (date, merchant, amount, owner, category) => {
    if (date > today) return;
    tx.push({
      id: uid(), date, merchant, owner,
      amount: Math.round(amount * 100) / 100,
      category: category || autoCategory(merchant, amount),
      notes: "", flagAck: false, updatedAt: date,
    });
  };
  const jitter = (base, pct) => base * (1 + (rand() - 0.5) * 2 * pct);
  const dayIn = (mk, lo, hi) => `${mk}-${String(Math.floor(lo + rand() * (hi - lo + 1))).padStart(2, "0")}`;

  const monthKeys = [];
  for (let i = 0; i < MONTHS; i++) monthKeys.push(addMonths(start, i).slice(0, 7));

  monthKeys.forEach((mk, mi) => {
    // ----- income -----
    const raise = mi >= 12 ? 1.045 : 1;                       // p1 got a raise 6 months ago
    push(`${mk}-01`, "Acme Corp Payroll", 2450 * raise, "p1");
    push(`${mk}-15`, "Acme Corp Payroll", 2450 * raise, "p1");
    const gigs = 1 + Math.floor(rand() * 1.9);                // p2 freelances: lumpy 1–2 payments
    for (let g = 0; g < gigs; g++) push(dayIn(mk, 3, 27), "Stripe Payout — Studio Sam", jitter(1350, 0.45), "p2");
    if (rand() < 0.25) push(dayIn(mk, 5, 25), "Interest Paid — HYSA", jitter(62, 0.2), "joint");

    // ----- fixed household -----
    push(`${mk}-01`, "Bluebird Mortgage", -2150, "p1");
    push(`${mk}-05`, "City Power & Light", -jitter(mi % 12 < 3 || mi % 12 > 9 ? 195 : 130, 0.18), "joint");
    push(`${mk}-07`, "Comcast Xfinity Internet", -79.99, "p2");
    push(`${mk}-12`, "T-Mobile Family Plan", -95.0, "p1");
    push(`${mk}-18`, "Geico Insurance Premium", -188.5, "joint");
    push(`${mk}-20`, "Honda Financial Auto Loan", -389.0, "p2");

    // ----- subscriptions (one gets a price hike, one gets cancelled) -----
    push(`${mk}-03`, "NETFLIX.COM", mi >= 15 ? -17.99 : -15.49, "p1");          // recent price hike
    push(`${mk}-09`, "Spotify Duo", -16.99, "p2");
    push(`${mk}-14`, "APPLE.COM/BILL iCloud+", -2.99, "p1");
    push(`${mk}-06`, "Iron Temple Gym", -45.0, "p2");
    push(`${mk}-22`, "Disney+ Bundle", -13.99, "joint");
    if (mi < 9) push(`${mk}-25`, "HBO Max", -16.99, "p2");                      // cancelled 9 months ago
    if (mi >= 6) push(`${mk}-11`, "ChatGPT Plus", -20.0, "p1");                 // new sub 12 months in
    if (mk.endsWith("-03")) push(`${mk}-17`, "Amazon Prime Membership", -139.0, "p1"); // annual

    // ----- groceries: ~weekly, split shoppers -----
    for (let w = 0; w < 4; w++) {
      const d = `${mk}-${String(2 + w * 7 + Math.floor(rand() * 4)).padStart(2, "0")}`;
      const who = rand() < 0.55 ? "p1" : "p2";
      const store = rand() < 0.6 ? "Trader Joe's" : rand() < 0.5 ? "Costco Wholesale" : "Safeway";
      push(d, store, -jitter(store === "Costco Wholesale" ? 210 : 118, 0.3), who);
    }

    // ----- dining: p2 eats out more (fuel for the radar chart) -----
    const dines = 4 + Math.floor(rand() * 5);
    const spots = ["Blue Bottle Coffee", "Chipotle", "Thai Basil", "DoorDash", "La Taqueria", "Starbucks", "Night Owl Bar", "Sushi Garden"];
    for (let i = 0; i < dines; i++) {
      const who = rand() < 0.62 ? "p2" : "p1";
      push(dayIn(mk, 1, 28), spots[Math.floor(rand() * spots.length)], -jitter(34, 0.6), who);
    }

    // ----- transport -----
    for (let i = 0; i < 3; i++) push(dayIn(mk, 2, 27), "Shell Gas Station", -jitter(48, 0.25), rand() < 0.5 ? "p1" : "p2");
    if (rand() < 0.6) push(dayIn(mk, 1, 28), "Uber", -jitter(22, 0.5), "p2");

    // ----- shopping & misc -----
    const shops = 2 + Math.floor(rand() * 3);
    const stores = ["Amazon.com", "Target", "IKEA", "REI Co-op", "Etsy", "Best Buy"];
    for (let i = 0; i < shops; i++) push(dayIn(mk, 1, 28), stores[Math.floor(rand() * stores.length)], -jitter(64, 0.7), rand() < 0.5 ? "p1" : "p2");
    if (rand() < 0.5) push(dayIn(mk, 1, 28), "CVS Pharmacy", -jitter(28, 0.5), rand() < 0.5 ? "p1" : "p2");
    if (rand() < 0.35) push(dayIn(mk, 1, 28), "Chewy.com", -jitter(58, 0.2), "joint");

    // ----- the occasional wallet-bruiser (feeds the flag queue) -----
    const bigs = [
      ["Delta Air Lines", -1240, "joint"], ["Precision Auto Repair", -850, "p2"],
      ["Apple Store — iPhone", -1099, "p1"], ["West Elm Furniture", -1450, "joint"],
      ["City General Dental", -620, "p1"], ["Ticketmaster — Arena Show", -410, "p2"],
      ["United Airlines", -980, "joint"], ["Vet Emergency Clinic", -540, "joint"],
    ];
    if (rand() < 0.45) {
      const [m, a, o] = bigs[Math.floor(rand() * bigs.length)];
      push(dayIn(mk, 2, 26), m, jitter(a, 0.1), o);
    }
  });

  s.transactions = tx;

  // ----- accounts & balance history -----
  const acc = (name, owner, type) => { const a = { id: uid(), name, owner, type }; s.accounts.push(a); return a; };
  const chk1 = acc("Everyday Checking", "p1", "checking");
  const chk2 = acc("Studio Checking", "p2", "checking");
  const hysa = acc("High-Yield Savings", "joint", "savings");
  const k401 = acc("Acme 401(k)", "p1", "401k");
  const roth = acc("Roth IRA", "p2", "investment");
  const loan = acc("Honda Auto Loan", "p2", "debt");

  // 401k returns derived from the real benchmark (≈85% equity + noise), so the
  // market-comparison chart tells the classic target-date-fund story out of the box
  const bret = new Map(benchmarkReturns(benchmarkMonthly()));
  const mret = monthKeys.map((mk, i) => {
    let r = (bret.get(mk) ?? 0.008) * 0.92 + 0.0005 + gauss(rand) * 0.009;
    if (i === 9) r = Math.min(r - 0.03, -0.025);   // one rough month — keeps the chart honest
    return r;
  });

  let bal401 = 68400, balRoth = 21900, balHysa = 16800, balLoan = -13900, b1 = 5200, b2 = 3400;
  monthKeys.forEach((mk, i) => {
    const d = `${mk}-28` <= today ? `${mk}-28` : today;
    bal401 = bal401 * (1 + mret[i]) + 950;            // contribution + employer match
    balRoth = balRoth * (1 + mret[i] * 0.85) + 400;
    balHysa = balHysa * (1 + 0.043 / 12) + (i % 3 === 0 ? 500 : 250);
    balLoan = Math.min(0, balLoan + 360);
    b1 = Math.max(900, b1 + (rand() - 0.45) * 900);
    b2 = Math.max(600, b2 + (rand() - 0.45) * 700);
    const snap = (account, balance, contrib = 0) =>
      s.snapshots.push({ id: uid(), accountId: account.id, date: d, balance: Math.round(balance), contrib });
    snap(k401, bal401, 950);
    snap(roth, balRoth, 400);
    snap(hysa, balHysa, i % 3 === 0 ? 500 : 250);
    snap(loan, balLoan);
    if (i % 2 === 0 || i === MONTHS - 1) { snap(chk1, b1); snap(chk2, b2); }
  });

  s.links = [
    { id: uid(), name: "Everyday Checking — Chase", url: "chase.com", owner: "p1", category: "banking", notes: "statement posts the 1st", updatedAt: today },
    { id: uid(), name: "High-Yield Savings — Ally", url: "ally.com", owner: "joint", category: "banking", notes: "", updatedAt: today },
    { id: uid(), name: "Acme 401(k) — Fidelity", url: "nb.fidelity.com", owner: "p1", category: "investing", notes: "quarterly statements", updatedAt: today },
    { id: uid(), name: "Roth IRA — Vanguard", url: "vanguard.com", owner: "p2", category: "investing", notes: "", updatedAt: today },
    { id: uid(), name: "Geico auto & home", url: "geico.com", owner: "joint", category: "insurance", notes: "renews in March", updatedAt: today },
    { id: uid(), name: "Honda Financial", url: "hondafinancialservices.com", owner: "p2", category: "loans", notes: "", updatedAt: today },
  ];

  s.goals = [
    { id: uid(), name: "Emergency fund", emoji: "🛟", target: 25000, saved: Math.round(balHysa), targetDate: addMonths(today, 10) },
    { id: uid(), name: "Japan trip", emoji: "🗾", target: 6000, saved: 2950, targetDate: addMonths(today, 8) },
    { id: uid(), name: "Kitchen reno", emoji: "🔨", target: 18000, saved: 4100, targetDate: addMonths(today, 22) },
  ];

  // carry over any API key the user already configured
  const prev = getState();
  s.settings.marketProvider = prev.settings.marketProvider;
  s.settings.marketApiKey = prev.settings.marketApiKey;

  replaceState(s);
}
