import crypto from 'node:crypto';
import { env } from '../env.js';
import { query, queryOne } from '../db.js';

export const SESSION_COOKIE = 'pc_session';

/**
 * Sessions are opaque random tokens, stored hashed.
 *
 * The gate-1 audit's root cause was a bearer token that carried its own
 * authority: the Supabase JWT embedded user_metadata, the user could
 * rewrite that metadata, and both the client and the RLS policies believed
 * it. An opaque token asserts nothing — every request re-reads the role
 * from profiles — so there is no claim to forge, and revocation is a row
 * update rather than a wait for expiry.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId, { ip, userAgent } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 86_400_000);

  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), expiresAt, ip ?? null, userAgent?.slice(0, 500) ?? null],
  );

  return { token, expiresAt };
}

/**
 * Resolve a raw cookie value to the session's user, or null.
 *
 * Returns the role and lifecycle state alongside, because every
 * authorization decision needs them and re-reading per request is what
 * makes a role change or a suspension take effect immediately instead of
 * whenever the client's cached token happens to expire.
 */
export async function resolveSession(token) {
  if (!token) return null;

  const row = await queryOne(
    `SELECT s.id            AS session_id,
            u.id            AS user_id,
            u.email,
            u.mfa_confirmed_at,
            p.full_name,
            p.avatar_url,
            p.global_role,
            p.lifecycle_status
       FROM sessions s
       JOIN app_users u ON u.id = s.user_id
       LEFT JOIN profiles p ON p.id = u.id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()`,
    [hashToken(token)],
  );

  if (!row) return null;

  // A trashed or deleted profile keeps its session rows until they expire.
  // Checking here means deactivating an account takes effect on the very
  // next request rather than at the end of its 30-day session.
  if (row.lifecycle_status && row.lifecycle_status !== 'ACTIVE') return null;

  // Cheap liveness signal for the security page's "active sessions" list.
  // Throttled to once a minute so an idle SSE stream does not write on
  // every poll.
  query(
    `UPDATE sessions SET last_seen_at = now()
      WHERE id = $1 AND last_seen_at < now() - INTERVAL '1 minute'`,
    [row.session_id],
  ).catch((err) => console.error('[session] last_seen update failed', err));

  return row;
}

export async function revokeSession(token) {
  if (!token) return;
  await query(
    `UPDATE sessions SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(token)],
  );
}

/**
 * Revoke every session for a user, optionally sparing the current one.
 *
 * Called on password change and from the "sign out other devices" control.
 * A password change that leaves old sessions alive does not actually evict
 * whoever prompted the change.
 */
export async function revokeAllSessions(userId, { exceptToken } = {}) {
  await query(
    `UPDATE sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND ($2::text IS NULL OR token_hash <> $2)`,
    [userId, exceptToken ? hashToken(exceptToken) : null],
  );
}

export function cookieOptions(expiresAt) {
  return {
    httpOnly: true,           // unreadable from JavaScript, so XSS cannot exfiltrate it
    secure: env.isProd,       // HTTPS-only in production
    sameSite: env.isProd ? 'none' : 'lax', // 'none' for a separately-hosted SPA origin
    path: '/',
    expires: expiresAt,
  };
}

/** Best-effort cleanup; sessions are also filtered by expiry on read. */
export async function purgeExpiredSessions() {
  const { rowCount } = await query(
    `DELETE FROM sessions
      WHERE expires_at < now() - INTERVAL '7 days'
         OR (revoked_at IS NOT NULL AND revoked_at < now() - INTERVAL '7 days')`,
  );
  return rowCount;
}
