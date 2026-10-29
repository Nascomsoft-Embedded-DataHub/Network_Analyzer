import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';

vi.mock('@/api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/endpoints')>();
  return { ...actual, getSystemInfo: vi.fn() };
});

const { getSystemInfo } = await import('@/api/endpoints');
const mockedGetSystemInfo = vi.mocked(getSystemInfo);

async function acknowledgePrivacyNotice(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: /authorised use acknowledgement/i });
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: /acknowledge and continue/i }));
  await waitFor(() => {
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
  });
}

describe('unreachable analyser', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedGetSystemInfo.mockReset();
  });

  it('names the analyser and offers a retry instead of showing zeros', async () => {
    mockedGetSystemInfo.mockRejectedValue(new Error('Could not reach the analyser'));

    const user = userEvent.setup();
    render(<App />);
    await acknowledgePrivacyNotice(user);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Cannot reach');
    });

    const banner = screen.getByRole('alert');
    // The address is named, so the administrator knows which machine to check.
    expect(banner.textContent).toContain('http://localhost:3000');
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();

    // Nothing on the page claims the network used zero traffic.
    expect(document.body.textContent).not.toContain('0 B');
  });

  it('recovers when the analyser answers again', async () => {
    mockedGetSystemInfo.mockRejectedValue(new Error('Could not reach the analyser'));

    const user = userEvent.setup();
    render(<App />);
    await acknowledgePrivacyNotice(user);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Cannot reach');
    });

    mockedGetSystemInfo.mockResolvedValue({
      data: {
        version: '0.1.0',
        startedAt: '2026-10-27T14:45:00.000Z',
        uptimeSeconds: 1802,
        bindHost: '127.0.0.1',
        bindPort: 3000,
        hostname: 'STANLEY-LAPTOP',
        runtime: { nodeVersion: 'v24.19.0', platform: 'linux x64' },
        loopbackOnly: true,
      },
    });

    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
