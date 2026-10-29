import { EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/features/PageHeader';

export function AlertsPage() {
  return (
    <>
      <PageHeader
        title="Alerts"
        description="Unknown-device and high-usage alerts raised by the trigger engine."
      />
      <EmptyState
        title="The alerts panel is not built yet"
        description="Alerts are polled in-app rather than pushed. The panel arrives on Day 4, built against GET /api/alerts and PATCH /api/alerts/:id/acknowledge."
      />
    </>
  );
}
