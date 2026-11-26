import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { PeriodSelector } from '@/components/app/period-selector';
import type { PeriodValue } from '@/components/app/period-utils';
import { baseHandlers, mockApi, renderWithProviders } from '@/test/utils';

function Harness({ initial }: { initial: PeriodValue }) {
  const [value, setValue] = useState<PeriodValue>(initial);
  return (
    <div>
      <PeriodSelector value={value} onChange={setValue} marketId="mkt_1" />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </div>
  );
}

const freshness = {
  today: '2026-11-24',
  timezone: 'America/Bogota',
  latestAvailableDate: '2026-11-21',
  earliestAvailableDate: '2025-07-24',
  firstIncompleteDate: '2026-11-22',
  source: 'gsc_metadata',
};

describe('PeriodSelector', () => {
  // El primer render usa una estimación basada en la fecha real; se espera a la frescura de GSC (mock)
  // para que el resultado no dependa del día en que se ejecutan los tests.
  it('shows the resolved range and its comparison period', async () => {
    mockApi({ ...baseHandlers(), 'GET /api/markets/mkt_1/freshness': { body: freshness } });
    renderWithProviders(<Harness initial={{ preset: 'LAST_28_DAYS' }} />);
    await waitFor(() =>
      expect(screen.getByTestId('period-summary')).toHaveTextContent(
        'Oct 25 – Nov 21, 2026 vs. previous 28 days (Sep 27 – Oct 24, 2026)',
      ),
    );
  });

  it('compares the current month with the same days of the previous month', async () => {
    mockApi({ ...baseHandlers(), 'GET /api/markets/mkt_1/freshness': { body: freshness } });
    renderWithProviders(<Harness initial={{ preset: 'CURRENT_MONTH' }} />);
    await waitFor(() =>
      expect(screen.getByTestId('period-summary')).toHaveTextContent(
        'Nov 1–21, 2026 vs. same days of previous month (Oct 1–21, 2026)',
      ),
    );
  });

  it('opens a date range picker for custom periods', async () => {
    mockApi({ ...baseHandlers(), 'GET /api/markets/mkt_1/freshness': { body: freshness } });
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={{ preset: 'LAST_7_DAYS' }} />);

    await screen.findByText('Nov 15–21, 2026', { exact: false });
    await user.click(screen.getByRole('combobox', { name: 'Period' }));
    await user.click(await screen.findByRole('option', { name: 'Custom range' }));

    // El periodo personalizado parte del rango que estaba seleccionado.
    expect(screen.getByTestId('value')).toHaveTextContent('{"preset":"CUSTOM","startDate":"2026-11-15","endDate":"2026-11-21"}');
    expect(screen.getByTestId('period-summary')).toHaveTextContent('Nov 15–21, 2026 vs. previous 7 days (Nov 8–14, 2026)');

    await user.click(screen.getByRole('button', { name: 'Choose custom dates' }));
    expect(await screen.findByRole('button', { name: 'Apply dates' })).toBeEnabled();
    expect(screen.getByText(/Data available Jul 24, 2025 to Nov 21, 2026/)).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: /November 2026/ })).toBeInTheDocument();
  });
});
