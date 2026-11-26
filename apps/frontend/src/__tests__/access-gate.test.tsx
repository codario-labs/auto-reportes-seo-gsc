import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, renderApp } from '@/test/utils';

describe('AccessGate', () => {
  it('asks for the access key when the workspace is locked, then unlocks it', async () => {
    let unlocked = false;
    const fetchMock = mockApi({
      ...baseHandlers(),
      'GET /api/access/status': () => ({ body: { unlocked, expiresAt: null } }),
      'POST /api/access/unlock': ({ body }) => {
        if ((body as { accessKey: string }).accessKey !== 'correct-key') {
          return { status: 401, body: { error: { code: 'INVALID_ACCESS_KEY', message: 'Invalid access key' } } };
        }
        unlocked = true;
        return { body: { unlocked: true, expiresAt: '2026-11-25T10:00:00.000Z' } };
      },
    });
    const user = userEvent.setup();
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Unlock workspace' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/username|email/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Access key'), 'wrong-key');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('That access key is not valid.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Access key'));
    await user.type(screen.getByLabelText('Access key'), 'correct-key');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    const unlockCall = fetchMock.mock.calls.find(([url, init]) => String(url) === '/api/access/unlock' && init?.method === 'POST');
    expect(unlockCall).toBeDefined();
  });

  it('shows the gate again when the API answers 401 ACCESS_REQUIRED', async () => {
    mockApi({
      ...baseHandlers(),
      'GET /api/overview': { status: 401, body: { error: { code: 'ACCESS_REQUIRED', message: 'Access required' } } },
    });
    renderApp('/');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Unlock workspace' })).toBeInTheDocument());
  });

  it('validates an empty key without calling the API', async () => {
    const fetchMock = mockApi({ ...baseHandlers(), 'GET /api/access/status': { body: { unlocked: false, expiresAt: null } } });
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('Access key is required')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/access/unlock')).toBe(false);
  });
});
