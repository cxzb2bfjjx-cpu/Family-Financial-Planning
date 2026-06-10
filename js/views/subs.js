// ---------- Tandem · subscriptions ----------

import { getState, addManualSub, deleteManualSub, muteSub, unmuteSub } from "../store.js";
import { fmt, escapeHtml, sum, prettyDate, shortDate, daysBetween, todayISO } from "../util.js";
import { allSubscriptions, subCreepSeries } from "../finance.js";
import { catIcon } from "../categorize.js";
import * as charts from "../charts.js";
import { openModal, closeModal, formData, field, ownerSelect, categorySelect, ownerChip, toast } from "../ui.js";

export function renderSubs(root, navigate) {
  const state = getState();
  const all = allSubscriptions(state);
  const active = all.filter((s) => s.active && s.kind === "sub");
  const lapsed = all.filter((s) => !s.active && s.kind === "sub");
  const bills = all.filter((s) => s.active && s.kind === "bill");
  const monthly = sum(active.map((s) => s.monthlyCost));
  const billsMonthly = sum(bills.map((s) => s.monthlyCost));
  const yearly = monthly * 12;
  const hikes = [...active, ...bills].filter((s) => s.hike);
  const creep = subCreepSeries(state.transactions, state.subsMuted, 12);

  const today = todayISO();
  const upcoming = [...active, ...bills]
    .filter((s) => s.nextDate)
    .map((s) => ({ ...s, inDays: daysBetween(today, s.nextDate) }))
    .filter((s) => s.inDays >= 0 && s.inDays <= 30)
    .sort((a, b) => a.inDays - b.inDays);

  root.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="lbl">Active subscriptions</div><div class="val">${active.length}</div><div class="delta">${lapsed.length ? `${lapsed.length} lapsed` : "auto-detected from activity"}</div></div>
      <div class="kpi"><div class="lbl">Subs per month</div><div class="val" style="color:var(--p1)">${fmt(monthly)}</div><div class="delta">${fmt(yearly)} a year</div></div>
      <div class="kpi"><div class="lbl">Recurring bills / mo</div><div class="val">${fmt(billsMonthly)}</div><div class="delta">${bills.length} detected — rent, insurance…</div></div>
      <div class="kpi"><div class="lbl">Price hikes</div><div class="val" style="color:${hikes.length ? "var(--amber)" : "var(--green)"}">${hikes.length}</div><div class="delta">${hikes.length ? "renegotiate or cancel?" : "none detected ✓"}</div></div>
    </div>

    ${hikes.map((h) => `
      <div class="insight warn">
        <div class="em">📣</div>
        <div><div class="t">${escapeHtml(h.name)} went up</div>
        <div class="b">${fmt(h.hike.from, { cents: true })} → ${fmt(h.hike.to, { cents: true })} per ${h.cadence.replace("ly", "")} — that's ${fmt((h.hike.to - h.hike.from) * (h.cadence === "monthly" ? 12 : 1), { cents: false })}/yr more.</div></div>
      </div>`).join("")}

    <div class="grid">
      <div class="card s6">
        <h3>Subscription creep <span class="sub">recurring charges per month</span></h3>
        <div class="chart" id="ch-creep"></div>
      </div>
      <div class="card s6">
        <h3>Renewing in the next 30 days</h3>
        ${upcoming.length ? `<div class="list">${upcoming.map((u) => `
          <div class="litem">
            <div class="ic">${u.inDays <= 3 ? "🔜" : "📅"}</div>
            <div class="mid"><div class="t1">${escapeHtml(u.name)}</div>
            <div class="t2">${u.inDays === 0 ? "today" : u.inDays === 1 ? "tomorrow" : `in ${u.inDays} days`} · ${shortDate(u.nextDate)}</div></div>
            <div class="amt">${fmt(u.amount, { cents: true })}</div>
          </div>`).join("")}</div>` : `<div class="empty"><div class="big">😌</div>Nothing due in the next 30 days.</div>`}
      </div>

      <div class="card s12" style="grid-column: span 12">
        <h3>Subscriptions <button class="btn small ghost" id="btn-addsub">+ add manually</button></h3>
        ${active.length ? `<div class="list">${active.map(subRow).join("")}</div>`
          : `<div class="empty"><div class="big">🔁</div>No recurring charges detected yet.<br/><span class="muted">They'll appear automatically once the same merchant shows up a few times — or add one manually.</span></div>`}
      </div>

      ${bills.length ? `
      <div class="card s12" style="grid-column: span 12">
        <h3>Recurring bills <span class="sub">steady & deliberate — housing, utilities, insurance, loans</span></h3>
        <div class="list">${bills.map(subRow).join("")}</div>
      </div>` : ""}

      ${lapsed.length ? `
      <div class="card s12" style="grid-column: span 12">
        <h3>Lapsed / cancelled <span class="sub">no recent charge — nice work if intentional</span></h3>
        <div class="list">${lapsed.map(subRow).join("")}</div>
      </div>` : ""}

      ${state.subsMuted.length ? `
      <div class="card s12" style="grid-column: span 12">
        <h3>Ignored merchants</h3>
        <p class="muted" style="margin-bottom:8px">Marked as "not a subscription".</p>
        ${state.subsMuted.map((k) => `<span class="chip" style="margin:0 6px 6px 0">${escapeHtml(k)} <a href="#" data-unmute="${escapeHtml(k)}" style="text-decoration:none">✕</a></span>`).join("")}
      </div>` : ""}
    </div>`;

  charts.subCreep(root.querySelector("#ch-creep"), creep);

  root.querySelector("#btn-addsub").addEventListener("click", () => addSubModal(navigate));
  root.querySelectorAll("[data-mute]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); muteSub(b.dataset.mute); toast("Won't track that one"); navigate(null); }));
  root.querySelectorAll("[data-delmanual]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); deleteManualSub(b.dataset.delmanual); navigate(null); }));
  root.querySelectorAll("[data-unmute]").forEach((a) =>
    a.addEventListener("click", (e) => { e.preventDefault(); unmuteSub(a.dataset.unmute); navigate(null); }));
}

function subRow(s) {
  const per = { weekly: "wk", monthly: "mo", quarterly: "qtr", yearly: "yr" }[s.cadence];
  return `<div class="litem">
    <div class="ic">${catIcon(s.category)}</div>
    <div class="mid">
      <div class="t1">${escapeHtml(s.name)} ${s.hike ? `<span class="chip warn">price hike</span>` : ""} ${!s.active ? `<span class="chip">lapsed</span>` : ""}</div>
      <div class="t2">${ownerChip(s.owner)} ${s.source === "auto" ? `seen ${s.count}× since ${shortDate(s.firstDate)}` : "manual entry"}</div>
    </div>
    <div style="text-align:right">
      <div class="amt">${fmt(s.amount, { cents: true })}<small>/${per} · ${fmt(s.monthlyCost)}/mo eq.</small></div>
      ${s.source === "auto"
        ? `<button class="btn small ghost" data-mute="${escapeHtml(s.key)}" style="margin-top:4px">not a sub</button>`
        : `<button class="btn small ghost" data-delmanual="${s.id}" style="margin-top:4px">remove</button>`}
    </div>
  </div>`;
}

function addSubModal(navigate) {
  openModal(`
    <h2>Add a subscription</h2>
    ${field("name", "Name", `placeholder="e.g. YMCA membership"`)}
    <div class="row2">
      ${field("amount", "Amount", `inputmode="decimal" placeholder="19.99"`)}
      <label class="fld"><span>Billed</span><select name="cadence">
        <option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="weekly">Weekly</option>
      </select></label>
    </div>
    <div class="row2">
      ${ownerSelect("owner", "joint")}
      ${categorySelect("category", "subs")}
    </div>
    ${field("nextDate", "Next renewal", "", "date")}
    <div class="actions"><button class="btn ghost" data-x>Cancel</button><button class="btn" data-save>Add</button></div>
  `, (m) => {
    m.querySelector("[data-x]").onclick = closeModal;
    m.querySelector("[data-save]").onclick = () => {
      const d = formData(m);
      const amount = parseFloat(d.amount);
      if (!d.name || isNaN(amount)) { toast("Name and amount needed"); return; }
      addManualSub({ name: d.name, amount, cadence: d.cadence, owner: d.owner, category: d.category, nextDate: d.nextDate || null });
      closeModal(); toast("Added ✓"); navigate(null);
    };
  });
}
