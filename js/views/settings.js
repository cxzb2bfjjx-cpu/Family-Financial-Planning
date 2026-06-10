// ---------- Tandem · settings & onboarding ----------

import { getState, setSettings, exportJSON, importJSON, wipeAll, setOnboarded } from "../store.js";
import { escapeHtml, downloadFile, todayISO } from "../util.js";
import { loadDemo } from "../demo.js";
import { openModal, closeModal, formData, field, toast } from "../ui.js";

export function renderSettings(root, navigate) {
  const state = getState();
  const s = state.settings;

  root.innerHTML = `
    ${state.demo ? `<div class="banner">🧪 You're exploring with demo data. <button class="btn small" id="btn-fresh">Start fresh with real data</button></div>` : ""}

    <div class="grid">
      <div class="card s6">
        <h3>Household</h3>
        ${field("p1Name", "Partner 1 name", "", "text", s.p1Name)}
        ${field("p2Name", "Partner 2 name", "", "text", s.p2Name)}
        ${field("householdName", "Household nickname", "", "text", s.householdName)}
        <div class="row2">
          ${field("bigExpenseThreshold", "Flag expenses over", `inputmode="numeric"`, "text", s.bigExpenseThreshold)}
          <label class="fld"><span>Currency</span><select name="currency">
            ${["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NZD", "MXN", "INR"].map((c) => `<option ${c === s.currency ? "selected" : ""}>${c}</option>`).join("")}
          </select></label>
        </div>
        <button class="btn" id="btn-save">Save</button>
      </div>

      <div class="card s6">
        <h3>Live market data <span class="sub">optional · free</span></h3>
        <p class="muted" style="margin-bottom:10px">
          Two providers offer free personal API keys (no card required):<br/>
          · <a href="https://finnhub.io/register" target="_blank" rel="noopener">finnhub.io</a> — generous limits, updates every visit<br/>
          · <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener">alphavantage.co</a> — 25 requests/day<br/>
          The key is stored only on this device and is sent only to that provider.
        </p>
        <label class="fld"><span>Provider</span><select name="marketProvider">
          <option value="demo" ${s.marketProvider === "demo" ? "selected" : ""}>Demo data (no key)</option>
          <option value="finnhub" ${s.marketProvider === "finnhub" ? "selected" : ""}>Finnhub</option>
          <option value="alphavantage" ${s.marketProvider === "alphavantage" ? "selected" : ""}>Alpha Vantage</option>
        </select></label>
        ${field("marketApiKey", "API key", `placeholder="paste key"`, "text", s.marketApiKey)}
        <button class="btn" id="btn-market">Save & test</button>
      </div>

      <div class="card s6">
        <h3>Backup & couple-sync</h3>
        <p class="muted" style="margin-bottom:10px">
          Data lives only in this browser. Export a file as backup — or to sync: each of you exports on your own phone,
          then imports the other's file with <b>Merge</b>. Duplicates are handled automatically.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="btn-export">⬇ Export backup</button>
          <button class="btn ghost" id="btn-import-merge">⬆ Import & merge</button>
          <button class="btn ghost" id="btn-import-replace">⬆ Import & replace</button>
        </div>
        <input type="file" id="file-import" accept=".json,application/json" style="display:none"/>
      </div>

      <div class="card s6">
        <h3>Danger zone</h3>
        <p class="muted" style="margin-bottom:10px">${state.demo ? "Clear the demo and start with a blank slate." : "Wipe everything from this device. Export a backup first!"}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${!state.demo ? `<button class="btn ghost" id="btn-demo">Load demo data</button>` : ""}
          <button class="btn danger" id="btn-wipe">Erase all data</button>
        </div>
      </div>

      <div class="card s12" style="grid-column: span 12">
        <h3>About Tandem</h3>
        <p class="muted">
          🔒 <b>Private by design</b> — no servers, no accounts, no bank logins, no analytics. Everything stays in your browser's storage.
          📱 <b>Install it</b>: on iPhone, Share → "Add to Home Screen"; on Android, menu → "Install app". It then opens full-screen like a native app, works offline, and keeps your data.
          📅 The whole system runs on a 10-minute weekly ritual: import or add the week's transactions, and once a month update account balances. The charts do the rest.
        </p>
      </div>
    </div>`;

  const grab = () => formData(root);

  root.querySelector("#btn-save").addEventListener("click", () => {
    const d = grab();
    setSettings({
      p1Name: d.p1Name || "Partner 1", p2Name: d.p2Name || "Partner 2",
      householdName: d.householdName || "Our household",
      bigExpenseThreshold: Math.max(1, parseFloat(d.bigExpenseThreshold) || 300),
      currency: d.currency,
    });
    toast("Saved ✓"); navigate(null);
  });

  root.querySelector("#btn-market").addEventListener("click", async () => {
    const d = grab();
    setSettings({ marketProvider: d.marketProvider, marketApiKey: d.marketApiKey.trim() });
    localStorage.removeItem("tandem.quotes.v1");
    toast("Saved — testing…");
    const { getQuotes } = await import("../market.js");
    const res = await getQuotes(true);
    toast(res.error ? `⚠️ ${res.error}` : res.provider === "demo" ? "Demo mode active" : `🟢 Live quotes working via ${res.provider}!`);
  });

  root.querySelector("#btn-export").addEventListener("click", () => {
    downloadFile(`tandem-backup-${todayISO()}.json`, exportJSON());
    toast("Backup downloaded ✓");
  });

  const fileInput = root.querySelector("#file-import");
  let importMode = "merge";
  root.querySelector("#btn-import-merge").addEventListener("click", () => { importMode = "merge"; fileInput.click(); });
  root.querySelector("#btn-import-replace").addEventListener("click", () => { importMode = "replace"; fileInput.click(); });
  fileInput.addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      importJSON(await f.text(), importMode);
      toast(importMode === "merge" ? "Merged ✓ — you're in sync" : "Restored ✓");
      navigate("dash/all");
    } catch (err) { toast("Import failed: " + err.message); }
  });

  root.querySelector("#btn-demo")?.addEventListener("click", () => {
    loadDemo(s.p1Name === "Partner 1" ? "Alex" : s.p1Name, s.p2Name === "Partner 2" ? "Sam" : s.p2Name);
    toast("Demo household loaded 🧪");
    navigate("dash/all");
  });
  root.querySelector("#btn-fresh")?.addEventListener("click", () => confirmWipe(navigate, true));
  root.querySelector("#btn-wipe").addEventListener("click", () => confirmWipe(navigate, false));
}

function confirmWipe(navigate, keepNames) {
  const s = getState().settings;
  openModal(`
    <h2>Erase everything?</h2>
    <p class="muted" style="margin-bottom:14px">This clears all data from this device. ${getState().demo ? "" : "If any of it is real, export a backup first."}</p>
    <div class="actions"><button class="btn ghost" data-x>Keep my data</button><button class="btn danger" data-go>Yes, erase</button></div>
  `, (m) => {
    m.querySelector("[data-x]").onclick = closeModal;
    m.querySelector("[data-go]").onclick = () => {
      const names = keepNames ? { p1Name: s.p1Name, p2Name: s.p2Name } : null;
      wipeAll();
      if (names) setSettings(names);
      setOnboarded(true);
      closeModal(); toast("Clean slate ✓"); navigate("dash/all");
    };
  });
}

// ---------- first-run onboarding ----------
export function onboarding(navigate) {
  openModal(`
    <div style="text-align:center;margin-bottom:14px">
      <div style="font-size:40px">🚲</div>
      <h2 style="margin-bottom:4px">Welcome to Tandem</h2>
      <p class="muted">Two riders, one bike. A private finance app for the both of you —<br/>no bank logins, no subscriptions, no servers. Your data never leaves this device.</p>
    </div>
    <div class="row2">
      ${field("p1", "Your name", `placeholder="Alex"`)}
      ${field("p2", "Your partner's name", `placeholder="Sam"`)}
    </div>
    ${field("threshold", "Flag any expense over…", `inputmode="numeric" placeholder="300"`, "text", "300")}
    <div class="actions" style="flex-direction:column">
      <button class="btn" data-demo>🧪 Show me around with demo data</button>
      <button class="btn ghost" data-fresh>Start fresh — we'll add our own</button>
    </div>
  `, (m) => {
    const begin = (demo) => {
      const d = formData(m);
      const p1 = d.p1.trim() || "Partner 1", p2 = d.p2.trim() || "Partner 2";
      if (demo) loadDemo(d.p1.trim() || "Alex", d.p2.trim() || "Sam");
      else setSettings({ p1Name: p1, p2Name: p2, bigExpenseThreshold: Math.max(1, parseFloat(d.threshold) || 300) });
      setOnboarded(true);
      closeModal();
      navigate("dash/all");
    };
    m.querySelector("[data-demo]").onclick = () => begin(true);
    m.querySelector("[data-fresh]").onclick = () => begin(false);
  });
}
