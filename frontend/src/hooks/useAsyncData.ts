import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { useConnection } from '@/providers/ConnectionProvider';

export interface AsyncDataOptions {
  /**
   * Identifies the panel to the connection provider. A panel that fails while
   * the analyser is reachable puts the dashboard into the partial state
   * instead of rendering an empty panel.
   */
  panelId?: string;
  /** Skips the fetch entirely. */
  enabled?: boolean;
}

export interface AsyncDataResult<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  reload: () => void;
}

interface AsyncState<T> {
  /** The request key the data belongs to; a mismatch means it is stale. */
  key: string;
  status: 'success' | 'error';
  data: T | null;
  error: string | null;
}

/**
 * Loads a panel's data.
 *
 * Components do not fetch directly — they call one of the endpoint functions
 * through this hook, which owns the loading and error state. The loading
 * state is derived from the request key rather than stored, so a stale
 * reading is never shown next to a spinner.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  options: AsyncDataOptions = {},
): AsyncDataResult<T> {
  const { panelId, enabled = true } = options;
  const { reportPanelFailure, reportPanelRecovery } = useConnection();
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<AsyncState<T>>({
    key: '',
    status: 'success',
    data: null,
    error: null,
  });

  const key = JSON.stringify([...deps, nonce]);

  const reload = useCallback(() => {
    setNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    fetcher()
      .then((result) => {
        if (cancelled) return;
        setState({ key, status: 'success', data: result, error: null });
        if (panelId) reportPanelRecovery(panelId);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          key,
          status: 'error',
          data: null,
          error: cause instanceof Error ? cause.message : 'The panel could not be loaded.',
        });
        if (panelId) reportPanelFailure(panelId);
      });

    return () => {
      cancelled = true;
    };
    // `fetcher` is rebuilt on every render; `deps` is what the caller declares
    // it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, panelId, reportPanelFailure, reportPanelRecovery]);

  const isCurrent = state.key === key;

  return {
    data: isCurrent ? state.data : null,
    error: isCurrent ? state.error : null,
    isLoading: enabled && !isCurrent,
    reload,
  };
}
