import { useState } from 'react';
import { listDevices } from '@/api/endpoints';
import { PageHeader } from '@/components/features/PageHeader';
import { Panel, type PanelStatus } from '@/components/features/Panel';
import { Badge, Button, Table, type TableColumn } from '@/components/ui';
import { useAsyncData } from '@/hooks';
import { deviceDisplayName } from '@/lib/device';
import { formatTimestamp } from '@/lib/format';
import type { Device } from '@network-analyser/contracts';

/** How many devices a page of the inventory holds. */
const PAGE_SIZE = 25;

export function DevicesPage() {
  const [offset, setOffset] = useState(0);

  const devices = useAsyncData(() => listDevices({ limit: PAGE_SIZE, offset }), [offset], {
    panelId: 'devices',
  });

  const rows = devices.data?.data ?? [];
  const total = devices.data?.meta.total ?? 0;
  const limit = devices.data?.meta.limit ?? PAGE_SIZE;
  const currentOffset = devices.data?.meta.offset ?? offset;

  const failure = devices.error;
  const status: PanelStatus = failure
    ? 'error'
    : devices.isLoading
      ? 'loading'
      : rows.length === 0
        ? 'empty'
        : 'ready';

  const first = rows.length === 0 ? 0 : currentOffset + 1;
  const last = currentOffset + rows.length;
  const hasPrevious = currentOffset > 0;
  const hasNext = currentOffset + limit < total;

  const columns: TableColumn<Device>[] = [
    {
      key: 'name',
      header: 'Device',
      primary: true,
      render: (device) => <span className="font-medium">{deviceDisplayName(device)}</span>,
    },
    {
      key: 'ip',
      header: 'IP address',
      render: (device) => <span className="font-mono text-xs">{device.ipAddress}</span>,
    },
    {
      key: 'mac',
      header: 'MAC address',
      render: (device) =>
        device.macAddress ? (
          <span className="font-mono text-xs">{device.macAddress}</span>
        ) : (
          <span className="text-ink-muted">Not reported</span>
        ),
    },
    {
      key: 'firstSeen',
      header: 'First seen',
      render: (device) => <span className="text-xs">{formatTimestamp(device.firstSeenAt)}</span>,
    },
    {
      key: 'lastSeen',
      header: 'Last seen',
      render: (device) => <span className="text-xs">{formatTimestamp(device.lastSeenAt)}</span>,
    },
    {
      key: 'known',
      header: 'Known',
      render: (device) =>
        device.isKnown ? <Badge tone="ok">Known</Badge> : <Badge tone="neutral">Unknown</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Devices"
        description="Every device seen on the network, with its IP and MAC address."
      />
      <Panel
        title="Device inventory"
        subtitle="Devices are listed as the analyser observes them."
        status={status}
        errorMessage={failure}
        onRetry={devices.reload}
        emptyTitle="No devices observed yet"
        emptyDescription="The analyser hasn't completed its first discovery poll. Devices appear here as soon as one is seen on the network."
        skeletonRows={6}
        flush={status === 'ready'}
      >
        <Table
          columns={columns}
          rows={rows}
          rowKey={(device) => device.id}
          caption="Devices seen on the monitored network"
          stackBelow="phone"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
          <p className="text-sm text-ink-muted">
            Showing {first}–{last} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setOffset(Math.max(0, currentOffset - limit))}
              disabled={!hasPrevious}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              onClick={() => setOffset(currentOffset + limit)}
              disabled={!hasNext}
            >
              Next
            </Button>
          </div>
        </div>
      </Panel>
    </>
  );
}
