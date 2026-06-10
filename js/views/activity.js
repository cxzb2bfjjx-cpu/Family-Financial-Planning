// ---------- Tandem · activity: transactions, flags, CSV import ----------

import { getState, addTx, updateTx, deleteTx, addTxBulk } from "../store.js";
import { fmt, escapeHtml, todayISO, prettyDate, parseCSV, groupBy } from "../util.js";
import { unreviewedFlags } from "../finance.js";
import { autoCategory, CATEGORIES, catIcon, catLabel } from "../categorize.js";
import { openModal, closeModal, formData, field, ownerSelect, categorySelect, ownerChip, toast } from "../ui.js";

let filters = { q: "", owner: "all", cat: "all", month: "all" };

export function setActivityFilters(patch) { Object.assign(filters, patch); }

export function renderActivity(root, navigate) {
  const state = getState();
  const threshold = state.settings.bigExpenseThreshold;
  const flags = unreviewedFlags(state.transactions, threshold);

  const months = [...new Set(state.transactions.map((t) => t.date.slice(0, 7)))].sort().reverse();
  let txs = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1));
  if (filters.owner !== "all") txs = txs.filter((t) => t.owner === filters.owner);
  if (filters.cat !== "all") txs = txs.filter((t) => t.category === filters.cat);
  if (filters.month !== "all") txs = txs.filter((t) => t.date.startsWith(filters.month));
  if (filters.q) {
    const q = filters.q.toLowerCase();
    txs = txs.filter((t) => (t.merchant || "").toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q));
  }
  const shown = txs.slice(0, 200);

  root.innerHTML = `
    ${flags.length ? `
    <div class="card" style="border-left:3px solid var(--amber);margin-bottom:14px">
      <h3>🚩 Flagged — over ${fmt(threshold)} <span class="sub">${flags.length} to review</span></h3>
      <div class="list">
        ${flags.slice(0, 6).map((t) => `
          <div class="litem" data-flag="${t.id}">
            <div class="ic">⚠️</div>
            <div class="mid">
              <div class="t1">${escapeHtml(t.merchant)}</div>
              <div class="t2">${prettyDate(t.date)} · ${catLabel(t.category)}</div>
            </div>
            <div style="text-align:right">
              <div class="amt" style="color:var(--amber)">${fmt(t.amount)}</div>
              <button class="btn small ghost" data-ack="${t.id}" style="margin-top:4px">looks right ✓</button>
            </div>
          </div>`).join("")}
      </div>
      ${flags.length > 6 ? `<p class="muted" style="margin-top:8px">…and ${flags.length - 6} more below.</p>` : ""}
    </div>` : ""}

    <div class="filters">
      <input placeholder="🔍 Search merchant…" id="f-q" value="${escapeHtml(filters.q)}"/>
      <select id="f-owner">
        <option value="all">Everyone</option>
        <option value="p1" ${filters.owner === "p1" ? "selected" : ""}>${escapeHtml(state.settings.p1Name)}</option>
        <option value="p2" ${filters.owner === "p2" ? "selected" : ""}>${escapeHtml(state.settings.p2Name)}</option>
        <option value="joint" ${filters.owner === "joint" ? "selected" : ""}>Joint</option>
      </select>
      <select id="f-cat">
        <option value="all">All categories</option>
        ${CATEGORIES.map((c) => `<option value="${c.id}" ${filters.cat === c.id ? "selected" : ""}>${c.icon} ${c.label}</option>`).join("")}
      </select>
      <select id="f-month">
        <option value="all">All months</option>
        ${months.map((m) => `<option value="${m}" ${filters.month === m ? "selected" : ""}>${m}</option>`).join("")}
      </select>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn small" id="btn-add">＋ Add transaction</button>
      <button class="btn small ghost" id="btn-csv">📄 Import bank CSV</button>
    </div>

    <div class="card">
      ${shown.length ? `<div class="list">${renderGrouped(shown, threshold)}</div>` : `
        <div class="empty"><div class="big">🧾</div>No transactions match.<br/>
        <span class="muted">Add one by hand, or download a CSV from your bank's website (it's free) and import it.</span></div>`}
      ${txs.length > 200 ? `<p class="muted" style="margin-top:10px;text-align:center">Showing 200 of ${txs.length} — narrow the filters to see the rest.</p>` : ""}
    </div>`;

  // filter listeners
  const re = () => navigate(null);
  root.querySelector("#f-q").addEventListener("change", (e) => { filters.q = e.target.value; re(); });
  root.querySelector("#f-owner").addEventListener("change", (e) => { filters.owner = e.target.value; re(); });
  root.querySelector("#f-cat").addEventListener("change", (e) => { filters.cat = e.target.value; re(); });
  root.querySelector("#f-month").addEventListener("change", (e) => { filters.month = e.target.value; re(); });
  root.querySelector("#btn-add").addEventListener("click", () => txModal(null, navigate));
  root.querySelector("#btn-csv").addEventListener("click", () => csvModal(navigate));
  root.querySelectorAll("[data-ack]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); updateTx(b.dataset.ack, { flagAck: true }); toast("Reviewed ✓"); navigate(null); }));
  root.querySelectorAll("[data-tx]").forEach((r) =>
    r.addEventListener("click", () => txModal(r.dataset.tx, navigate)));
  root.querySelectorAll("[data-flag]").forEach((r) =>
    r.addEventListener("click", () => txModal(r.dataset.flag, navigate)));
}

