# 🚲 Tandem — Family Finance

*Two riders, one bike.* A private financial planning app for you and your spouse.
No bank logins, no aggregator fees, no servers, no accounts — **your data never leaves your device.**

Built as a static PWA: free to host on GitHub Pages, installs to your phone's home
screen like a native app, and works offline.

---

## ✨ What's inside

| Tab | What it does |
|---|---|
| 🏠 **Home** | Three dashboards — **Ours**, and one for each of you. Net-worth trajectory with projection, cash-flow bars, category donut, a **money-river Sankey**, daily spending heatmap, his-vs-hers spending radar, savings-rate gauge, goals, and plain-English insights about your money. |
| 🧾 **Activity** | Add transactions in seconds or **import your bank's free CSV export**. Auto-categorization, search & filters, and a 🚩 **flag queue** for any expense above your chosen threshold. |
| 🔁 **Subs** | Subscriptions **detected automatically** from recurring charges. Renewal calendar, monthly/annual cost, **price-hike detector**, lapsed-sub tracker, and a "subscription creep" trend line. |
| 📈 **Market** | Live index quotes (free API key) or labeled demo data, a rule-based **insight engine that explains *why* the market is moving**, the S&P 500 long view with a trend cone — and **your 401(k)'s personal rate of return (Modified Dietz) plotted against the S&P 500**, contributions stripped out. |
| 🔮 **Future** | 12-month cash-flow forecast with confidence bands, **10-year Monte Carlo net-worth fan chart** (400 simulated futures), and a retirement projector with live what-if sliders (retire year, contribution, return, volatility) plus a 4%-rule income estimate. |

**Privacy model:** everything is stored in your browser's local storage. The only
network calls the app ever makes are to the market-data provider *you* configure
(optional), using *your* free key.

## 🚀 Get it on your phones (free, ~5 minutes)

1. **Enable GitHub Pages**: repo → *Settings* → *Pages* → under "Build and deployment"
   choose **GitHub Actions**. Merge this code to `main` (or run the *Deploy to GitHub
   Pages* workflow manually). Your app appears at
   `https://<username>.github.io/Family-Financial-Planning/`.
2. **Install it**:
   - **iPhone**: open the URL in Safari → Share → **Add to Home Screen**.
   - **Android**: open in Chrome → menu → **Install app**.
3. It now launches full-screen, works offline, and keeps data on the device.

> Tip: if the repo is public, the *site* is public too — but it contains **zero** of
> your data (that lives only on your phones). Strangers just see an empty app.

## 👫 Using it as a couple

Each of you uses it on your own phone. To combine the books:

1. ⚙️ Settings → **Export backup** (each phone)
2. Send the file to each other (AirDrop, email, whatever)
3. ⚙️ Settings → **Import & merge** — duplicates are de-duped automatically

Do it whenever you want the combined dashboard fully up to date. Or keep it simple:
run everything on one phone and use the per-person dashboards.

## 🗓️ The 10-minute ritual

- **Weekly**: import each bank/card CSV (or add the week's spending by hand).
- **Monthly** (statement day): Dashboard → **Update balances** — enter each account's
  balance, and for 401(k)/investment accounts also what you contributed.
  That contribution number is what powers the honest *you-vs-market* comparison.

## 📊 Live market data (optional, free)

Without any setup the Market tab shows clearly-labeled demo data. For live quotes,
grab a free key (no credit card) from **[finnhub.io](https://finnhub.io/register)**
or **[alphavantage.co](https://www.alphavantage.co/support/#api-key)** and paste it
in ⚙️ Settings. The key is stored only on your device. The bundled S&P 500 history
(for the 401(k) benchmark) is approximate and extends itself from live quotes over time.

## 🛠️ Development

No build step, no dependencies — vanilla ES modules + [ECharts](https://echarts.apache.org/) (vendored).

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

```
index.html            app shell
css/app.css           dark glassmorphism theme
js/
  app.js              router + shell
  store.js            state, localStorage, export/import/merge
  finance.js          analytics: trends, sub detection, Dietz returns, Monte Carlo
  market.js           quotes (Finnhub/Alpha Vantage/demo), S&P benchmark, insights
  charts.js           ECharts factory (sankey, fan charts, heatmap, radar…)
  demo.js             deterministic 18-month demo household
  views/              one module per tab
sw.js                 offline cache
tools/make_icons.py   regenerates the app icons (pure stdlib)
```

## ⚠️ Honest fine print

Forecasts are statistical sketches, not advice. The Monte Carlo and trend cones assume
the future rhymes with the past, which it does until it doesn't. The bundled S&P data
is approximate (±1%) — perfect for "is my 401(k) keeping up?", wrong for day trading.
