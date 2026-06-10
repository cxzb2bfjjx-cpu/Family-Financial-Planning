// ---------- Tandem · utilities ----------

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Deterministic RNG (mulberry32) for demo data + Monte Carlo reproducibility
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Standard normal via Box–Muller
export function gauss(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ---------- dates ----------
export const pad2 = (n) => String(n).padStart(2, "0");
export const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayISO = () => isoDate(new Date());
export const monthKey = (iso) => iso.slice(0, 7);
export const thisMonthKey = () => monthKey(todayISO());

export function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d || 1);
}
export function addMonths(iso, n) {
  const d = parseISO(iso.length === 7 ? iso + "-01" : iso);
  d.setMonth(d.getMonth() + n);
  return isoDate(d);
}
export function lastNMonthKeys(n, endKey = thisMonthKey()) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) keys.push(addMonths(endKey, -i).slice(0, 7));
  return keys;
}
export function daysBetween(aISO, bISO) {
  return Math.round((parseISO(bISO) - parseISO(aISO)) / 86400000);
}
export function monthLabel(key) {
  const d = parseISO(key + "-01");
  // "Jun ’26" — the apostrophe keeps it from reading like a day-of-month
  return d.toLocaleDateString(undefined, { month: "short" }) + " ’" + key.slice(2, 4);
}
export function prettyDate(iso) {
  return parseISO(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
export function shortDate(iso) {
  return parseISO(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------- money ----------
let _cur = "USD";
export const setCurrency = (c) => { _cur = c || "USD"; };
export function fmt(n, opts = {}) {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  const digits = opts.cents ? 2 : (abs >= 1000 ? 0 : abs >= 100 ? 0 : 2);
  return new Intl.NumberFormat(undefined, {
    style: "currency", currency: _cur,
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(n);
}
export function fmtCompact(n) {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return fmtSign(n / 1e6, 1) + "M";
  if (abs >= 1e4) return fmtSign(n / 1e3, 1) + "k";
  return fmt(n);
}
function fmtSign(n, d) {
  const s = new Intl.NumberFormat(undefined, { style: "currency", currency: _cur, minimumFractionDigits: 0, maximumFractionDigits: d }).format(n);
  return s;
}
export function fmtPct(n, digits = 1) {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;
}
export function fmtPctPlain(n, digits = 1) {
  if (n == null || isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

// ---------- stats ----------
export const sum = (arr) => arr.reduce((a, b) => a + b, 0);
export const mean = (arr) => (arr.length ? sum(arr) / arr.length : 0);
export function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(sum(arr.map((x) => (x - m) ** 2)) / (arr.length - 1));
}
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
// least-squares fit, returns {slope, intercept, residStd}
export function linreg(ys) {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] || 0, residStd: 0 };
  const xs = ys.map((_, i) => i);
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den ? num / den : 0;
  const intercept = my - slope * mx;
  const resid = ys.map((y, i) => y - (intercept + slope * i));
  return { slope, intercept, residStd: std(resid) };
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

// ---------- DOM ----------
export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function downloadFile(name, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

// Tiny CSV parser that handles quoted fields
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
