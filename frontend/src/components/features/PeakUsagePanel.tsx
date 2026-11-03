import { getUsageTimeline } from '@/api/endpoints';
import { useAsyncData } from '@/hooks';
import { formatTimestamp } from '@/lib/format';
import { Panel, type PanelStatus } from './Panel';

/**
 * Peak usage.
 *
 * The analyser already records the network-wide hourly timeline this panel
 * will draw, so the panel loads it and handles all four states — but the chart
 * itself lands on Day 3. Nothing is drawn here in the meantime: a preview
 * chart drawn from fixture data would be an invented figure.
 */
export function PeakUsagePanel() {
  const timeline = useAsyncData(() => getUsageTimeline({ granularity: 'hour' }), [], {
    panelId: 'peak-usage',
  });

  const points = timeline.data?.data ?? [];
  const failure = timeline.error;
  const status: PanelStatus = failure
    ? 'error'
    : timeline.isLoading
      ? 'loading'
      : points.length === 0
        ? 'empty'
        : 'ready';

  return (
    <Panel
      title="Peak usage"
      subtitle="The busiest hours on the monitored link."
      status={status}
      errorMessage={failure}
      onRetry={timeline.reload}
      emptyTitle="No data yet"
      emptyDescription="The analyser hasn't recorded any hourly usage yet, so there is no peak to show. Buckets appear here once the link has been measured."
      skeletonRows={4}
    >
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <p className="text-base font-medium text-ink">Chart lands on Day 3</p>
        <p className="max-w-prose text-sm text-ink-muted">
          The hourly peak-usage timeline is already recorded by the analyser. The chart that
          draws it arrives on Day 3.
        </p>
        <p className="text-xs text-ink-muted">
          {points.length} hourly {points.length === 1 ? 'bucket' : 'buckets'} recorded ·{' '}
          {formatTimestamp(timeline.data?.meta.from)} → {formatTimestamp(timeline.data?.meta.to)}
        </p>
      </div>
    </Panel>
  );
}
