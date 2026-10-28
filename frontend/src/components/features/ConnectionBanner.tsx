import { Button } from '@/components/ui';
import { RefreshIcon, WarningIcon } from '@/components/icons';
import { useApiConfig } from '@/providers/ApiConfigProvider';
import { useConnection } from '@/providers/ConnectionProvider';

/**
 * Banner shown when the analyser cannot be reached, or when only some panels
 * failed.
 *
 * An unreachable analyser must never be rendered as zeroes — an idle network
 * and an unreachable analyser look identical on screen, so the dashboard says
 * which machine it could not reach and offers a retry instead.
 */
export function ConnectionBanner() {
  const { status, info, error, retry } = useConnection();
  const { baseUrl } = useApiConfig();

  if (status === 'unreachable') {
    const analyser = info
      ? `${info.hostname} (bound to ${info.bindHost}:${info.bindPort})`
      : 'the analyser';

    return (
      <div
        role="alert"
        className="mb-4 flex flex-col gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-danger">
            <WarningIcon />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-medium text-ink">Cannot reach {analyser}</p>
            <p className="mt-0.5 text-ink-muted">
              No reading was obtained from <span className="font-mono">{baseUrl}</span>. Usage
              figures are not shown, because a stopped analyser and an idle network look the same.
            </p>
            {error ? <p className="mt-1 text-xs text-ink-muted">{error}</p> : null}
          </div>
        </div>
        <Button variant="secondary" onClick={retry} leadingIcon={<RefreshIcon />}>
          Retry
        </Button>
      </div>
    );
  }

  if (status === 'partial') {
    return (
      <div
        role="status"
        className="mb-4 flex flex-col gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-warn">
            <WarningIcon />
          </span>
          <p className="text-sm text-ink">
            The analyser is reachable, but some panels failed to load. Those panels say so rather
            than showing empty values.
          </p>
        </div>
        <Button variant="secondary" onClick={retry} leadingIcon={<RefreshIcon />}>
          Retry
        </Button>
      </div>
    );
  }

  return null;
}
