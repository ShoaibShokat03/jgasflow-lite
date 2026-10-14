// src/pwa/PwaPrompts.jsx
//
// Two thin floating UI bits for PWA UX:
//   1. InstallPrompt  small bottom-right toast when the browser fires
//      `beforeinstallprompt`, with an Install button.
//   2. UpdateToast  appears when a new SW is waiting; one click reloads
//      into the new version.
//
// Drop <PwaPrompts /> anywhere inside the React tree (we put it inside
// the router, near the root, in main.jsx).

import React, { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { promoteWaitingWorker, registerServiceWorker } from "./registerSW";

const DISMISSED_KEY = "pwa-install-dismissed-until";

const PwaPrompts = () => {
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  // Register the service worker on mount
  useEffect(() => {
    registerServiceWorker({
      onUpdateAvailable: (worker) => setWaitingWorker(worker),
    });
  }, []);

  // Listen for the install prompt event
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPromptEvent(e);
      // Respect a prior dismissal for 7 days
      const dismissedUntil = Number(localStorage.getItem(DISMISSED_KEY) || 0);
      if (Date.now() > dismissedUntil) setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setShowInstall(false);
      setInstallPromptEvent(null);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPromptEvent) return;
    try {
      installPromptEvent.prompt();
      const { outcome } = await installPromptEvent.userChoice;
      if (outcome === "dismissed") snoozeInstall();
    } catch {
      // ignore
    } finally {
      setShowInstall(false);
      setInstallPromptEvent(null);
    }
  };

  const snoozeInstall = () => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISSED_KEY, String(Date.now() + sevenDays));
    setShowInstall(false);
  };

  const handleApplyUpdate = () => {
    promoteWaitingWorker(waitingWorker);
    // The page reload happens via `controllerchange` in registerSW.js
  };

  return (
    <>
      {/* New version available */}
      {waitingWorker && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-1rem)]">
          <div className="bg-white dark:bg-gray-800 border border-purple-200 dark:border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3 animate-in slide-in-from-top-1">
            <RefreshCw className="w-5 h-5 text-purple-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                A new version is available
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Reload to get the latest features and fixes.
              </p>
            </div>
            <button
              onClick={handleApplyUpdate}
              className="px-3 py-1.5 text-xs font-semibold rounded-md purple-gradient text-white"
            >
              Reload
            </button>
          </div>
        </div>
      )}

      {/* Install prompt */}
      {showInstall && installPromptEvent && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm w-[calc(100%-2rem)]">
          <div className="bg-white dark:bg-gray-800 border border-purple-200 dark:border-gray-700 rounded-lg p-4 animate-in slide-in-from-top-1">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 flex items-center justify-center flex-shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Install JGasFlow Console
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Add the admin panel to your home screen for faster access and
                  offline support.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleInstall}
                    className="px-3 py-1.5 text-xs font-semibold rounded-md purple-gradient text-white"
                  >
                    Install
                  </button>
                  <button
                    onClick={snoozeInstall}
                    className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Not now
                  </button>
                </div>
              </div>
              <button
                onClick={snoozeInstall}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PwaPrompts;
