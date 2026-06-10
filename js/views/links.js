// ---------- Tandem · financial service links ----------
// Every login you two use, one tap away — open the site, download the
// statement, import it on the Activity tab. Statement day, mapped.

import { getState, addLink, updateLink, deleteLink } from "../store.js";
import { escapeHtml } from "../util.js";
import { openModal, closeModal, formData, field, ownerSelect, ownerChip, toast } from "../ui.js";

const LINK_CATS = [
  { id: "banking", label: "Banking", icon: "🏦" },
  { id: "cards", label: "Credit cards", icon: "💳" },
  { id: "investing", label: "Investing & retirement", icon: "📊" },
  { id: "insurance", label: "Insurance", icon: "🛡️" },
  { id: "loans", label: "Loans & mortgage", icon: "🏠" },
  { id: "utilities", label: "Utilities & bills", icon: "💡" },
  { id: "other", label: "Everything else", icon: "🔗" },
];
const catOf = (id) => LINK_CATS.find((c) => c.id === id) || LINK_CATS[LINK_CATS.length - 1];

const withScheme = (url) => (/^https?:\/\//i.test(url) ? url : "https://" + url);
const hostOf = (url) => { try { return new URL(withScheme(url)).hostname.replace(/^www\./, ""); } catch { return url; } };

export function renderLinks(root, navigate) {
  const links = getState().links;
  const sections = LINK_CATS
    .map((c) => ({ ...c, items: links.filter((l) => (l.category || "other") === c.id).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((c) => c.items.length);

  root.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <h3>Statement shortcuts <button class="btn small ghost" id="btn-addlink">+ add link</button></h3>
      <p class="muted">Every account you two log into, in one place. The monthly ritual: tap each one, download last
      month's statement, then import it on the <a href="#/activity">Activity</a> tab — re-imports and overlaps are deduped automatically.</p>
    </div>

    ${sections.length ? `<div class="grid">${sections.map((c) => `
      <div class="card s6">
        <h3>${c.icon} ${c.label} <span class="sub">${c.items.length}</span></h3>
        <div class="list">${c.items.map(linkRow).join("")}</div>
      </div>`).join("")}</div>`
    : `<div class="card"><div class="empty"><div class="big">🔗</div>No links saved yet.<br/>
       <span class="muted">Add your banks, brokerages and insurers once — then statement day is just tap, download, import.</span></div></div>`}
  `;

  root.querySelector("#btn-addlink").addEventListener("click", () => linkModal(null, navigate));
  root.querySelectorAll("[data-open]").forEach((row) =>
    row.addEventListener("click", () => {
      const l = links.find((x) => x.id === row.dataset.open);
      if (l) window.open(withScheme(l.url), "_blank", "noopener");
    }));
  root.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      linkModal(links.find((x) => x.id === b.dataset.edit), navigate);
    }));
}

function linkRow(l) {
  return `<div class="litem" data-open="${l.id}" style="cursor:pointer">
    <div class="ic">${catOf(l.category).icon}</div>
    <div class="mid">
      <div class="t1">${escapeHtml(l.name)}</div>
      <div class="t2">${ownerChip(l.owner)} ${escapeHtml(hostOf(l.url))}${l.notes ? " · " + escapeHtml(l.notes) : ""}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <button class="btn small ghost" data-edit="${l.id}">✎</button>
      <span style="color:var(--faint);font-size:15px">↗</span>
    </div>
  </div>`;
}

function linkModal(existing, navigate) {
  const l = existing || { name: "", url: "", owner: "joint", category: "banking", notes: "" };
  openModal(`
    <h2>${existing ? "Edit link" : "Add a link"}</h2>
    ${field("name", "Name", `placeholder="e.g. Chase Checking"`, "text", l.name)}
    ${field("url", "Web address", `placeholder="chase.com" inputmode="url" autocapitalize="none" autocorrect="off"`, "text", l.url)}
    <div class="row2">
      ${ownerSelect("owner", l.owner)}
      <label class="fld"><span>Category</span><select name="category">
        ${LINK_CATS.map((c) => `<option value="${c.id}" ${c.id === (l.category || "other") ? "selected" : ""}>${c.icon} ${c.label}</option>`).join("")}
      </select></label>
    </div>
    ${field("notes", "Notes", `placeholder="e.g. statement posts on the 3rd"`, "text", l.notes || "")}
    <div class="actions">
      ${existing ? `<button class="btn danger" data-del>Delete</button>` : ""}
      <button class="btn ghost" data-x>Cancel</button>
      <button class="btn" data-save>${existing ? "Save" : "Add"}</button>
    </div>
  `, (m) => {
    m.querySelector("[data-x]").onclick = closeModal;
    m.querySelector("[data-del]")?.addEventListener("click", () => {
      deleteLink(existing.id); closeModal(); toast("Link removed"); navigate(null);
    });
    m.querySelector("[data-save]").onclick = () => {
      const d = formData(m);
      const name = d.name.trim(), url = d.url.trim();
      if (!name || !url) { toast("Name and web address are both needed"); return; }
      try { new URL(withScheme(url)); } catch { toast("That web address doesn't look right"); return; }
      const patch = { name, url, owner: d.owner, category: d.category, notes: d.notes.trim() };
      if (existing) updateLink(existing.id, patch); else addLink(patch);
      closeModal(); toast(existing ? "Saved ✓" : "Link added ✓"); navigate(null);
    };
  });
}
