import { getHealthSnapshot } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { Badge, type BadgeTone } from '@/components/ui';
import { useAsyncData } from '@/hooks';
import { formatDuration, formatLatency, formatMbps, formatTimestamp } from '@/lib/format';
import { Figure, Panel, type PanelStatus } from './Panel';

const STATUS_TONES: Record<'healthy' | 'degraded' | 'down', BadgeTone> = {
  healthy: 'ok',
  degraded: 'warn',
  down: 'danger',
};

/**
 * The most recent health sample.
 *
 * The analyser answers 404 until it has measured the link once. That is an
 * empty result, not a failure, so it is shown as "no data yet" rather than as
 * an error the administrator is asked to retry.
 */
export function HealthSnapshotPanel() {
  const health = useAsyncData(
    async () => {
      try {
        const response = await getHealthSnapshot();
        return { snapshot: response.data, missing: false };
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 404) {
          return { snapshot: null, missing: true };
        }
        throw cause;
      }
    },
    [],
    { panelId: 'health-snapshot' },
  );

  const snapshot = health.data?.snapshot ?? null;
  const missing = health.data?.missing ?? false;
  const failure = health.error;

  const status: PanelStatus = failure
    ? 'error'
    : health.isLoading
      ? 'loading'
      : missing || !snapshot
        ? 'empty'
        : 'ready';

  return (
    <Panel
      title="Health snapshot"
      subtitle="The last measurement of the monitored link."
      status={status}
      errorMessage={failure}
      onRetry={health.reload}
      emptyTitle="No data yet"
      emptyDescription="The analyser hasn't measured the link yet. The first health sample appears here once it has — until then there is nothing to report, and a zero would read as a measured link."
      skeletonRows={2}
    >
      {snapshot ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Badge tone={STATUS_TONES[snapshot.status]}>
              {snapshot.status === 'healthy'
                ? 'Healthy'
                : snapshot.status === 'degraded'
                  ? 'Degraded'
                  : 'Down'}
            </Badge>
            <p className="text-xs text-ink-muted">{formatTimestamp(snapshot.timestamp)}</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="Latency" value={formatLatency(snapshot.latencyMs)} />
            <Figure label="Down" value={formatMbps(snapshot.downloadMbps)} />
            <Figure label="Up" value={formatMbps(snapshot.uploadMbps)} />
            <Figure label="Uptime" value={formatDuration(snapshot.uptimeSeconds)} />
          </dl>
        </div>
      ) : null}
    </Panel>
  );
}
