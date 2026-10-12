// src/pwa/registerSW.js
//
// Register /sw.js as the page's service worker. Auto-detects updates and
// triggers a callback when a new version is waiting. Only runs in browsers
// that actually support service workers (i.e. not server-rendered + HTTPS
// or localhost).

export const registerServiceWorker = ({ onUpdateAvailable } = {}) => {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // In development, NEVER register the service worker. It would cache the app
  // shell and keep serving a stale build (e.g. an old basename) and interfere
  // with Vite's HMR websocket. Also tear down any worker + caches a previous
  // run (or a production visit) left behind, so dev always loads fresh.
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations?.().then((regs) =>
      regs.forEach((r) => r.unregister()),
    );
    if (window.caches?.keys) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    }
    return;
  }

  // PWA service workers need either HTTPS or localhost. Skip otherwise.
  const isSecure =
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  if (!isSecure) return;

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      // If a worker is already waiting (page reloaded with a pending update)
      if (reg.waiting && onUpdateAvailable) {
        onUpdateAvailable(reg.waiting);
      }

      // When a new worker installs in the background
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller &&
            onUpdateAvailable
          ) {
            onUpdateAvailable(newWorker);
          }
        });
      });

      // When the active worker changes (e.g. after we tell it to skipWaiting),
      // reload so the new version takes over.
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    } catch (err) {
      console.warn("[PWA] service worker registration failed:", err);
    }
  });
};

export const promoteWaitingWorker = (worker) => {
  if (worker?.postMessage) worker.postMessage("SKIP_WAITING");
};
