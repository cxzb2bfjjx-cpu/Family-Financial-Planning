// ---------- Tandem · modal & form helpers ----------

import { $, escapeHtml } from "./util.js";
import { CATEGORIES } from "./categorize.js";
import { getState } from "./store.js";

export function openModal(html, onMount) {
  closeModal();
  const wrap = document.createElement("div");
  wrap.className = "modal-wrap";
  wrap.innerHTML = `<div class="modal">${html}</div>`;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
  document.body.style.overflow = "hidden";
  if (onMount) onMount(wrap.firstElementChild);
  return wrap;
}
export function closeModal() {
  const m = $(".modal-wrap");
  if (m) m.remove();
  document.body.style.overflow = "";
}

export const field = (name, label, attrs = "", type = "text", value = "") =>
  `<label class="fld"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attrs}/></label>`;

export function ownerSelect(name, value = "joint", { withAll = false } = {}) {
  const s = getState().settings;
  const opts = [
    ...(withAll ? [["all", "Everyone"]] : []),
    ["p1", s.p1Name], ["p2", s.p2Name], ["joint", "Joint"],
  ];
  return `<label class="fld"><span>Whose?</span><select name="${name}">${opts
    .map(([v, l]) => `<option value="${v}" ${v === value ? "selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select></label>`;
}

export function categorySelect(name, value = "other") {
  return `<label class="fld"><span>Category</span><select name="${name}">${CATEGORIES
    .map((c) => `<option value="${c.id}" ${c.id === value ? "selected" : ""}>${c.icon} ${c.label}</option>`).join("")}</select></label>`;
}

export function formData(formEl) {
  const out = {};
  for (const el of formEl.querySelectorAll("input,select,textarea")) {
    if (!el.name) continue;
    out[el.name] = el.type === "checkbox" ? el.checked : el.value;
  }
  return out;
}

export function ownerName(owner) {
  const s = getState().settings;
  return owner === "p1" ? s.p1Name : owner === "p2" ? s.p2Name : "Joint";
}
export const ownerChip = (owner) => `<span class="chip ${owner}">${escapeHtml(ownerName(owner))}</span>`;

export function toast(msg) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.style.cssText = `position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--nav-h) + var(--sab) + 16px);z-index:200;background:rgba(14,21,37,0.95);border:1px solid var(--border-strong);color:var(--text);padding:11px 18px;border-radius:13px;font-size:13px;font-weight:600;backdrop-filter:blur(10px);transition:opacity .3s;max-width:88vw;text-align:center;`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.style.opacity = "0"; }, 2600);
}
