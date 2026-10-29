import type { ReactNode } from 'react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  title: string;
  description?: ReactNode;
  /** Renders a retry action when provided. */
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = 'Retry',
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-4 py-8 text-center',
        className,
      )}
    >
      <div className="space-y-1">
        <p className="text-base font-medium text-danger">{title}</p>
        {description ? (
          <p className="mx-auto max-w-prose text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
      {action}
    </div>
  );
}
