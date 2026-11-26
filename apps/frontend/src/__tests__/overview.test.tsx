import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { overviewFixture, reportFixture } from '@/test/fixtures';
import { baseHandlers, mockApi, renderApp } from '@/test/utils';

describe('Overview page', () => {
  it('shows a loading skeleton while the overview loads', async () => {
    mockApi({ ...baseHandlers(), 'GET /api/overview': () => new Promise<never>(() => {}) });
    renderApp('/');
    expect(await screen.findByRole('status', { name: 'Loading overview' })).toBeInTheDocument();
  });

  it('shows an error state with a retry action', async () => {
    let attempts = 0;
    mockApi({
      ...baseHandlers(),
      'GET /api/overview': () => {
        attempts += 1;
        return attempts === 1
          ? { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: 'req-123' } } }
          : { body: overviewFixture };
      },
    });
    const user = userEvent.setup();
    renderApp('/');
    expect(await screen.findByText('The overview could not be loaded')).toBeInTheDocument();
    expect(screen.getByText(/request req-123/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Recent reports')).toBeInTheDocument();
  });

  it('renders the generate composer, status strip and recent reports', async () => {
    mockApi({
      ...baseHandlers(),
      'GET /api/overview': {
        body: {
          ...overviewFixture,
          recentReports: [
            reportFixture({ status: 'COMPLETED', stage: 'COMPLETED', downloadUrl: '/api/reports/rep_1/download' }),
          ],
        },
      },
    });
    renderApp('/');
    expect(await screen.findByRole('form', { name: 'Generate report' })).toBeInTheDocument();
    expect(await screen.findByText('Anthropic configured')).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download PDF for Codario Labs' })).toHaveAttribute('href', '/api/reports/rep_1/download');
  });

  it('generates a report from the composer and shows its progress', async () => {
    let payload: unknown = null;
    mockApi({
      ...baseHandlers(),
      'GET /api/markets/mkt_1/freshness': {
        body: {
          today: '2026-11-24',
          timezone: 'America/Bogota',
          latestAvailableDate: '2026-11-21',
          earliestAvailableDate: '2025-07-24',
          firstIncompleteDate: null,
          source: 'gsc_metadata',
        },
      },
      'POST /api/reports': ({ body }) => {
        payload = body;
        return { status: 202, body: { report: reportFixture({ status: 'QUEUED', stage: 'QUEUED', stageTimings: {} }), deduplicated: false } };
      },
      'GET /api/reports/rep_1/status': { body: reportFixture() },
    });
    const user = userEvent.setup();
    renderApp('/');
    const form = await screen.findByRole('form', { name: 'Generate report' });
    await screen.findByText('Oct 25 – Nov 21, 2026', { exact: false });
    await user.click(form.querySelector('button[type="submit"]') as HTMLButtonElement);

    expect(await screen.findByRole('heading', { name: 'Generating report' })).toBeInTheDocument();
    expect(payload).toMatchObject({ marketId: 'mkt_1', periodPreset: 'LAST_28_DAYS', includeAi: true, templateId: null });
    expect(await screen.findByText('Comparing periods…')).toBeInTheDocument();
  });
});
