/**
 * Where the analyser lives.
 *
 * The API base URL is not fixed: the analyser runs on the administrator's
 * laptop, whose LAN address changes when the DHCP lease renews. The value is
 * therefore editable in Settings and persisted in localStorage.
 */

export const API_BASE_URL_STORAGE_KEY = 'network-analyser.api-base-url';

/** Works on the laptop, where the analyser binds loopback. */
export const DEFAULT_API_BASE_URL = 'http://localhost:3000';

/** Trims a trailing slash so paths can be appended without doubling up. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** True when the value is an absolute http(s) URL. */
export function isValidBaseUrl(url: string): boolean {
  const candidate = normalizeBaseUrl(url);
  if (candidate === '') return false;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Reads the persisted base URL, falling back to the default. */
export function readApiBaseUrl(): string {
  try {
    const stored = window.localStorage.getItem(API_BASE_URL_STORAGE_KEY);
    if (stored && isValidBaseUrl(stored)) return normalizeBaseUrl(stored);
  } catch {
    // Private-mode browsers can throw on localStorage access; the default
    // remains usable.
  }
  return DEFAULT_API_BASE_URL;
}

/** Persists the base URL. Invalid values are rejected by the caller. */
export function writeApiBaseUrl(url: string): void {
  window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalizeBaseUrl(url));
}

/** Clears the override so the next read returns the default. */
export function clearApiBaseUrl(): void {
  window.localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
}
