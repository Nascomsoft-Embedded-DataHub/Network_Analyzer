import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemInfo } from '@network-analyser/contracts';
import { ApiError } from '@/api/client';
import { ApiConfigProvider } from '@/providers/ApiConfigProvider';
import { ConnectionProvider } from '@/providers/ConnectionProvider';
import { DashboardPage } from '@/pages/DashboardPage';

vi.mock('@/api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/endpoints')>();
  return {
    ...actual,
    getSystemInfo: vi.fn(),
    listDevices: vi.fn(),
    listUsage: vi.fn(),
    getUsageTimeline: vi.fn(),
    getHealthSnapshot: vi.fn(),
    listAlerts: vi.fn(),
  };
});

const { getSystemInfo, listDevices, listUsage, getUsageTimeline, getHealthSnapshot, listAlerts } =
  await import('@/api/endpoints');

const mockedGetSystemInfo = vi.mocked(getSystemInfo);
const mockedListDevices = vi.mocked(listDevices);
const mockedListUsage = vi.mocked(listUsage);
const mockedGetUsageTimeline = vi.mocked(getUsageTimeline);
const mockedGetHealthSnapshot = vi.mocked(getHealthSnapshot);
const mockedListAlerts = vi.mocked(listAlerts);

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

const TIMESTAMP = '2026-10-28T12:00:00.000Z';

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f5c219bb-ce01-4d0d-b57d-49c19e360205',
    identityKey: 'mac:AA:BB:CC:11:22:33',
    ipAddress: '192.168.1.21',
    macAddress: 'AA:BB:CC:11:22:33',
    hostname: 'living-room-tv',
    vendor: 'Acme Devices Inc.',
    isKnown: true,
    status: 'online' as const,
    firstSeenAt: TIMESTAMP,
    lastSeenAt: TIMESTAMP,
    ...overrides,
  };
}

/** The value of a labelled figure inside a panel. */
function figureValue(scope: HTMLElement, label: string): string {
  const term = [...scope.querySelectorAll('dt')].find((dt) => dt.textContent === label);
  return term?.parentElement?.querySelector('dd')?.textContent ?? '';
}

function renderDashboard() {  return render(
    <ApiConfigProvider>
      <ConnectionProvider>
        <DashboardPage />
      </ConnectionProvider>
    </ApiConfigProvider>,
  );
}

describe('dashboard panels', () => {
  beforeEach(() => {
    mockedGetSystemInfo.mockReset();
    mockedListDevices.mockReset();
    mockedListUsage.mockReset();
    mockedGetUsageTimeline.mockReset();
    mockedGetHealthSnapshot.mockReset();
    mockedListAlerts.mockReset();

    mockedGetSystemInfo.mockResolvedValue({ data: ANALYSER });
    mockedListDevices.mockResolvedValue({ data: [], meta: { total: 0, limit: 200, offset: 0 } });
    mockedListUsage.mockResolvedValue({ data: [], meta: { total: 0, limit: 500, offset: 0 } });
    mockedGetUsageTimeline.mockResolvedValue({
      data: [],
      meta: { granularity: 'hour', from: TIMESTAMP, to: TIMESTAMP },
    });
    mockedListAlerts.mockResolvedValue({ data: [], meta: { total: 0, limit: 5, offset: 0 } });
    // The analyser answers 404 until it has measured the link once.
    mockedGetHealthSnapshot.mockRejectedValue(
      new ApiError('No health measurements recorded yet', 404, 'NOT_FOUND'),
    );
  });

  it('shows an empty state rather than zeroes when nothing has been observed', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('No data yet').length).toBe(3);
    });
    expect(screen.getByText('No alerts raised yet')).toBeTruthy();

    // A missing reading is not a zero reading.
    expect(document.body.textContent).not.toContain('0 B');
    expect(document.body.textContent).not.toContain('0 Mbps');
  });

  it('treats a not-found health snapshot as no data yet, not as a failure', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/hasn't measured the link yet/i)).toBeTruthy();
    });
    expect(screen.queryByText(/could not be loaded/i)).toBeNull();
  });

  it('shows the figures once the analyser has observed something', async () => {
    mockedListDevices.mockResolvedValue({
      data: [
        device(),
        device({
          id: '84ced446-ebc1-4d1f-8431-44900c2459a7',
          identityKey: 'mac:A2:93:69:84:49:99',
          macAddress: 'A2:93:69:84:49:99',
          hostname: 'unknown-device',
          vendor: null,
          isKnown: false,
        }),
      ],
      meta: { total: 2, limit: 200, offset: 0 },
    });
    mockedListUsage.mockResolvedValue({
      data: [
        {
          id: '3f0a1c22-0000-4000-8000-000000000001',
          deviceId: 'f5c219bb-ce01-4d0d-b57d-49c19e360205',
          bucketStart: '2026-10-28T12:00:00.000Z',
          uploadBytes: 1024,
          downloadBytes: 2048,
          totalBytes: 3072,
        },
      ],
      meta: { total: 1, limit: 500, offset: 0 },
    });

    renderDashboard();

    const panel = (await screen.findByRole('heading', { name: 'Network now' })).closest('section');
    expect(panel).toBeTruthy();

    await waitFor(() => {
      expect(within(panel as HTMLElement).getByText('Devices seen')).toBeTruthy();
    });
    const scoped = panel as HTMLElement;
    expect(figureValue(scoped, 'Devices seen')).toBe('2');
    expect(figureValue(scoped, 'Known')).toBe('1');
    expect(figureValue(scoped, 'Unknown')).toBe('1');
    expect(figureValue(scoped, 'Downloaded')).toBe('2.0 KiB');
    expect(figureValue(scoped, 'Uploaded')).toBe('1.0 KiB');
    expect(figureValue(scoped, 'Total')).toBe('3.0 KiB');
  });

  it('reports a failed panel with a retry that refetches', async () => {
    mockedListDevices.mockRejectedValue(new Error('The request failed'));

    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText(/could not be loaded/i).length).toBeGreaterThan(0);
    });

    const callsBefore = mockedListDevices.mock.calls.length;
    const retry = screen.getAllByRole('button', { name: /retry/i })[0]!;
    await user.click(retry);

    await waitFor(() => {
      expect(mockedListDevices.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('keeps the peak-usage panel a placeholder rather than drawing a chart', async () => {
    mockedGetUsageTimeline.mockResolvedValue({
      data: [
        {
          bucketStart: '2026-10-28T12:00:00.000Z',
          totalBytes: 4096,
          uploadBytes: 1024,
          downloadBytes: 3072,
        },
      ],
      meta: { granularity: 'hour', from: TIMESTAMP, to: TIMESTAMP },
    });

    renderDashboard();

    expect(await screen.findByText('Chart lands on Day 3')).toBeTruthy();
    expect(screen.getByText(/1 hourly bucket recorded/i)).toBeTruthy();
    // No chart is drawn.
    expect(document.querySelector('svg.chart')).toBeNull();
  });
});
