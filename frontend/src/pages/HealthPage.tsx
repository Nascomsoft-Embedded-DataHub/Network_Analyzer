import { EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/features/PageHeader';

export function HealthPage() {
  return (
    <>
      <PageHeader
        title="Health"
        description="Latency, throughput and uptime for the monitored link."
      />
      <EmptyState
        title="The health panel is not built yet"
        description="The status widgets will read GET /api/health/snapshot, which returns a 404 until the first measurement has been ingested — that case is handled as an empty state rather than an error."
      />
    </>
  );
}
