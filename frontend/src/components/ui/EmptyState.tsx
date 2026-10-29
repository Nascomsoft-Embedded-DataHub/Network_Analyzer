import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-4 py-10 text-center',
        className,
      )}
    >
      {icon ? <div className="text-ink-muted">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-base font-medium text-ink">{title}</p>
        {description ? (
          <p className="mx-auto max-w-prose text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
