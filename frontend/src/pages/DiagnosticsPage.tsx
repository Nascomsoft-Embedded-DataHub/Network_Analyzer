import { Badge, Card, Table } from '@/components/ui';
import { PageHeader } from '@/components/features/PageHeader';
import { useApiConfig } from '@/providers/ApiConfigProvider';
import { useConnection } from '@/providers/ConnectionProvider';
import { formatDuration, formatTimestamp } from '@/lib/format';

export function DiagnosticsPage() {
  const { baseUrl, isMock } = useApiConfig();
  const { status, info, error, lastCheckedAt, failedPanels } = useConnection();

  return (
    <>
      <PageHeader
        title="Diagnostics"
        description="Which analyser this dashboard is talking to, and how the connection is doing."
      />

      <div className="space-y-4">
        <Card
          title="Connection"
          subtitle="The dashboard asks the analyser to identify itself on a timer."
          actions={<Badge tone={status === 'loaded' ? 'ok' : status === 'unreachable' ? 'danger' : 'warn'}>{status}</Badge>}
        >
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Detail label="API base URL">
              <span className="font-mono">{baseUrl}</span>
            </Detail>
            <Detail label="Data source">{isMock ? 'Mock fixtures' : 'Live API'}</Detail>
            <Detail label="Last checked">
              {lastCheckedAt ? formatTimestamp(new Date(lastCheckedAt).toISOString()) : '—'}
            </Detail>
            <Detail label="Failed panels">
              {failedPanels.length === 0 ? 'None' : failedPanels.join(', ')}
            </Detail>
          </dl>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </Card>

        <Card
          title="Analyser"
          subtitle="Reported by GET /api/system/info."
        >
          {info ? (
            <Table
              columns={[
                {
                  key: 'field',
                  header: 'Field',
                  primary: true,
                  render: (row) => row.field,
                },
                {
                  key: 'value',
                  header: 'Value',
                  render: (row) => <span className="font-mono break-all">{row.value}</span>,
                },
              ]}
              rows={[
                { field: 'Hostname', value: info.hostname },
                { field: 'Version', value: info.version },
                { field: 'Bound to', value: `${info.bindHost}:${info.bindPort}` },
                { field: 'Loopback only', value: info.loopbackOnly ? 'yes' : 'no' },
                { field: 'Started at', value: formatTimestamp(info.startedAt) },
                { field: 'Uptime', value: formatDuration(info.uptimeSeconds) },
                { field: 'Node', value: info.runtime.nodeVersion },
                { field: 'Platform', value: info.runtime.platform },
              ]}
              rowKey={(row) => row.field}
            />
          ) : (
            <p className="text-sm text-ink-muted">
              The analyser has not identified itself yet. It will appear here once the connection
              succeeds.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
