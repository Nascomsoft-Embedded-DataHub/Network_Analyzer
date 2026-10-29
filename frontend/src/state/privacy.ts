/**
 * Privacy acknowledgment state.
 *
 * The roadmap's notice requirement is a UI surface, not a legal footnote: the
 * administrator must acknowledge that the analyser is being used on a network
 * they are authorized to observe, before any device inventory is displayed.
 */

export const PRIVACY_ACKNOWLEDGED_STORAGE_KEY = 'network-analyser.privacy-acknowledged';
export const PRIVACY_ACKNOWLEDGED_AT_STORAGE_KEY = 'network-analyser.privacy-acknowledged-at';

export function readPrivacyAcknowledged(): boolean {
  try {
    return window.localStorage.getItem(PRIVACY_ACKNOWLEDGED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** When the acknowledgment was given, for display on the settings page. */
export function readPrivacyAcknowledgedAt(): string | null {
  try {
    return window.localStorage.getItem(PRIVACY_ACKNOWLEDGED_AT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writePrivacyAcknowledged(acknowledged: boolean): void {
  if (acknowledged) {
    window.localStorage.setItem(PRIVACY_ACKNOWLEDGED_STORAGE_KEY, 'true');
    window.localStorage.setItem(PRIVACY_ACKNOWLEDGED_AT_STORAGE_KEY, new Date().toISOString());
  } else {
    window.localStorage.removeItem(PRIVACY_ACKNOWLEDGED_STORAGE_KEY);
    window.localStorage.removeItem(PRIVACY_ACKNOWLEDGED_AT_STORAGE_KEY);
  }
}
