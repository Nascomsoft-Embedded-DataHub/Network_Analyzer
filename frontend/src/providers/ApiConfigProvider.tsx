import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SystemInfo } from '@network-analyser/contracts';
import { getSystemInfo } from '@/api/endpoints';
import { USE_MOCKS } from '@/api/config';
import {
  DEFAULT_API_BASE_URL,
  clearApiBaseUrl,
  isValidBaseUrl,
  normalizeBaseUrl,
  readApiBaseUrl,
  writeApiBaseUrl,
} from '@/state/apiConfig';

export type ConnectionTestResult =
  | { ok: true; info: SystemInfo }
  | { ok: false; message: string };

export interface ApiConfigContextValue {
  /** The analyser address the dashboard talks to. */
  baseUrl: string;
  /** True when responses come from the contract fixtures. */
  isMock: boolean;
  /** Persists a new base URL. Throws when the URL is not usable. */
  setBaseUrl: (url: string) => void;
  resetBaseUrl: () => void;
  /**
   * Asks the analyser to identify itself. Pass a URL to test an address that
   * has not been saved yet.
   */
  testConnection: (url?: string) => Promise<ConnectionTestResult>;
}

const ApiConfigContext = createContext<ApiConfigContextValue | null>(null);

export function ApiConfigProvider({ children }: { children: ReactNode }) {
  const [baseUrl, setBaseUrlState] = useState<string>(() => readApiBaseUrl());

  const setBaseUrl = useCallback((url: string) => {
    const normalized = normalizeBaseUrl(url);
    if (!isValidBaseUrl(normalized)) {
      throw new Error('Enter a full address, for example http://192.168.1.24:3000');
    }
    writeApiBaseUrl(normalized);
    setBaseUrlState(normalized);
  }, []);

  const resetBaseUrl = useCallback(() => {
    clearApiBaseUrl();
    setBaseUrlState(DEFAULT_API_BASE_URL);
  }, []);

  const testConnection = useCallback(
    async (url?: string): Promise<ConnectionTestResult> => {
      try {
        const response = await getSystemInfo(
          url === undefined ? undefined : { baseUrl: normalizeBaseUrl(url) },
        );
        return { ok: true, info: response.data };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'The analyser could not be reached.',
        };
      }
    },
    [],
  );

  const value = useMemo<ApiConfigContextValue>(
    () => ({ baseUrl, isMock: USE_MOCKS, setBaseUrl, resetBaseUrl, testConnection }),
    [baseUrl, resetBaseUrl, setBaseUrl, testConnection],
  );

  return <ApiConfigContext.Provider value={value}>{children}</ApiConfigContext.Provider>;
}

export function useApiConfig(): ApiConfigContextValue {
  const context = useContext(ApiConfigContext);
  if (!context) {
    throw new Error('useApiConfig must be used inside an ApiConfigProvider.');
  }
  return context;
}
