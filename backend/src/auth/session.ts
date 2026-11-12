import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { UserRole } from '@network-analyser/contracts';

/**
 * The signed session the analyser hands out.
 *
 * A session is a bearer token: a signed statement of who is signed in, for
 * how long, and with what role. It is stateless — the analyser does not keep
 * a session table — so restarting the analyser does not need to invalidate
 * anything, and there is no store to grow.
 *
 * The token is signed, not encrypted: anybody holding it can read the role
 * and the expiry. That is deliberate. The contents are not secret, and
 * signing them means the analyser never has to hold session state at all.
 * What must stay secret is the token itself, and it is only ever sent in the
 * `Authorization` header over the local network.
 */

/** The identity a session carries. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/** An issued session. */
export interface Session {
  user: AuthenticatedUser;
  token: string;
  expiresAt: string;
}

/** The payload carried inside a token. */
interface TokenPayload {
  /** Payload version, so the format can change without ambiguity. */
  v: 1;
  /** User id. */
  sub: string;
  name: string;
  email: string;
  role: UserRole;
  /** Issued-at, seconds since the epoch. */
  iat: number;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

export interface SessionServiceOptions {
  /** Email of the administrator account. */
  adminEmail: string;
  /** Administrator password. Without it, no session can be issued at all. */
  adminPassword?: string | undefined;
  /** Email of the optional read-only account. */
  viewerEmail?: string | undefined;
  /** Password of the optional read-only account. */
  viewerPassword?: string | undefined;
  /** Secret used to sign tokens. */
  secret: string;
  /** How long a session lasts, in hours. */
  ttlHours: number;
  /** Clock, so tests can control time. */
  now?: () => number;
}

/** Token format version, carried in the token itself. */
const TOKEN_VERSION = 'v1';

/**
 * Issues and verifies sessions.
 *
 * The accounts live in the analyser's own configuration rather than in a
 * user table. The analyser runs on the administrator's own machine and has
 * one user to keep track of, so a table of hashed passwords would be more
 * machinery than the job needs — and the environment file it already reads
 * is where a single administrator's details belong.
 */
export class SessionService {
  private readonly options: SessionServiceOptions;
  private readonly now: () => number;

  constructor(options: SessionServiceOptions) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * True when an administrator account exists.
   *
   * An analyser without one can be reached but nobody can sign in to it, so
   * the sign-in screen says so rather than refusing every attempt as though
   * the password were wrong.
   */
  isConfigured(): boolean {
    return typeof this.options.adminPassword === 'string' && this.options.adminPassword.length > 0;
  }

  /**
   * Checks a set of credentials and issues a session.
   *
   * Returns null when the credentials do not match an account. The caller
   * must not distinguish "no such account" from "wrong password" in the
   * reply, or the sign-in screen becomes a way of discovering which
   * addresses exist.
   */
  authenticate(email: string, password: string): Session | null {
    if (!this.isConfigured()) return null;

    const account = this.accounts().find((candidate) => candidate.email === email);
    if (!account) {
      // Hash anyway, so a missing account and a wrong password take the same
      // time and the reply cannot be used to enumerate addresses.
      this.matches(password, DUMMY_PASSWORD);
      return null;
    }

    if (!this.matches(password, account.password)) return null;

    return this.issue({
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
    });
  }

