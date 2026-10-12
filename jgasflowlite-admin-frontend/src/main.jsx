import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.jsx";
import PwaPrompts from "./pwa/PwaPrompts.jsx";
import { ToastProvider } from "./components/common/Toast.jsx";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Prevents refetching when switching tabs
      retry: 1,
      // 30s freshness window: navigating between pages renders instantly
      // from cache with NO background refetch spam. Mutations invalidate
      // their queries explicitly, so data is never stale after an action.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
        {/* PWA install + update prompts. Registers /sw.js on mount. */}
        <PwaPrompts />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
