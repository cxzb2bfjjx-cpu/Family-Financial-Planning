// ---------- Tandem · state & persistence ----------
// All data lives in localStorage on this device. Nothing is ever sent anywhere.

import { uid, todayISO, setCurrency } from "./util.js";

const KEY = "tandem.v1";

export function defaultState() {
  return {
    version: 1,
    onboarded: false,
    demo: false,
    settings: {
      p1Name: "Partner 1",
      p2Name: "Partner 2",
      householdName: "Our household",
      currency: "USD",
      bigExpenseThreshold: 300,
      marketProvider: "demo",        // demo | finnhub | alphavantage
      marketApiKey: "",
      expectedReturn: 0.07,          // long-run annual, for forecasts
      returnVolatility: 0.15,
      retireYear: new Date().getFullYear() + 25,
    },
    transactions: [],   // {id, date, merchant, amount(+income/−expense), category, owner:'p1'|'p2'|'joint', notes, flagAck, updatedAt}
    accounts: [],       // {id, name, owner, type:'checking'|'savings'|'investment'|'401k'|'debt'}
    snapshots: [],      // {id, accountId, date, balance, contrib}  contrib = contributions since previous snapshot (investment/401k)
    subsManual: [],     // manual subscription entries {id, name, owner, amount, cadence, nextDate, category}
    subsMuted: [],      // merchantKeys the user said are NOT subscriptions
    goals: [],          // {id, name, target, saved, emoji, targetDate}
    links: [],          // {id, name, url, owner, category, notes, updatedAt} — financial service shortcuts
    quoteLog: {},       // symbol -> [{d:'YYYY-MM-DD', c:price}] accumulated market history from live fetches
  };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = { ...defaultState(), ...JSON.parse(raw) };
      s.settings = { ...defaultState().settings, ...s.settings };
      return s;
    }
  } catch (e) { console.warn("Failed to load saved data", e); }
  return defaultState();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.error("Save failed (storage full?)", e); }
}

export const getState = () => state;

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function commit(silent = false) {
  setCurrency(state.settings.currency);
  save();
  if (!silent) listeners.forEach((fn) => fn(state));
}
setCurrency(state.settings.currency);

// ---------- mutations ----------
export function setSettings(patch) {
  Object.assign(state.settings, patch);
  commit();
}
export function setOnboarded(v) { state.onboarded = v; commit(); }

export function addTx(tx) {
  state.transactions.push({ id: uid(), flagAck: false, notes: "", updatedAt: todayISO(), ...tx });
  commit();
}
export function addTxBulk(txs) {
  // dedupe on (date, amount, merchant) so re-importing the same CSV is safe
  const seen = new Set(state.transactions.map((t) => `${t.date}|${t.amount}|${(t.merchant || "").toLowerCase()}`));
  let added = 0;
  for (const tx of txs) {
    const sig = `${tx.date}|${tx.amount}|${(tx.merchant || "").toLowerCase()}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    state.transactions.push({ id: uid(), flagAck: false, notes: "", updatedAt: todayISO(), ...tx });
    added++;
  }
  commit();
  return added;
}
export function updateTx(id, patch) {
  const t = state.transactions.find((t) => t.id === id);
  if (t) { Object.assign(t, patch, { updatedAt: todayISO() }); commit(); }
}
export function deleteTx(id) {
  state.transactions = state.transactions.filter((t) => t.id !== id);
  commit();
}

export function addAccount(acc) { const a = { id: uid(), ...acc }; state.accounts.push(a); commit(); return a; }
export function updateAccount(id, patch) {
  const a = state.accounts.find((a) => a.id === id);
  if (a) { Object.assign(a, patch); commit(); }
}
export function deleteAccount(id) {
  state.accounts = state.accounts.filter((a) => a.id !== id);
  state.snapshots = state.snapshots.filter((s) => s.accountId !== id);
  commit();
}
export function addSnapshot(snap) {
  state.snapshots.push({ id: uid(), contrib: 0, ...snap });
  commit();
}
export function deleteSnapshot(id) {
  state.snapshots = state.snapshots.filter((s) => s.id !== id);
  commit();
}

export function addManualSub(sub) { state.subsManual.push({ id: uid(), ...sub }); commit(); }
export function deleteManualSub(id) { state.subsManual = state.subsManual.filter((s) => s.id !== id); commit(); }
export function muteSub(merchKey) { if (!state.subsMuted.includes(merchKey)) { state.subsMuted.push(merchKey); commit(); } }
export function unmuteSub(merchKey) { state.subsMuted = state.subsMuted.filter((k) => k !== merchKey); commit(); }

export function addGoal(g) { state.goals.push({ id: uid(), ...g }); commit(); }
export function updateGoal(id, patch) {
  const g = state.goals.find((g) => g.id === id);
  if (g) { Object.assign(g, patch); commit(); }
}
export function deleteGoal(id) { state.goals = state.goals.filter((g) => g.id !== id); commit(); }

export function addLink(l) { state.links.push({ id: uid(), notes: "", updatedAt: todayISO(), ...l }); commit(); }
export function updateLink(id, patch) {
  const l = state.links.find((l) => l.id === id);
  if (l) { Object.assign(l, patch, { updatedAt: todayISO() }); commit(); }
}
export function deleteLink(id) { state.links = state.links.filter((l) => l.id !== id); commit(); }

export function logQuotes(quotes) {
  // Accumulate our own price history from live fetches — sparklines get richer the more you visit.
  const d = todayISO();
  for (const q of quotes) {
    if (!q || q.price == null) continue;
    const log = (state.quoteLog[q.symbol] = state.quoteLog[q.symbol] || []);
    const last = log[log.length - 1];
    if (last && last.d === d) last.c = q.price;
    else log.push({ d, c: q.price });
    if (log.length > 400) log.splice(0, log.length - 400);
  }
  commit(true);
}

// ---------- backup / household sync ----------
export function exportJSON() {
  return JSON.stringify({ app: "tandem", exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importJSON(text, mode /* 'replace' | 'merge' */) {
  const payload = JSON.parse(text);
  const incoming = payload.state || payload; // accept raw state too
  if (!incoming.transactions) throw new Error("That file doesn't look like a Tandem backup.");
  if (mode === "replace") {
    state = { ...defaultState(), ...incoming };
    state.settings = { ...defaultState().settings, ...incoming.settings };
  } else {
    // merge: union by id — lets each spouse track on their own phone and merge periodically
    const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
    for (const k of ["transactions", "accounts", "snapshots", "subsManual", "goals", "links"]) {
      const mine = byId(state[k] || []);
      for (const item of incoming[k] || []) {
        const existing = mine.get(item.id);
        if (!existing) state[k].push(item);
        else if ((k === "transactions" || k === "links") && (item.updatedAt || "") > (existing.updatedAt || "")) Object.assign(existing, item);
      }
    }
    state.subsMuted = [...new Set([...(state.subsMuted || []), ...(incoming.subsMuted || [])])];
  }
  commit();
}

export function wipeAll() {
  state = defaultState();
  commit();
}

export function replaceState(next) {
  state = next;
  commit();
}
