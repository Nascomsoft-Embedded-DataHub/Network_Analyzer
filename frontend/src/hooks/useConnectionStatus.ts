import { useConnection } from '@/providers/ConnectionProvider';

export interface ConnectionStatusSummary {
  status: 'connecting' | 'loaded' | 'unreachable' | 'partial';
  isLoading: boolean;
  isReachable: boolean;
}

/** Convenience selector over the connection provider. */
export function useConnectionStatus(): ConnectionStatusSummary {
  const { status } = useConnection();
  return {
    status,
    isLoading: status === 'connecting',
    isReachable: status === 'loaded' || status === 'partial',
  };
}
