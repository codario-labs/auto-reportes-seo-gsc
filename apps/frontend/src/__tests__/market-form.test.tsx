import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { marketFixture } from '@/test/fixtures';
import { baseHandlers, mockApi, renderApp } from '@/test/utils';

describe('market form', () => {
  it('shows validation errors for an invalid domain and color', async () => {
    const fetchMock = mockApi(baseHandlers());
    const user = userEvent.setup();
    renderApp('/markets/new');

    await user.type(await screen.findByLabelText('Name'), 'Tienda Colombia');
    await user.type(screen.getByLabelText('Domain'), 'not a domain');
    const primary = screen.getByLabelText('Primary color', { selector: 'input' });
    await user.clear(primary);
    await user.type(primary, '#12');
    await user.click(screen.getByRole('button', { name: 'Create market' }));

    expect(await screen.findByText('Enter a valid domain, e.g. example.com')).toBeInTheDocument();
    expect(screen.getByText('Use a hex color like #1F2937')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('submits a normalized payload and opens the new market', async () => {
    let payload: unknown = null;
    mockApi({
      ...baseHandlers(),
      'POST /api/markets': ({ body }) => {
        payload = body;
        return { status: 201, body: { ...marketFixture, id: 'mkt_new', name: 'Tienda Colombia', domain: 'tienda.com.co' } };
      },
      'GET /api/markets/mkt_new': { body: { ...marketFixture, id: 'mkt_new', name: 'Tienda Colombia', domain: 'tienda.com.co' } },
      'GET /api/markets/mkt_new/performance': { status: 412, body: { error: { code: 'GOOGLE_NOT_CONNECTED', message: 'Connect Google first.' } } },
      'GET /api/markets/mkt_new/freshness': { status: 412, body: { error: { code: 'GOOGLE_NOT_CONNECTED', message: 'Connect Google first.' } } },
    });
    const user = userEvent.setup();
    renderApp('/markets/new');

    await user.type(await screen.findByLabelText('Name'), 'Tienda Colombia');
    await user.type(screen.getByLabelText('Domain'), 'https://Tienda.com.co/inicio');
    await user.type(screen.getByLabelText('Search Console property'), 'sc-domain:tienda.com.co');
    const primary = screen.getByLabelText('Primary color', { selector: 'input' });
    await user.clear(primary);
    await user.type(primary, '0f766e');
    await user.click(screen.getByRole('button', { name: 'Create market' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Tienda Colombia' })).toBeInTheDocument();
    expect(payload).toMatchObject({
      name: 'Tienda Colombia',
      domain: 'tienda.com.co',
      primaryColor: '#0F766E',
      secondaryColor: '#0EA5A4',
      status: 'ACTIVE',
      gscSiteUrl: 'sc-domain:tienda.com.co',
      templateId: null,
      description: null,
    });
    expect(await screen.findByText('Google Search Console is not connected')).toBeInTheDocument();
  });
});
