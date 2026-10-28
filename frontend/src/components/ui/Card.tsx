import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Buttons or links aligned to the top-right of the card header. */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Removes the body padding — useful when the body is a full-bleed table. */
  flush?: boolean;
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  flush = false,
}: CardProps) {
  const hasHeader = title !== undefined || subtitle !== undefined || actions !== undefined;

  return (
    <section
      className={cn(
        'rounded-xl border border-line bg-surface shadow-[var(--shadow)]',
        className,
      )}
    >
      {hasHeader ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title !== undefined ? (
              <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
            ) : null}
            {subtitle !== undefined ? (
              <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>
            ) : null}
          </div>
          {actions !== undefined ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(flush ? '' : 'p-4')}>{children}</div>
    </section>
  );
}
