import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemInfo } from '@network-analyser/contracts';
import { ApiConfigProvider } from '@/providers/ApiConfigProvider';
import { ConnectionProvider } from '@/providers/ConnectionProvider';
import { DevicesPage } from '@/pages/DevicesPage';

vi.mock('@/api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/endpoints')>();
  return { ...actual, getSystemInfo: vi.fn(), listDevices: vi.fn() };
});

const { getSystemInfo, listDevices } = await import('@/api/endpoints');

const mockedGetSystemInfo = vi.mocked(getSystemInfo);
const mockedListDevices = vi.mocked(listDevices);

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

function device(index: number) {
  return {
    id: `0000000${index}-0000-4000-8000-000000000000`,
    identityKey: `mac:AA:BB:CC:00:00:0${index}`,
    ipAddress: `192.168.1.${index}`,
    macAddress: `AA:BB:CC:00:00:0${index}`,
    hostname: `device-${index}`,
    vendor: 'Acme Devices Inc.',
    isKnown: index % 2 === 0,
    status: 'online' as const,
    firstSeenAt: TIMESTAMP,
    lastSeenAt: TIMESTAMP,
  };
}

/** Answers like the API: a page of the inventory, with the real totals. */
function paginated(total: number) {
  return (query?: Parameters<typeof listDevices>[0]) => {
    const limit = (query?.limit as number) ?? 25;
    const offset = (query?.offset as number) ?? 0;
    const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, index) =>
      device(offset + index + 1),
    );
    return Promise.resolve({ data: rows, meta: { total, limit, offset } });
  };
}

function renderDevices() {
  return render(
    <ApiConfigProvider>
      <ConnectionProvider>
        <DevicesPage />
      </ConnectionProvider>
    </ApiConfigProvider>,
  );
}

describe('devices page', () => {
  beforeEach(() => {
    mockedGetSystemInfo.mockReset();
    mockedListDevices.mockReset();
    mockedGetSystemInfo.mockResolvedValue({ data: ANALYSER });
  });

  it('lists the inventory with a known badge per device', async () => {
    mockedListDevices.mockImplementation(paginated(2));

    renderDevices();

    // The table and the card layout are both in the document, so each field
    // is rendered twice.
    expect((await screen.findAllByText('device-1')).length).toBe(2);
    expect(screen.getAllByText('192.168.1.1').length).toBe(2);
    expect(screen.getAllByText('AA:BB:CC:00:00:01').length).toBe(2);
    expect(screen.getAllByText('Known').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it('renders both the table and the stacked card layout', async () => {
    mockedListDevices.mockImplementation(paginated(1));

    const { container } = renderDevices();

    expect((await screen.findAllByText('device-1')).length).toBe(2);
    // The table is shown from 641px up and the cards below it, so both are in
    // the document and the CSS decides which one is visible.
    const table = container.querySelector('table');
    expect(table).toBeTruthy();
    expect(table?.parentElement?.className).toContain('min-[641px]:block');
    expect(container.querySelector('ul > li')).toBeTruthy();
  });

  it('pages through the inventory using the list meta', async () => {
    mockedListDevices.mockImplementation(paginated(60));

    const user = userEvent.setup();
    renderDevices();

    expect(await screen.findByText('Showing 1–25 of 60')).toBeTruthy();

    const previous = screen.getByRole('button', { name: 'Previous' });
    const next = screen.getByRole('button', { name: 'Next' });
    expect(previous.hasAttribute('disabled')).toBe(true);

    await user.click(next);

    await waitFor(() => {
      expect(screen.getByText('Showing 26–50 of 60')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText('Showing 51–60 of 60')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
  });

  it('says so honestly when no device has been observed', async () => {
    mockedListDevices.mockImplementation(paginated(0));

    renderDevices();

    expect(await screen.findByText('No devices observed yet')).toBeTruthy();
  });

  it('offers a retry when the request fails', async () => {
    mockedListDevices.mockRejectedValue(new Error('The request failed'));

    const user = userEvent.setup();
    renderDevices();

    await waitFor(() => {
      expect(screen.getByText(/could not be loaded/i)).toBeTruthy();
    });

    const callsBefore = mockedListDevices.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(mockedListDevices.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