function renderGrouped(txs, threshold) {
  const byDate = groupBy(txs, (t) => t.date);
  let html = "";
  for (const [date, list] of byDate) {
    html += `<div style="font-size:11px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.05em;padding:12px 2px 4px">${prettyDate(date)}</div>`;
    html += list.map((t) => txRow(t, threshold)).join("");
  }
  return html;
}

function txRow(t, threshold) {
  const big = t.amount <= -threshold;
  return `<div class="litem" data-tx="${t.id}">
    <div class="ic">${catIcon(t.category)}</div>
    <div class="mid">
      <div class="t1">${escapeHtml(t.merchant)} ${big && !t.flagAck ? "🚩" : ""}</div>
      <div class="t2">${catLabel(t.category)} ${ownerChip(t.owner)}</div>
    </div>
    <div class="amt ${t.amount > 0 ? "pos" : ""}">${t.amount > 0 ? "+" : ""}${fmt(t.amount, { cents: Math.abs(t.amount) < 100 })}</div>
  </div>`;
}

// ---------- add / edit ----------
export function txModal(txId, navigate) {
  const t = txId ? getState().transactions.find((x) => x.id === txId) : null;
  openModal(`
    <h2>${t ? "Edit transaction" : "Add transaction"}</h2>
    <div class="row2">
      ${field("date", "Date", "", "date", t?.date || todayISO())}
      ${field("amount", "Amount (− spend, + income)", `inputmode="decimal" placeholder="-42.50"`, "text", t?.amount ?? "")}
    </div>
    ${field("merchant", "Merchant / description", `placeholder="Trader Joe's"`, "text", t?.merchant || "")}
    <div class="row2">
      ${categorySelect("category", t?.category || "other")}
      ${ownerSelect("owner", t?.owner || "joint")}
    </div>
    ${field("notes", "Notes (optional)", "", "text", t?.notes || "")}
    <div class="actions">
      ${t ? `<button class="btn danger" data-del>Delete</button>` : `<button class="btn ghost" data-x>Cancel</button>`}
      <button class="btn" data-save>Save</button>
    </div>
  `, (m) => {
    const merchantEl = m.querySelector('[name="merchant"]');
    const catEl = m.querySelector('[name="category"]');
    const amtEl = m.querySelector('[name="amount"]');
    if (!t) merchantEl.addEventListener("input", () => { catEl.value = autoCategory(merchantEl.value, parseFloat(amtEl.value) || -1); });
    m.querySelector("[data-x]")?.addEventListener("click", closeModal);
    m.querySelector("[data-del]")?.addEventListener("click", () => { deleteTx(txId); closeModal(); toast("Deleted"); navigate(null); });
    m.querySelector("[data-save]").onclick = () => {
      const d = formData(m);
      const amount = parseFloat(String(d.amount).replace(/[$,]/g, ""));
      if (!d.merchant || isNaN(amount) || !d.date) { toast("Date, merchant and amount needed"); return; }
      const payload = { date: d.date, merchant: d.merchant, amount, category: d.category, owner: d.owner, notes: d.notes };
      if (t) updateTx(txId, payload); else addTx(payload);
      closeModal(); toast(t ? "Updated ✓" : "Added ✓"); navigate(null);
    };
  });
}

