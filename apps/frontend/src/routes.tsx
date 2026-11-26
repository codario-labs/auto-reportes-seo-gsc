import type { RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { Spinner } from '@/components/ui/misc';
import { IntegrationsPage } from '@/features/integrations/integrations-page';
import { MarketFormPage } from '@/features/markets/market-form-page';
import { MarketsPage } from '@/features/markets/markets-page';
import { NotFoundPage } from '@/features/not-found-page';
import { OverviewPage } from '@/features/overview/overview-page';
import { ReportsPage } from '@/features/reports/reports-page';
import { SettingsPage } from '@/features/settings/settings-page';
import { TemplatesPage } from '@/features/templates/templates-page';

const loadTemplateEditor = () =>
  import('@/features/templates/template-editor-page').then((m) => ({ Component: m.TemplateEditorPage }));

/** Rutas de la app. Las páginas con gráficos o el editor se cargan bajo demanda. */
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    hydrateFallbackElement: (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading page">
        <Spinner className="size-5" />
      </div>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'markets', element: <MarketsPage /> },
      { path: 'markets/new', element: <MarketFormPage /> },
      {
        path: 'markets/:id',
        lazy: () => import('@/features/markets/market-detail-page').then((m) => ({ Component: m.MarketDetailPage })),
      },
      { path: 'markets/:id/edit', element: <MarketFormPage /> },
      { path: 'reports', element: <ReportsPage /> },
      {
        path: 'reports/:id',
        lazy: () => import('@/features/reports/report-detail-page').then((m) => ({ Component: m.ReportDetailPage })),
      },
      { path: 'templates', element: <TemplatesPage /> },
      { path: 'templates/new', lazy: loadTemplateEditor },
      { path: 'templates/:id', lazy: loadTemplateEditor },
      { path: 'integrations', element: <IntegrationsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
