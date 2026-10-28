import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { readPrivacyAcknowledged, writePrivacyAcknowledged } from '@/state/privacy';

export interface PrivacyContextValue {
  /** True once the administrator has acknowledged the notice. */
  acknowledged: boolean;
  acknowledge: () => void;
  /** Withdraws the acknowledgment, so the notice blocks again. */
  revoke: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [acknowledged, setAcknowledged] = useState<boolean>(() => readPrivacyAcknowledged());

  const acknowledge = useCallback(() => {
    writePrivacyAcknowledged(true);
    setAcknowledged(true);
  }, []);

  const revoke = useCallback(() => {
    writePrivacyAcknowledged(false);
    setAcknowledged(false);
  }, []);

  const value = useMemo<PrivacyContextValue>(
    () => ({ acknowledged, acknowledge, revoke }),
    [acknowledge, acknowledged, revoke],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyContextValue {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error('usePrivacy must be used inside a PrivacyProvider.');
  }
  return context;
}
