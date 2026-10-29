/**
 * Address normalisation shared by every discovery source.
 *
 * Sources disagree about how to write a MAC address — `aa-bb-cc-dd-ee-ff`,
 * `AA:BB:CC:DD:EE:FF`, `aabb.ccdd.eeff` — and the shared contract demands the
 * upper-case colon form. Normalising at the edge means every later stage can
 * compare addresses as plain strings.
 */

/** The form the shared contract requires. */
const CANONICAL_MAC = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

/**
 * Normalise a hardware address to upper-case colon form.
 *
 * Returns `null` for anything that is not a six-octet MAC, so a source that
 * reports an empty or malformed address yields a client with no MAC rather
 * than a plausible-looking wrong one.
 */
export function normalizeMac(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.trim().replace(/[\s:.-]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(compact)) return null;
  const octets: string[] = [];
  for (let index = 0; index < 12; index += 2) {
    octets.push(compact.slice(index, index + 2));
  }
  const formatted = octets.join(':');
  return CANONICAL_MAC.test(formatted) ? formatted : null;
}

/**
 * The vendor OUI of a MAC, as six hex digits with no separators.
 *
 * This is the lookup key the IEEE registry is keyed by. `null` when the MAC is
 * unparseable.
 */
export function macOui(mac: string | null | undefined): string | null {
  const normalized = normalizeMac(mac);
  if (!normalized) return null;
  return normalized.slice(0, 8).replace(/:/g, '');
}

/** The last three octets of a MAC, as a short human-facing discriminator. */
export function macShortId(mac: string | null | undefined): string | null {
  const normalized = normalizeMac(mac);
  if (!normalized) return null;
  return normalized.slice(9);
}

/**
 * True when the address is one that never identifies a real device on the
 * monitored network.
 */
export function isUnroutableIpv4(ip: string | null | undefined): boolean {
  if (!ip) return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip.startsWith('224.')) return true;
  if (ip.startsWith('0.')) return true;
  return false;
}

/** True for IPv4 addresses in the reserved, non-device ranges. */
export function isPrivateIpv4(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}
