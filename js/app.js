// ---------- Tandem · shell & router ----------

import { getState, subscribe } from "./store.js";
import { escapeHtml } from "./util.js";
import { unreviewedFlags } from "./finance.js";
import { disposeAll } from "./charts.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderActivity, setActivityFilters, txModal } from "./views/activity.js";
import { renderSubs } from "./views/subs.js";
import { renderMarket } from "./views/marketview.js";
import { renderFuture } from "./views/future.js";
import { renderSettings, onboarding } from "./views/settings.js";

const app = document.getElementById("app");

const TABS = [
  { id: "dash", label: "Home", ico: "🏠" },
  { id: "activity", label: "Activity", ico: "🧾" },
  { id: "subs", label: "Subs", ico: "🔁" },
  { id: "market", label: "Market", ico: "📈" },
  { id: "future", label: "Future", ico: "🔮" },
];

let current = "dash/all";

function navigate(route) {
  if (route) {
    current = route;
    location.hash = "#/" + route.split("?")[0];
  }
  render();
}
window.addEventListener("hashchange", () => {
  const r = location.hash.replace(/^#\//, "");
  if (r && r !== current.split("?")[0]) { current = r; render(); }
});

function render() {
  const state = getState();
  const [path, query] = current.split("?");
  const [tab, seg] = path.split("/");
  if (query && tab === "activity") {
    const p = new URLSearchParams(query);
    setActivityFilters({ cat: p.get("cat") || "all", owner: p.get("owner") === "all" ? "all" : p.get("owner") || "all", q: "", month: "all" });
  }
  const flags = unreviewedFlags(state.transactions, state.settings.bigExpenseThreshold).length;

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <img class="logo" src="assets/icons/icon-192.png" alt=""/>
        <div><h1>Tandem</h1><small>${escapeHtml(state.settings.householdName)}</small></div>
      </div>
      <button class="iconbtn" id="btn-settings" title="Settings">⚙️</button>
    </header>
    <main id="view"></main>
    <nav class="tabs">
      ${TABS.map((t) => `
        <button data-tab="${t.id}" class="${tab === t.id ? "active" : ""}">
          <span class="ico">${t.ico}</span>${t.label}
          ${t.id === "activity" && flags ? `<span class="dot">${flags}</span>` : ""}
        </button>`).join("")}
    </nav>
    ${tab === "dash" || tab === "activity" ? `<button class="fab" id="fab" title="Add transaction">＋</button>` : ""}
  `;

  app.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => navigate(b.dataset.tab === "dash" ? "dash/all" : b.dataset.tab)));
  app.querySelector("#btn-settings").addEventListener("click", () => navigate("settings"));
  app.querySelector("#fab")?.addEventListener("click", () => txModal(null, navigate));

  const view = app.querySelector("#view");
  const re = (r) => navigate(r || current);
  if (tab === "dash") renderDashboard(view, ["p1", "p2"].includes(seg) ? seg : "all", re);
  else if (tab === "activity") renderActivity(view, re);
  else if (tab === "subs") renderSubs(view, re);
  else if (tab === "market") renderMarket(view, re);
  else if (tab === "future") renderFuture(view, re);
  else if (tab === "settings") renderSettings(view, re);
  else renderDashboard(view, "all", re);

  requestAnimationFrame(disposeAll);
}

// first run
const boot = () => {
  const r = location.hash.replace(/^#\//, "");
  if (r) current = r;
  render();
  if (!getState().onboarded) onboarding(navigate);
};
boot();

// offline support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
