/**
 * service-worker.js
 * ------------------
 * Cache-first offline support for the app shell. Bump CACHE_VERSION any
 * time a precached file's *content* changes — this triggers `activate`
 * to drop the old cache and `fetch` to start serving fresh copies.
 *
 * Strategy:
 *  - Same-origin app-shell files: cache-first, falling back to network
 *    (and re-populating the cache) if a file is missing from it.
 *  - Everything else (e.g. the free-tier AI calls to js.puter.com in a
 *    later phase): network-only — the service worker doesn't intercept
 *    cross-origin API/CDN calls at all, so they behave normally online
 *    and simply fail offline like any other network request would.
 */

const CACHE_VERSION = "hub-shell-v2";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/tokens.css",
  "./css/base.css",
  "./css/components.css",
  "./css/effects.css",
  "./js/app.js",
  "./js/db.js",
  "./js/router.js",
  "./js/storage.js",
  "./js/theme.js",
  "./js/components/commandPalette.js",
  "./js/components/modal.js",
  "./js/components/search.js",
  "./js/components/sidebar.js",
  "./js/components/toast.js",
  "./js/effects/effects.js",
  "./js/modules/dashboard/dashboard.js",
  "./js/modules/settings/settings.js",
  "./js/modules/settings/settingsData.js",
  "./js/utils/crypto.js",
  "./js/utils/export.js",
  "./js/utils/helpers.js",
  "./js/utils/keyboard.js",
  "./js/utils/markdown.js",
  "./icons/favicon-32.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  // PDF Toolkit (embedded, see js/modules/pdftoolkit/pdftoolkit.js). Note:
  // this only precaches the tool's own shell — its several CDN libraries
  // (jsPDF, pdf-lib, pdf.js, Tesseract.js, ...) are cross-origin and load
  // fresh over the network each time, so PDF Toolkit itself still needs
  // an internet connection even though the rest of the Hub works offline.
  "./tools/pdf-toolkit/index.html",
  "./tools/pdf-toolkit/app.js",
  "./tools/pdf-toolkit/styles.css",
  "./tools/pdf-toolkit/qr.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // addAll fails the whole install if even one file 404s — precaching
      // is best-effort per file instead, so one missing/renamed asset in
      // a future phase can't break offline support for everything else.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn(`[service-worker] Could not precache ${url}:`, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET requests — everything else (cross-origin
  // AI/API calls, POST requests, etc.) passes straight through untouched.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline and not cached — for navigations, fall back to the
          // shell itself so hash-based routing still loads the app.
          if (request.mode === "navigate") return caches.match("./index.html");
          return new Response("", { status: 504, statusText: "Offline and not cached" });
        });
    })
  );
});