// ---------- CSV import wizard ----------
function csvModal(navigate) {
  openModal(`
    <h2>Import a bank CSV</h2>
    <p class="muted" style="margin-bottom:12px">Every bank lets you download transactions as CSV for free (usually under "Export" or "Download activity"). No bank linking, no aggregator fees, your credentials stay with your bank.</p>
    <label class="fld"><span>CSV file</span><input type="file" name="file" accept=".csv,text/csv"/></label>
    ${ownerSelect("owner", "joint")}
    <div id="csv-map"></div>
    <div class="actions"><button class="btn ghost" data-x>Cancel</button><button class="btn" data-go disabled>Import</button></div>
  `, (m) => {
    m.querySelector("[data-x]").onclick = closeModal;
    const goBtn = m.querySelector("[data-go]");
    let rows = null, header = null;

    m.querySelector('[name="file"]').addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const text = await f.text();
      const all = parseCSV(text);
      if (all.length < 2) { toast("Couldn't read that file"); return; }
      header = all[0].map((h) => h.trim());
      rows = all.slice(1);
      const guess = (cands) => {
        const i = header.findIndex((h) => cands.some((c) => h.toLowerCase().includes(c)));
        return i >= 0 ? i : 0;
      };
      const sel = (name, guessIdx, extra = "") => `
        <label class="fld"><span>${name}</span><select name="${name}">${extra}${header
          .map((h, i) => `<option value="${i}" ${i === guessIdx ? "selected" : ""}>${escapeHtml(h || "column " + (i + 1))}</option>`).join("")}</select></label>`;
      m.querySelector("#csv-map").innerHTML = `
        <p class="muted" style="margin-bottom:8px">Found <b>${rows.length}</b> rows. Map the columns:</p>
        <div class="row2">
          ${sel("Date", guess(["date", "posted"]))}
          ${sel("Description", guess(["desc", "merchant", "payee", "name", "detail"]))}
        </div>
        <div class="row2">
          ${sel("Amount", guess(["amount", "debit"]))}
          <label class="fld"><span>Amount sign</span><select name="sign">
            <option value="asis">As-is (− = spending)</option>
            <option value="flip">Flip (+ = spending)</option>
            <option value="negative">All are spending</option>
          </select></label>
        </div>`;
      goBtn.disabled = false;
    });

    goBtn.onclick = () => {
      if (!rows) return;
      const d = formData(m);
      const di = +d.Date, mi = +d.Description, ai = +d.Amount;
      const txs = [];
      for (const r of rows) {
        const dateRaw = (r[di] || "").trim();
        const date = normalizeDate(dateRaw);
        let amount = parseFloat(String(r[ai] || "").replace(/[$,()]/g, (c) => (c === "(" ? "-" : c === ")" ? "" : "")));
        if (!date || isNaN(amount)) continue;
        if (d.sign === "flip") amount = -amount;
        if (d.sign === "negative") amount = -Math.abs(amount);
        const merchant = (r[mi] || "Unknown").trim().slice(0, 60);
        txs.push({ date, merchant, amount, owner: d.owner, category: autoCategory(merchant, amount) });
      }
      const added = addTxBulk(txs);
      closeModal();
      toast(`Imported ${added} new transaction${added === 1 ? "" : "s"} (${txs.length - added} duplicates skipped)`);
      navigate(null);
    };
  });
}

function normalizeDate(s) {
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdY = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (mdY) {
    let [, m, d, y] = mdY;
    if (y.length === 2) y = "20" + y;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(s);
  return isNaN(dt) ? null : dt.toISOString().slice(0, 10);
}
