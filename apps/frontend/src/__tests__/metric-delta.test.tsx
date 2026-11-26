import { computeDelta } from '@codario/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChangeCell, MetricDelta } from '@/components/app/metric-delta';

describe('MetricDelta', () => {
  it('treats a lower average position as an improvement', () => {
    render(<MetricDelta delta={computeDelta('position', 8.2, 11.4)} />);
    const el = screen.getByText('−3.2');
    expect(el).toHaveAttribute('data-sentiment', 'positive');
    expect(el).toHaveClass('text-success');
  });

  it('treats fewer clicks as a decline', () => {
    render(<MetricDelta delta={computeDelta('clicks', 80, 100)} />);
    const el = screen.getByText('−20.0%');
    expect(el).toHaveAttribute('data-sentiment', 'negative');
    expect(el).toHaveClass('text-danger');
  });

  it('shows CTR changes in percentage points', () => {
    render(<MetricDelta delta={computeDelta('ctr', 0.045, 0.04)} />);
    expect(screen.getByText('+0.50 pp')).toHaveAttribute('data-sentiment', 'positive');
  });

  it('is neutral without comparison data', () => {
    render(<MetricDelta delta={computeDelta('impressions', 1000, null)} />);
    expect(screen.getByText('No comparison')).toHaveAttribute('data-sentiment', 'neutral');
  });

  it('colors table changes by sentiment', () => {
    render(
      <div>
        <ChangeCell metric="position" value={2.5} />
        <ChangeCell metric="clicks" value={12} />
      </div>,
    );
    expect(screen.getByText('+2.5')).toHaveAttribute('data-sentiment', 'negative');
    expect(screen.getByText('+12')).toHaveAttribute('data-sentiment', 'positive');
  });
});
