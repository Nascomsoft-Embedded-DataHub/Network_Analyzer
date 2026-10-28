import type { SystemInfo } from '@network-analyser/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiConfigProvider } from '@/providers/ApiConfigProvider';
import { ConnectionProvider, useConnection } from '@/providers/ConnectionProvider';
import { connectionReducer, initialConnectionState } from '@/state/connection';

vi.mock('@/api/endpoints', () => ({
  getSystemInfo: vi.fn(),
}));

const { getSystemInfo } = await import('@/api/endpoints');
const mockedGetSystemInfo = vi.mocked(getSystemInfo);

const ANALYSER: SystemInfo = {
  version: '0.1.0',
  startedAt: '2026-10-27T14:45:00.000Z',
  uptimeSeconds: 1802,
  bindHost: '127.0.0.1',
  bindPort: 3000,
  hostname: 'STANLEY-LAPTOP',
  runtime: { nodeVersion: 'v24.19.0', platform: 'linux x64' },
  loopbackOnly: true,
};

describe('connection state reducer', () => {
  it('starts out connecting', () => {
    expect(initialConnectionState.status).toBe('connecting');
  });

  it('becomes loaded once the analyser identifies itself', () => {
    const state = connectionReducer(initialConnectionState, {
      type: 'poll-succeeded',
      info: ANALYSER,
      checkedAt: 1000,
    });

    expect(state.status).toBe('loaded');
    expect(state.info?.hostname).toBe('STANLEY-LAPTOP');
    expect(state.error).toBeNull();
  });

  it('becomes unreachable when the poll fails, and keeps the last reading for naming', () => {
    const loaded = connectionReducer(initialConnectionState, {
      type: 'poll-succeeded',
      info: ANALYSER,
      checkedAt: 1000,
    });
    const failed = connectionReducer(loaded, {
      type: 'poll-failed',
      error: 'Could not reach the analyser',
      checkedAt: 2000,
    });

    expect(failed.status).toBe('unreachable');
    expect(failed.error).toBe('Could not reach the analyser');
    // The reading is retained so the UI can name the machine it lost.
    expect(failed.info?.hostname).toBe('STANLEY-LAPTOP');
  });

  it('becomes partial when a panel fails while the analyser is reachable', () => {
    const loaded = connectionReducer(initialConnectionState, {
      type: 'poll-succeeded',
      info: ANALYSER,
      checkedAt: 1000,
    });
    const partial = connectionReducer(loaded, { type: 'panel-failed', panelId: 'devices' });

    expect(partial.status).toBe('partial');
    expect(partial.failedPanels).toEqual(['devices']);
  });

  it('returns to loaded when the failed panel recovers', () => {
    const loaded = connectionReducer(initialConnectionState, {
      type: 'poll-succeeded',
      info: ANALYSER,
      checkedAt: 1000,
    });
    const failed = connectionReducer(loaded, { type: 'panel-failed', panelId: 'devices' });
    const recovered = connectionReducer(failed, { type: 'panel-recovered', panelId: 'devices' });

    expect(recovered.status).toBe('loaded');
    expect(recovered.failedPanels).toEqual([]);
  });

  it('goes back to connecting while a retry is in flight', () => {
    const loaded = connectionReducer(initialConnectionState, {
      type: 'poll-succeeded',
      info: ANALYSER,
      checkedAt: 1000,
    });
    const retrying = connectionReducer(loaded, { type: 'poll-started' });

    expect(retrying.status).toBe('connecting');
  });
});

function Probe() {
  const { status, info, error } = useConnection();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="hostname">{info?.hostname ?? 'none'}</span>
      <span data-testid="error">{error ?? 'none'}</span>
    </div>
  );
}

function renderProvider() {
  return render(
    <ApiConfigProvider>
      <ConnectionProvider>
        <Probe />
      </ConnectionProvider>
    </ApiConfigProvider>,
  );
}

describe('connection provider', () => {
  beforeEach(() => {
    mockedGetSystemInfo.mockReset();
  });

  it('reports loaded once the analyser answers', async () => {
    mockedGetSystemInfo.mockResolvedValue({ data: ANALYSER });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('loaded');
    });
    expect(screen.getByTestId('hostname').textContent).toBe('STANLEY-LAPTOP');
  });

  it('reports unreachable when the analyser cannot be reached, and names it', async () => {
    mockedGetSystemInfo.mockRejectedValue(new Error('Could not reach the analyser'));

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unreachable');
    });
    expect(screen.getByTestId('error').textContent).toContain('Could not reach the analyser');
  });
});
