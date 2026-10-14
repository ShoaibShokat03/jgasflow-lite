/*  JGasFlow Console service worker
 *
 *  Strategy:
 *    - App shell (HTML / JS / CSS / images / fonts) → cache-first.
 *      Updates land in the background; next refresh picks them up.
 *    - API calls (`/api/...`) → network-first with a short timeout.
 *      Offline or backend-down falls back to the last cached response so
 *      the UI keeps something on screen instead of crashing.
 *    - HTML navigations → network-first, fall back to cached `/index.html`
 *      so the SPA still boots offline.
 *
 *  Bump CACHE_VERSION when you change this file so old workers retire.
 */

const CACHE_VERSION = "jgasflow-console-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const API_CACHE = `${CACHE_VERSION}-api`;

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon.svg",
];

// ── Dev kill-switch ──────────────────────────────────────────────────────
// On localhost we never want a caching SW (it serves stale builds and breaks
// HMR). If this worker is running on localhost, it self-destructs: clears all
// caches, unregisters itself, and passes every request straight to the network.
const IS_DEV =
  self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

if (IS_DEV) {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: "window" });
        clients.forEach((c) => c.navigate(c.url));
      })(),
    );
  });
  // No fetch handler → requests go to the network normally.
}

// ── Install: pre-cache the app shell ─────────────────────────────────────
self.addEventListener("install", (event) => {
  if (IS_DEV) return; // dev handler above already took over
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

// ── Activate: drop old caches ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  if (IS_DEV) return;
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// ── Fetch handler ────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  if (IS_DEV) return; // passthrough to network on localhost
  const req = event.request;

  // Only handle GET requests
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // API: network-first, cached fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstWithTimeout(req, API_CACHE, 4000));
    return;
  }

  // Navigations: network-first, fall back to /index.html shell
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached = await cache.match("/index.html");
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(cacheFirst(req, RUNTIME_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  } catch (err) {
    return Response.error();
  }
}

async function networkFirstWithTimeout(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

// ── Allow the page to ask the worker to skip waiting after an update ─────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
