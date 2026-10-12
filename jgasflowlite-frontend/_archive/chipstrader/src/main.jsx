import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/overlay';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Lists feel instant on revisit; anything older than 30 s refetches
      // quietly in the background while the cached rows stay on screen.
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (count, err) => count < 2 && ![401, 403, 404].includes(err?.response?.status),
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
