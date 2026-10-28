import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/features/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState
        title="There is no page at this address"
        description="The link may be out of date."
        action={
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink"
          >
            Go to the dashboard
          </Link>
        }
      />
    </>
  );
}
