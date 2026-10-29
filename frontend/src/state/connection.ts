import type { SystemInfo } from '@network-analyser/contracts';

/**
 * Connection state towards the analyser.
 *
 * The phone can lose the LAN — the administrator walks out of Wi-Fi range, or
 * the laptop sleeps. Each state has a distinct presentation, and an
 * unreachable analyser must never be rendered as zeroes: an idle network and
 * an unreachable analyser look identical on screen.
 */
export type ConnectionStatus = 'connecting' | 'loaded' | 'unreachable' | 'partial';

export interface ConnectionState {
  status: ConnectionStatus;
  /** Last successful reading of `GET /api/system/info`. */
  info: SystemInfo | null;
  /** Why the last poll failed, when it did. */
  error: string | null;
  /** True while a poll is in flight. */
  pending: boolean;
  /** Epoch millis of the last completed poll. */
  lastCheckedAt: number | null;
  /** Panels that failed to load while the analyser itself is reachable. */
  failedPanels: string[];
}

export const initialConnectionState: ConnectionState = {
  status: 'connecting',
  info: null,
  error: null,
  pending: true,
  lastCheckedAt: null,
  failedPanels: [],
};

export type ConnectionAction =
  | { type: 'poll-started' }
  | { type: 'poll-succeeded'; info: SystemInfo; checkedAt: number }
  | { type: 'poll-failed'; error: string; checkedAt: number }
  | { type: 'panel-failed'; panelId: string }
  | { type: 'panel-recovered'; panelId: string };

/** Derives the status from the other fields rather than storing it twice. */
export function deriveStatus(state: Omit<ConnectionState, 'status'>): ConnectionStatus {
  if (state.pending) return 'connecting';
  if (state.error !== null) return 'unreachable';
  if (state.info === null) return 'connecting';
  return state.failedPanels.length > 0 ? 'partial' : 'loaded';
}

export function connectionReducer(state: ConnectionState, action: ConnectionAction): ConnectionState {
  switch (action.type) {
    case 'poll-started': {
      const next = { ...state, pending: true, error: null };
      return { ...next, status: deriveStatus(next) };
    }

    case 'poll-succeeded': {
      const next = {
        ...state,
        pending: false,
        info: action.info,
        error: null,
        lastCheckedAt: action.checkedAt,
      };
      return { ...next, status: deriveStatus(next) };
    }

    case 'poll-failed': {
      // The last known reading is kept only so the UI can name the analyser
      // and its address; panels still refuse to render values in this state.
      const next = {
        ...state,
        pending: false,
        error: action.error,
        lastCheckedAt: action.checkedAt,
      };
      return { ...next, status: deriveStatus(next) };
    }

    case 'panel-failed': {
      if (state.failedPanels.includes(action.panelId)) return state;
      const next = { ...state, failedPanels: [...state.failedPanels, action.panelId] };
      return { ...next, status: deriveStatus(next) };
    }

    case 'panel-recovered': {
      if (!state.failedPanels.includes(action.panelId)) return state;
      const next = {
        ...state,
        failedPanels: state.failedPanels.filter((id) => id !== action.panelId),
      };
      return { ...next, status: deriveStatus(next) };
    }

    default:
      return state;
  }
}
