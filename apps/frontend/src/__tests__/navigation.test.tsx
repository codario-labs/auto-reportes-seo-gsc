import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, renderApp } from '@/test/utils';

describe('app navigation', () => {
  it('navigates between every section from the sidebar', async () => {
    mockApi(baseHandlers());
    const user = userEvent.setup();
    renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });

    const pages: [string, string][] = [
      ['Markets', 'Markets'],
      ['Reports', 'Reports'],
      ['Templates', 'Templates'],
      ['Integrations', 'Integrations'],
      ['Settings', 'Settings'],
      ['Overview', 'Overview'],
    ];
    for (const [link, heading] of pages) {
      await user.click(within(nav).getByRole('link', { name: link }));
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
      expect(within(nav).getByRole('link', { name: link })).toHaveAttribute('aria-current', 'page');
    }
  });

  it('shows a not found page for unknown routes', async () => {
    mockApi(baseHandlers());
    renderApp('/does-not-exist');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });

  it('lists markets with their Search Console property', async () => {
    mockApi(baseHandlers());
    renderApp('/markets');
    expect(await screen.findByRole('link', { name: 'Codario Labs' })).toBeInTheDocument();
    expect(screen.getByText('codariolabs.com', { selector: 'span.text-ink-2' })).toBeInTheDocument();
    expect(screen.getByText('Domain')).toBeInTheDocument();
  });
});
