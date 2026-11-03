import { listDevices, listUsage } from '@/api/endpoints';
import { useAsyncData } from '@/hooks';
import { formatBytes, formatTimestamp } from '@/lib/format';
import { Figure, Panel, type PanelStatus } from './Panel';

/**
 * The largest device list the API will return in one page.
 *
 * The known/unknown split is counted over the devices that came back, so the
 * whole inventory is fetched rather than a page of it.
 */
const DEVICE_LIMIT = 200;

/** Largest page of usage records the API will return. */
const USAGE_LIMIT = 500;

/**
 * What the network looks like right now: how many devices are attached, how
 * many of them the administrator has already marked as known, and how much
 * traffic has been recorded.
 *
 * Figures only appear once the request has answered. An analyser that has
 * observed nothing shows that plainly, because a dashboard of zeroes is a
 * false reading.
 */
export function NetworkNowPanel() {
  const devices = useAsyncData(() => listDevices({ limit: DEVICE_LIMIT }), [], {
    panelId: 'network-now-devices',
  });
  const usage = useAsyncData(() => listUsage({ limit: USAGE_LIMIT }), [], {
    panelId: 'network-now-usage',
  });

  const deviceRows = devices.data?.data ?? [];
  const usageRows = usage.data?.data ?? [];
  const total = devices.data?.meta.total ?? 0;

  const failure = devices.error ?? usage.error;
  const loading = devices.isLoading || usage.isLoading;
  const nothingObserved = deviceRows.length === 0 && usageRows.length === 0;

  const status: PanelStatus = failure
    ? 'error'
    : loading
      ? 'loading'
      : nothingObserved
        ? 'empty'
        : 'ready';

  const known = deviceRows.filter((device) => device.isKnown).length;
  const unknown = deviceRows.length - known;

  const downloadBytes = usageRows.reduce((sum, record) => sum + record.downloadBytes, 0);
  const uploadBytes = usageRows.reduce((sum, record) => sum + record.uploadBytes, 0);
  const totalBytes = usageRows.reduce((sum, record) => sum + record.totalBytes, 0);

  const windowStart = usageRows[0]?.bucketStart;
  const windowEnd = usageRows[usageRows.length - 1]?.bucketStart;

  return (
    <Panel
      title="Network now"
      subtitle="Devices attached right now, and the traffic recorded for them."
      status={status}
      errorMessage={failure}
      onRetry={() => {
        devices.reload();
        usage.reload();
      }}
      emptyTitle="No data yet"
      emptyDescription="The analyser hasn't observed any traffic yet. Devices and usage totals appear here as soon as the first discovery poll completes."
      skeletonRows={3}
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Figure label="Devices seen" value={total} />
          <Figure label="Known" value={known} />
          <Figure label="Unknown" value={unknown} />
        </dl>

        {total > deviceRows.length ? (
          <p className="text-xs text-ink-muted">
            The known and unknown counts cover the first {deviceRows.length} of {total} devices.
          </p>
        ) : null}

        <div>
          <h3 className="text-sm font-medium text-ink">Traffic in the recorded window</h3>
          {usageRows.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">
              No traffic recorded yet. Byte totals appear once the analyser captures usage.
            </p>
          ) : (
            <>
              <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Figure label="Downloaded" value={formatBytes(downloadBytes)} />
                <Figure label="Uploaded" value={formatBytes(uploadBytes)} />
                <Figure label="Total" value={formatBytes(totalBytes)} />
              </dl>
              <p className="mt-2 text-xs text-ink-muted">
                {usageRows.length} recorded {usageRows.length === 1 ? 'bucket' : 'buckets'} ·{' '}
                {formatTimestamp(windowStart)} → {formatTimestamp(windowEnd)}
              </p>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
