import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { getSystemInfo } from '@/api/endpoints';
import {
  connectionReducer,
  initialConnectionState,
  type ConnectionState,
} from '@/state/connection';
import { useApiConfig } from './ApiConfigProvider';

export interface ConnectionContextValue extends ConnectionState {
  /** Re-runs the system poll immediately. */
  retry: () => void;
  /** Marks a panel as failed, moving the dashboard into the partial state. */
  reportPanelFailure: (panelId: string) => void;
  reportPanelRecovery: (panelId: string) => void;
}

/** How often the dashboard asks the analyser to identify itself. */
const POLL_INTERVAL_MS = 15_000;

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const { baseUrl } = useApiConfig();
  const [state, dispatch] = useReducer(connectionReducer, initialConnectionState);

  const poll = useCallback(async (showPending: boolean) => {
    if (showPending) dispatch({ type: 'poll-started' });
    try {
      const response = await getSystemInfo();
      dispatch({ type: 'poll-succeeded', info: response.data, checkedAt: Date.now() });
    } catch (error) {
      dispatch({
        type: 'poll-failed',
        error: error instanceof Error ? error.message : 'The analyser could not be reached.',
        checkedAt: Date.now(),
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const runPoll = async (showPending: boolean) => {
      if (cancelled) return;
      await poll(showPending);
    };

    void runPoll(true);
    // Background polls do not flip the dashboard back to the loading state —
    // replacing live panels with skeletons every 15 seconds would be worse
    // than showing the last reading.
    const timer = setInterval(() => {
      void runPoll(false);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [baseUrl, poll]);

  const retry = useCallback(() => {
    void poll(true);
  }, [poll]);

  const reportPanelFailure = useCallback((panelId: string) => {
    dispatch({ type: 'panel-failed', panelId });
  }, []);

  const reportPanelRecovery = useCallback((panelId: string) => {
    dispatch({ type: 'panel-recovered', panelId });
  }, []);

  const value = useMemo<ConnectionContextValue>(
    () => ({ ...state, retry, reportPanelFailure, reportPanelRecovery }),
    [reportPanelFailure, reportPanelRecovery, retry, state],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionContextValue {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used inside a ConnectionProvider.');
  }
  return context;
}
