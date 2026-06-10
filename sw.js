// ---------- Tandem · service worker (offline-first app shell) ----------

const CACHE = "tandem-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./vendor/echarts.min.js",
  "./js/app.js",
  "./js/util.js",
  "./js/store.js",
  "./js/demo.js",
  "./js/categorize.js",
  "./js/finance.js",
  "./js/market.js",
  "./js/charts.js",
  "./js/ui.js",
  "./js/views/dashboard.js",
  "./js/views/activity.js",
  "./js/views/subs.js",
  "./js/views/marketview.js",
  "./js/views/future.js",
  "./js/views/settings.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // never cache market API calls — live data or nothing
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok && e.request.method === "GET") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
