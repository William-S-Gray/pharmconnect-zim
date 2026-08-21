import { resolveSession, SESSION_COOKIE } from './session.js';
import { unauthorized, forbidden, wrap } from '../lib/errors.js';
import { isSuperAdmin } from '../lib/authz.js';

/**
 * Attaches req.user when a valid session cookie is present, and does
 * nothing when it is not. Mounted globally so public routes can vary their
 * behaviour for signed-in callers (search logging attributes a user id)
 * without forcing authentication.
 */
export const attachUser = wrap(async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = await resolveSession(token);
  if (session) {
    req.user = {
      id: session.user_id,
      email: session.email,
      full_name: session.full_name,
      avatar_url: session.avatar_url,
      // Read fresh from profiles on every request. This is the single
      // most important line in the auth layer: it is what makes a role
      // change or a suspension effective immediately, and what stops the
      // client from ever being the source of its own role.
      global_role: session.global_role,
      lifecycle_status: session.lifecycle_status,
      mfa_enabled: Boolean(session.mfa_confirmed_at),
    };
    req.sessionToken = token;
  }
  next();
});

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireSuperAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!isSuperAdmin(req.user)) return next(forbidden('Super administrator access required'));
  next();
}

/**
 * The client's IP, used for the login rate limiter and the audit trail.
 *
 * X-Forwarded-For is only consulted when TRUST_PROXY is set, because any
 * caller can send that header. Honouring it on a directly-exposed server
 * would let an attacker rotate their apparent address per request and walk
 * straight past the rate limit.
 */
export function clientIp(req) {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}
