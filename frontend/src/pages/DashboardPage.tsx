import { PageHeader } from '@/components/features/PageHeader';
import { HealthSnapshotPanel } from '@/components/features/HealthSnapshotPanel';
import { NetworkNowPanel } from '@/components/features/NetworkNowPanel';
import { PeakUsagePanel } from '@/components/features/PeakUsagePanel';
import { RecentAlertsPanel } from '@/components/features/RecentAlertsPanel';

/**
 * The dashboard shell.
 *
 * Every panel owns its own four states, so one failing request never blanks
 * the others, and no panel shows a figure it has not actually been given.
 */
export function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Network-wide bandwidth consumption and the peak-usage timeline."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NetworkNowPanel />
        <PeakUsagePanel />
        <HealthSnapshotPanel />
        <RecentAlertsPanel />
      </div>
    </>
  );
}
