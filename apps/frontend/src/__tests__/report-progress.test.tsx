import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ReportProgress } from '@/features/reports/report-progress';
import { reportFixture } from '@/test/fixtures';
import type { ReportDTO } from '@codario/shared';

function renderProgress(report: ReportDTO, handlers: { onCancel?: () => void; onRetry?: () => void } = {}) {
  const router = createMemoryRouter([{ path: '*', element: <ReportProgress report={report} {...handlers} /> }]);
  return render(<RouterProvider router={router} />);
}

function stateOf(stage: string) {
  return document.querySelector(`[data-stage="${stage}"]`)?.getAttribute('data-state');
}

describe('ReportProgress', () => {
  it('renders the real stage states of a running report', () => {
    const onCancel = vi.fn();
    renderProgress(reportFixture(), { onCancel });

    expect(screen.getByText('Comparing periods…')).toBeInTheDocument();
    expect(stateOf('FETCHING_DATA')).toBe('done');
    expect(stateOf('PROCESSING_METRICS')).toBe('done');
    expect(stateOf('COMPARING_PERIODS')).toBe('active');
    expect(stateOf('GENERATING_INSIGHTS')).toBe('pending');
    expect(stateOf('RENDERING_PDF')).toBe('pending');
    expect(screen.getByText('4.2 s')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel generation' })).toBeInTheDocument();
  });

  it('skips the AI stage when AI analysis was not requested', () => {
    renderProgress(reportFixture({ includeAi: false, stage: 'RENDERING_PDF' }));
    expect(document.querySelector('[data-stage="GENERATING_INSIGHTS"]')).toBeNull();
    expect(stateOf('RENDERING_PDF')).toBe('active');
  });

  it('offers the PDF download when the report is completed', () => {
    renderProgress(
      reportFixture({
        status: 'COMPLETED',
        stage: 'COMPLETED',
        downloadUrl: '/api/reports/rep_1/download',
        fileName: 'codario-labs-seo-report.pdf',
        fileSize: 482_000,
        completedAt: '2026-11-24T10:01:31.000Z',
      }),
    );
    expect(screen.getByText('Report completed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('href', '/api/reports/rep_1/download');
    expect(screen.getByRole('link', { name: 'View report' })).toHaveAttribute('href', '/reports/rep_1');
    expect(screen.getByText('Took 1 min 30 s')).toBeInTheDocument();
  });

  it('shows the error and lets the user retry a failed report', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderProgress(
      reportFixture({
        status: 'FAILED',
        stage: 'GENERATING_INSIGHTS',
        stageTimings: { FETCHING_DATA: 4000, PROCESSING_METRICS: 300, COMPARING_PERIODS: 120 },
        errorCode: 'AI_ANALYSIS_FAILED',
        errorMessage: 'The AI analysis could not be generated.',
      }),
      { onRetry },
    );
    expect(screen.getByText('Generation failed')).toBeInTheDocument();
    expect(screen.getByText('The AI analysis could not be generated.')).toBeInTheDocument();
    expect(stateOf('COMPARING_PERIODS')).toBe('done');
    expect(stateOf('GENERATING_INSIGHTS')).toBe('failed');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
