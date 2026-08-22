import { query } from '../db.js';

/**
 * Append to the audit trail.
 *
 * Never awaited by callers on the request path and never allowed to throw:
 * a failure to record that something happened must not prevent the thing
 * from happening, or roll back the transaction that did it. Failures go to
 * stderr where the platform's log collector picks them up.
 *
 * Pass `client` to enlist in a caller's transaction where the log genuinely
 * must be atomic with the change — role changes and approvals do this, so
 * an applied change always has a corresponding entry.
 */
export function logAudit({ eventType, userId = null, ip = null, metadata = {} }, client = null) {
  const sql = `INSERT INTO audit_logs (event_type, user_id, ip_address, metadata)
               VALUES ($1, $2, $3, $4)`;
  const params = [eventType, userId, ip, metadata];

  if (client) return client.query(sql, params);

  return query(sql, params).catch((err) => {
    console.error('[audit] failed to record event', eventType, err);
  });
}

/**
 * Record a login attempt. Both outcomes are written: the failures drive the
 * rate limiter, and the successes are what make the security page's
 * "recent activity" list meaningful.
 */
export function logLoginAttempt({ email, ip, success }) {
  return query(
    `INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2, $3)`,
    [email?.toLowerCase() ?? '', ip, success],
  ).catch((err) => console.error('[audit] failed to record login attempt', err));
}

const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_EMAIL = 8;
const MAX_FAILURES_PER_IP = 25;

/**
 * Fail-closed-ish rate limit on failed logins, counted per email and per
 * IP over a rolling window.
 *
 * Two limits rather than one: the per-email limit stops an attacker
 * grinding a single known account from many addresses, and the per-IP
 * limit — set higher, because a shared pharmacy connection may legitimately
 * carry several people — stops one host spraying many accounts.
 *
 * Only failures count, so a busy pharmacy signing in successfully all day
 * never trips it.
 */
export async function checkLoginRateLimit(email, ip) {
  const { rows } = await query(
    `SELECT
       count(*) FILTER (WHERE LOWER(email) = LOWER($1))                  AS email_failures,
       count(*) FILTER (WHERE ip_address IS NOT NULL AND ip_address = $2) AS ip_failures
     FROM login_attempts
     WHERE success = false
       AND attempted_at > now() - ($3 || ' minutes')::interval`,
    [email ?? '', ip, String(WINDOW_MINUTES)],
  );

  const { email_failures: emailFailures, ip_failures: ipFailures } = rows[0];
  return {
    limited: emailFailures >= MAX_FAILURES_PER_EMAIL || ipFailures >= MAX_FAILURES_PER_IP,
    retryAfterMinutes: WINDOW_MINUTES,
  };
}
