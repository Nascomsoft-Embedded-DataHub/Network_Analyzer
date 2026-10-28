import type { ReactNode } from 'react';
import { IconButton } from './IconButton';
import { cn } from '@/lib/utils';

export type ToastTone = 'info' | 'ok' | 'warn' | 'danger';

export interface ToastProps {
  title: string;
  description?: ReactNode;
  tone?: ToastTone;
  onDismiss?: () => void;
  className?: string;
}

const TONES: Record<ToastTone, string> = {
  info: 'border-info/40 bg-info/10',
  ok: 'border-ok/40 bg-ok/10',
  warn: 'border-warn/40 bg-warn/10',
  danger: 'border-danger/40 bg-danger/10',
};

export function Toast({ title, description, tone = 'info', onDismiss, className }: ToastProps) {
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-lg border p-3',
        'bg-surface shadow-[var(--shadow)]',
        TONES[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description !== undefined ? (
          <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
        ) : null}
      </div>
      {onDismiss ? (
        <IconButton label="Dismiss notification" icon={<CloseIcon />} onClick={onDismiss} />
      ) : null}
    </div>
  );
}

/** Fixed container the toast provider renders into. */
export function ToastViewport({ children }: { children: ReactNode }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 p-3 sm:inset-x-auto sm:right-0 sm:top-0 sm:items-end"
    >
      {children}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
