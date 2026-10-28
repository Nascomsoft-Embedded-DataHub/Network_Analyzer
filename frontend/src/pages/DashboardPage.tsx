import { EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/features/PageHeader';

export function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Network-wide bandwidth consumption and the peak-usage timeline."
      />
      <EmptyState
        title="The dashboard is not built yet"
        description="The consumption overview, the peak-usage timeline and the top-consumption list arrive with the dashboard shell on Day 2 and the charts on Day 3. Nothing is shown here rather than showing invented figures."
      />
    </>
  );
}
