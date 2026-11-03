import { listAlerts } from '@/api/endpoints';
import { Badge, type BadgeTone } from '@/components/ui';
import { useAsyncData } from '@/hooks';
import { formatTimestamp } from '@/lib/format';
import { Panel, type PanelStatus } from './Panel';

const SEVERITY_TONES: Record<'info' | 'warning' | 'critical', BadgeTone> = {
  info: 'info',
  warning: 'warn',
  critical: 'danger',
};

const SEVERITY_LABELS: Record<'info' | 'warning' | 'critical', string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

/** How many alerts the panel shows. The full list lives on the alerts page. */
const ALERT_LIMIT = 5;

/**
 * The most recent alerts, read-only.
 *
 * Acknowledging an alert is Day 4 work, so no control for it is rendered here
 * — the panel only reports what the analyser raised.
 */
export function RecentAlertsPanel() {
  const alerts = useAsyncData(() => listAlerts({ limit: ALERT_LIMIT }), [], {
    panelId: 'recent-alerts',
  });

  const rows = alerts.data?.data ?? [];
  const failure = alerts.error;
  const status: PanelStatus = failure
    ? 'error'
    : alerts.isLoading
      ? 'loading'
      : rows.length === 0
        ? 'empty'
        : 'ready';

  return (
    <Panel
      title="Recent alerts"
      subtitle="What the analyser raised most recently."
      status={status}
      errorMessage={failure}
      onRetry={alerts.reload}
      emptyTitle="No alerts raised yet"
      emptyDescription="Nothing has triggered an alert rule on this network. Alerts appear here as soon as one is raised."
      skeletonRows={3}
    >
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((alert) => (
          <li key={alert.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={SEVERITY_TONES[alert.severity]}>{SEVERITY_LABELS[alert.severity]}</Badge>
              <span className="text-xs text-ink-muted">{formatTimestamp(alert.triggeredAt)}</span>
            </div>
            <p className="text-sm text-ink">{alert.message}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
