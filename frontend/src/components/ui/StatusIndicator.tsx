import { cn } from '@/lib/utils';

export type StatusTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

/** Statuses the API can report, mapped to a tone. */
export type StatusValue = 'online' | 'offline' | 'unknown' | 'healthy' | 'degraded' | 'down';

const TONES: Record<StatusTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  neutral: 'bg-ink-muted',
  info: 'bg-info',
};

const STATUS_TONES: Record<StatusValue, StatusTone> = {
  online: 'ok',
  healthy: 'ok',
  offline: 'neutral',
  unknown: 'warn',
  degraded: 'warn',
  down: 'danger',
};

export interface StatusIndicatorProps {
  /** Either a known API status or an explicit tone. */
  status: StatusValue | StatusTone;
  /** Text beside the dot. Defaults to the status itself. */
  label?: string;
  className?: string;
}

export function StatusIndicator({ status, label, className }: StatusIndicatorProps) {
  const tone = isStatusValue(status) ? STATUS_TONES[status] : status;
  const text = label ?? (isStatusValue(status) ? status : undefined);

  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-ink', className)}>
      <span
        aria-hidden="true"
        className={cn('size-2.5 shrink-0 rounded-full', TONES[tone])}
      />
      {text ? <span className="capitalize">{text}</span> : null}
    </span>
  );
}

function isStatusValue(status: StatusValue | StatusTone): status is StatusValue {
  return status in STATUS_TONES;
}
