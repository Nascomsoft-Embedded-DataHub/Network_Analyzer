/**
 * How a device is identified within the analyser's records.
 *
 * The identity of a network device is normally its hardware address. That
 * assumption does not survive contact with a Starlink router, which reports
 * the vendor OUI and blanks the rest of the address, so several devices can
 * arrive wearing one address. The key therefore records *which* identifier a
 * row is anchored to, and is upgraded in place when a stronger one is
 * learned.
 */

/** The identifier a row is anchored to. */
export type IdentityBasis = 'mac' | 'cid' | 'ip';

/** A full hardware address — the strongest basis. */
export const MAC_BASIS: IdentityBasis = 'mac';
/** The router's own client id — survives MAC masking. */
export const CLIENT_ID_BASIS: IdentityBasis = 'cid';
/** The network address — the last resort. */
export const IP_BASIS: IdentityBasis = 'ip';

/** The key for a device identified by its hardware address. */
export function macIdentityKey(mac: string): string {
  return `mac:${mac}`;
}

/** The key for a device identified by the router's client id. */
export function clientIdIdentityKey(clientId: number): string {
  return `cid:${clientId}`;
}

/** The key for a device identified only by its network address. */
export function ipIdentityKey(ip: string): string {
  return `ip:${ip}`;
}

/**
 * The key for an observation that carries no identifier at all.
 *
 * Such an observation is not a device that can be tracked — there is nothing
 * to record it by — so it is counted and dropped rather than given a
 * fabricated identity.
 */
export const UNIDENTIFIABLE_KEY = 'unknown:unidentifiable';

/** The basis a key is built on. */
export function identityBasis(identityKey: string): IdentityBasis {
  if (identityKey.startsWith(`${MAC_BASIS}:`)) return MAC_BASIS;
  if (identityKey.startsWith(`${CLIENT_ID_BASIS}:`)) return CLIENT_ID_BASIS;
  return IP_BASIS;
}

/**
 * How strong a basis is.
 *
 * A row is only re-anchored to a stronger basis, never to a weaker one, so a
 * device that is briefly seen only through a masking router does not lose the
 * hardware address it was already known by.
 */
const BASIS_STRENGTH: Record<IdentityBasis, number> = {
  [IP_BASIS]: 1,
  [CLIENT_ID_BASIS]: 2,
  [MAC_BASIS]: 3,
};

/** True when `candidate` is a stronger basis than `current`. */
export function isStrongerBasis(candidate: IdentityBasis, current: IdentityBasis): boolean {
  return BASIS_STRENGTH[candidate] > BASIS_STRENGTH[current];
}
