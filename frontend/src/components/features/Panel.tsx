import type { ReactNode } from 'react';
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { InfoIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * The four states every data panel can be in.
 *
 * - `loading` — the request is in flight. A skeleton, never a spinner over
 *   stale figures.
 * - `ready` — the request answered and there is data.
 * - `empty` — the request answered and there is nothing to show. This is not
 *   a failure: it means the analyser has not observed anything yet.
 * - `error` — the request failed. A short message and a retry.
 *
 * The states are visually distinct on purpose. An empty reading and an
 * unreachable analyser look identical if both are drawn as a blank box, and a
 * zero-valued panel is a false reading.
 */
export type PanelStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface PanelProps {
  title: string;
  subtitle?: ReactNode;
  status: PanelStatus;
  /** The failure, in one short sentence. Shown in the error state. */
  errorMessage?: string | null;
  /** Retry action offered in the error state. */
  onRetry?: () => void;
  /** Headline of the empty state. */
  emptyTitle: string;
  emptyDescription?: ReactNode;
  /** Body of the ready state. */
  children?: ReactNode;
  /** How many placeholder rows the loading state draws. */
  skeletonRows?: number;
  /** Removes the body padding — for a table that runs to the card edge. */
  flush?: boolean;
  className?: string;
}

export function Panel({
  title,
  subtitle,
  status,
  errorMessage,
  onRetry,
  emptyTitle,
  emptyDescription,
  children,
  skeletonRows = 3,
  flush = false,
  className,
}: PanelProps) {
  return (
    <Card
      title={title}
      subtitle={subtitle}
      flush={flush}
      className={cn(className, status === 'error' && 'border-danger/40')}
    >
      {status === 'loading' ? <PanelSkeleton rows={skeletonRows} /> : null}

      {status === 'error' ? (
        <ErrorState
          title="This panel could not be loaded"
          description={errorMessage ?? 'The request to the analyser failed.'}
          onRetry={onRetry}
        />
      ) : null}

      {status === 'empty' ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          icon={<InfoIcon className="size-6" />}
          className="py-6"
        />
      ) : null}

      {status === 'ready' ? children : null}
    </Card>
  );
}

/** Placeholder rows shown while a panel loads. */
function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface FigureProps {
  label: string;
  value: ReactNode;
  /** Secondary line under the value. */
  hint?: ReactNode;
}

/** A single labelled figure inside a panel. */
export function Figure({ label, value, hint }: FigureProps) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/50 px-3 py-2.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</dd>
      {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