  /**
   * Issues a fresh session for an already-authenticated user.
   *
   * The session endpoint uses this to renew a session: a dashboard left open
   * on the phone stays signed in without the administrator having to sign in
   * again. It is only ever called with a token that is still valid, so this
   * extends a live session rather than resurrecting an expired one.
   */
  issue(user: AuthenticatedUser): Session {
    const issuedAt = Math.floor(this.now() / 1000);
    const expiresAt = issuedAt + this.options.ttlHours * 60 * 60;

    const payload: TokenPayload = {
      v: 1,
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      iat: issuedAt,
      exp: expiresAt,
    };

    const encoded = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
    const signature = base64url(this.sign(`${TOKEN_VERSION}.${encoded}`));

    return {
      user,
      token: `${TOKEN_VERSION}.${encoded}.${signature}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  /**
   * Verifies a token.
   *
   * Returns the identity it carries, or null when the token is malformed,
   * forged, or expired.
   */
  verify(token: string): AuthenticatedUser | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [version, encoded, signature] = parts;
    // A three-part string can still have an empty part in it, so the parts
    // are checked before they are used rather than trusted.
    if (version === undefined || encoded === undefined || signature === undefined) {
      return null;
    }
    if (version !== TOKEN_VERSION) return null;

    const expected = this.sign(`${TOKEN_VERSION}.${encoded}`);
    // The signature travels as base64url, so it is decoded back to the raw
    // bytes before it is compared with the digest.
    const provided = Buffer.from(signature, 'base64url');
    if (provided.length !== expected.length) return null;
    if (!timingSafeEqual(provided, expected)) return null;

    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    } catch {
      return null;
    }

    if (payload.v !== 1) return null;
    if (payload.exp <= Math.floor(this.now() / 1000)) return null;
    if (payload.role !== 'admin' && payload.role !== 'viewer') return null;

    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role,
    };
  }

  /** The accounts this analyser knows about, from its own configuration. */
  private accounts(): Array<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
    password: string;
  }> {
    const accounts: Array<{
      id: string;
      name: string;
      email: string;
      role: UserRole;
      password: string;
    }> = [
      {
        id: userIdFor(this.options.adminEmail, 'admin'),
        name: 'Administrator',
        email: this.options.adminEmail,
        role: 'admin',
        password: this.options.adminPassword ?? '',
      },
    ];

    if (
      typeof this.options.viewerEmail === 'string' &&
      this.options.viewerEmail.length > 0 &&
      typeof this.options.viewerPassword === 'string' &&
      this.options.viewerPassword.length > 0
    ) {
      accounts.push({
        id: userIdFor(this.options.viewerEmail, 'viewer'),
        name: 'Viewer',
        email: this.options.viewerEmail,
        role: 'viewer' as const,
        password: this.options.viewerPassword,
      });
    }

    return accounts;
  }

  /** Signs a message with the session secret. */
  private sign(message: string): Buffer {
    return createHmac('sha256', this.options.secret).update(message).digest();
  }

  /**
   * Compares a supplied password with a stored one.
   *
   * Both sides are hashed first, so the comparison is between two
   * fixed-length digests and the comparison itself does not leak the
   * password's length through its running time.
   */
  private matches(supplied: string, stored: string): boolean {
    const a = createHash('sha256').update(supplied, 'utf8').digest();
    const b = createHash('sha256').update(stored, 'utf8').digest();
    return timingSafeEqual(a, b);
  }
}

/**
 * A password that never matches anything.
 *
 * Hashing against it keeps the time taken to reject a missing account the
 * same as the time taken to reject a wrong password.
 */
const DUMMY_PASSWORD = 'no-such-account';

/** Encodes a buffer as URL-safe base64 without padding. */
function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/**
 * A stable user id for an account.
 *
 * Derived from the address and the role, so the same account keeps the same
 * id across restarts — the dashboard can therefore remember which device
 * name belonged to which id — while an administrator and a viewer on the
 * same address are still two different users.
 */
function userIdFor(email: string, role: UserRole): string {
  const digest = createHash('sha256').update(`${role}:${email}`, 'utf8').digest();

  // Shaped as a UUIDv4 so it satisfies the shared contract's id schema.
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A secret for an analyser that was not given one.
 *
 * Tokens then stop working when the analyser restarts, which is the safe
 * direction to fail: a session that cannot outlive the process is one fewer
 * thing to reason about.
 */
export function randomSessionSecret(): string {
  return randomBytes(32).toString('hex');
}
