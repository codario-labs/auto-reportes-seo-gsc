import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { RouterProvider, type createBrowserRouter } from 'react-router';
import { Toaster } from 'sonner';
import { AccessGate } from '@/components/layout/access-gate';
import { TooltipProvider } from '@/components/ui/misc';

export function AppProviders({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250}>
        <AccessGate>{children}</AccessGate>
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: 'rounded-panel border border-line bg-surface text-ink shadow-overlay font-sans text-sm',
              description: 'text-ink-2',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export function App({ queryClient, router }: { queryClient: QueryClient; router: ReturnType<typeof createBrowserRouter> }) {
  return (
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
