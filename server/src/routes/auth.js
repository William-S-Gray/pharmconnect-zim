import crypto from 'node:crypto';
import express from 'express';
import { z, parse, email as emailSchema, password as passwordSchema, displayName } from '../lib/validate.js';
import { queryOne, queryAll, query, transaction } from '../db.js';
import { hashPassword, verifyPassword, dummyVerify } from '../auth/password.js';
import {
  createSession, revokeSession, revokeAllSessions,
  cookieOptions, SESSION_COOKIE,
} from '../auth/session.js';
import { generateSecret, verifyTotp, otpauthUrl } from '../auth/totp.js';
import { requireAuth, clientIp } from '../auth/middleware.js';
import {
  signupLimit, passwordForgotIpLimit, passwordForgotEmailLimit, passwordResetLimit,
} from '../lib/rateLimit.js';
import { logAudit, logLoginAttempt, checkLoginRateLimit } from '../lib/audit.js';
import { membershipsOf } from '../lib/authz.js';
import { wrap, unauthorized, badRequest, tooMany, conflict, notFound } from '../lib/errors.js';
import { env, googleOAuthConfigured } from '../env.js';
import {
  sendPasswordReset, sendPasswordChanged, sendNewPharmacyAlert,
} from '../lib/emails.js';

export const authRouter = express.Router();

const TOKEN_TTL_MINUTES = 60;

function hashAuthToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * The payload the SPA needs to render a signed-in shell: identity, role,
 * and the pharmacy they act for.
 *
 * This replaces the get_user_auth_data() RPC. That function accepted a
 * caller-supplied user id and ran SECURITY DEFINER, so it would return any
 * user's profile and pharmacy to anyone who asked. Here the id is the
 * session's and there is no parameter to abuse.
 */
async function buildAuthPayload(userId) {
  // One round trip, not four.
  //
  // This is the most-called query in the application — the SPA calls
  // /api/auth/me on every page load — and it used to be a sequential chain
  // of profile, then memberships, then pharmacy. Against Neon that is four
  // round trips including the session lookup, and at ~275ms of network
  // latency each from Zimbabwe it put over a second in front of every
  // single navigation. Measured by running the app, not guessed at.
  const row = await queryOne(
    `WITH me AS (
       SELECT p.id, p.email, p.full_name, p.avatar_url, p.global_role, p.lifecycle_status,
              (u.mfa_confirmed_at IS NOT NULL) AS mfa_enabled
         FROM profiles p
         JOIN app_users u ON u.id = p.id
        WHERE p.id = $1
     ),
     mine AS (
       SELECT m.id, m.role, m.pharmacy_id, m.created_at,
              ph.name AS pharmacy_name, ph.status
         FROM memberships m
         JOIN pharmacies ph ON ph.id = m.pharmacy_id
        WHERE m.user_id = $1
        ORDER BY m.created_at ASC
     ),
     primary_pharmacy AS (
       SELECT ph.id, ph.name, ph.email, ph.phone, ph.city, ph.suburb,
              ph.status, ph.plan_tier, ph.lat, ph.lng
         FROM mine
         JOIN pharmacies ph ON ph.id = mine.pharmacy_id
        LIMIT 1
     )
     SELECT to_jsonb(me.*)                       AS profile,
            (SELECT role FROM mine LIMIT 1)      AS primary_role,
            (SELECT to_jsonb(pp.*) FROM primary_pharmacy pp) AS pharmacy,
            COALESCE(
              (SELECT json_agg(json_build_object(
                 'id', mine.id, 'role', mine.role, 'pharmacy_id', mine.pharmacy_id,
                 'pharmacy_name', mine.pharmacy_name, 'status', mine.status))
                 FROM mine),
              '[]'::json
            ) AS memberships
       FROM me`,
    [userId],
  );

  if (!row?.profile) return null;

  return {
    profile: row.profile,
    // The role the UI gates on: the global role wins when it is
    // super_admin, otherwise the role held at the active pharmacy.
    role: row.profile.global_role === 'super_admin'
      ? 'super_admin'
      : row.primary_role ?? row.profile.global_role,
    pharmacy: row.pharmacy,
    memberships: row.memberships,
  };
}

// ------------------------------------------------------------------
// Registration
// ------------------------------------------------------------------

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  full_name: displayName(120),
  pharmacy: z
    .object({
      name: displayName(160),
      email: emailSchema,
      phone: z.string().trim().max(40).optional(),
      whatsapp_number: z.string().trim().max(40).optional(),
      address: z.string().trim().max(300).optional(),
      city: z.string().trim().max(80).default('Harare'),
      suburb: z.string().trim().max(80).optional(),
      mcaz_license: z.string().trim().max(80).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    })
    .optional(),
});

authRouter.post('/register', signupLimit, wrap(async (req, res) => {
  const body = parse(registerSchema, req.body);

  const existing = await queryOne(`SELECT id FROM app_users WHERE LOWER(email) = $1`, [body.email]);
  if (existing) throw conflict('An account with that email already exists');

  const passwordHash = await hashPassword(body.password);

  const result = await transaction(async (client) => {
    const { rows: [user] } = await client.query(
      `INSERT INTO app_users (email, password_hash) VALUES ($1, $2) RETURNING id`,
      [body.email, passwordHash],
    );

    // Registering a pharmacy makes you its admin; a bare signup does not.
    // global_role is set here by the server and is never accepted from the
    // request body — that field was the target of the gate-1 escalation.
    const isPharmacyOwner = Boolean(body.pharmacy);
    await client.query(
      `INSERT INTO profiles (id, email, full_name, global_role) VALUES ($1, $2, $3, $4)`,
      [user.id, body.email, body.full_name, isPharmacyOwner ? 'pharmacy_admin' : 'pharmacy_staff'],
    );

    let pharmacyId = null;
    if (body.pharmacy) {
      const p = body.pharmacy;
      const { rows: [pharmacy] } = await client.query(
        `INSERT INTO pharmacies
           (name, email, phone, whatsapp_number, address, city, suburb, mcaz_license, lat, lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [p.name, p.email, p.phone ?? null, p.whatsapp_number ?? null, p.address ?? null,
         p.city, p.suburb ?? null, p.mcaz_license ?? null, p.lat ?? null, p.lng ?? null],
      );
      pharmacyId = pharmacy.id;

      await client.query(
        `INSERT INTO memberships (user_id, pharmacy_id, role) VALUES ($1, $2, 'pharmacy_admin')`,
        [user.id, pharmacyId],
      );
    }

    // Accept any outstanding invitations addressed to this email. Doing it
    // in the same transaction means a new hire is a member of their
    // pharmacy the instant the account exists, with no second step that
    // could fail and leave them stranded.
    const { rows: invites } = await client.query(
      `UPDATE invitations
          SET status = 'ACCEPTED'
        WHERE LOWER(email) = $1 AND status = 'PENDING' AND expires_at > now()
        RETURNING pharmacy_id, role`,
      [body.email],
    );
    for (const invite of invites) {
      await client.query(
        `INSERT INTO memberships (user_id, pharmacy_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, pharmacy_id) DO NOTHING`,
        [user.id, invite.pharmacy_id, invite.role],
      );
    }

    await logAudit({
      eventType: 'user_registered',
      userId: user.id,
      ip: clientIp(req),
      metadata: { pharmacy_id: pharmacyId, via_invite: invites.length > 0 },
    }, client);

    return user;
  });

  const { token, expiresAt } = await createSession(result.id, {
    ip: clientIp(req),
    userAgent: req.get('user-agent'),
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));

  // Not awaited: a pharmacy that registered successfully must not see an
  // error because an administrator's alert bounced. Moved here from the
  // browser, where it depended on the client remembering to call it.
  if (body.pharmacy) {
    sendNewPharmacyAlert({
      pharmacyName: body.pharmacy.name,
      pharmacyEmail: body.pharmacy.email,
      city: body.pharmacy.city,
    });
  }

  res.status(201).json(await buildAuthPayload(result.id));
}));

// ------------------------------------------------------------------
// Login
// ------------------------------------------------------------------

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  totp: z.string().trim().optional(),
});

authRouter.post('/login', wrap(async (req, res) => {
  const body = parse(loginSchema, req.body);
  const ip = clientIp(req);

  const { limited, retryAfterMinutes } = await checkLoginRateLimit(body.email, ip);
  if (limited) {
    throw tooMany(`Too many failed attempts. Try again in ${retryAfterMinutes} minutes.`);
  }

  const user = await queryOne(
    `SELECT u.id, u.email, u.password_hash, u.mfa_secret, u.mfa_confirmed_at,
            p.lifecycle_status
       FROM app_users u
       LEFT JOIN profiles p ON p.id = u.id
      WHERE LOWER(u.email) = $1`,
    [body.email],
  );

  // Spend the same time on an unknown email as on a known one, so response
  // latency does not reveal which addresses have accounts.
  if (!user || !user.password_hash) {
    await dummyVerify();
    await logLoginAttempt({ email: body.email, ip, success: false });
    throw unauthorized('Invalid email or password');
  }

  const ok = await verifyPassword(body.password, user.password_hash);
  if (!ok) {
    await logLoginAttempt({ email: body.email, ip, success: false });
    throw unauthorized('Invalid email or password');
  }

  if (user.lifecycle_status && user.lifecycle_status !== 'ACTIVE') {
    await logLoginAttempt({ email: body.email, ip, success: false });
    throw unauthorized('This account is no longer active');
  }

  // Second factor, when enrolled. Checked after the password so an
  // attacker without the password learns nothing about whether MFA is on.
  if (user.mfa_confirmed_at) {
    if (!body.totp) {
      // Not a failed attempt: the password was right and the client simply
      // has not been asked for the code yet. Counting it would let anyone
      // knowing one password lock the account out.
      return res.status(200).json({ mfa_required: true });
    }
    if (!verifyTotp(user.mfa_secret, body.totp)) {
      await logLoginAttempt({ email: body.email, ip, success: false });
      throw unauthorized('Invalid authentication code');
    }
  }

  const { token, expiresAt } = await createSession(user.id, {
    ip,
    userAgent: req.get('user-agent'),
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));

  await query(`UPDATE app_users SET last_login_at = now() WHERE id = $1`, [user.id]);
  await logLoginAttempt({ email: body.email, ip, success: true });
  logAudit({ eventType: 'user_login', userId: user.id, ip });

  res.json(await buildAuthPayload(user.id));
}));

authRouter.post('/logout', wrap(async (req, res) => {
  await revokeSession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(new Date(0)), expires: undefined });
  res.status(204).end();
}));

authRouter.get('/me', wrap(async (req, res) => {
  // 200 with null rather than 401: the SPA calls this on every boot to
  // decide whether to show the app or the login page, and a 401 there is
  // an expected state, not an error worth logging as one.
  if (!req.user) return res.json(null);
  res.json(await buildAuthPayload(req.user.id));
}));

// ------------------------------------------------------------------
// Password management
// ------------------------------------------------------------------

authRouter.post(
  '/password/forgot',
  passwordForgotIpLimit,
  passwordForgotEmailLimit,
  wrap(async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);

    const user = await queryOne(`SELECT id FROM app_users WHERE LOWER(email) = $1`, [email]);

    if (user) {
      const token = crypto.randomBytes(32).toString('base64url');
      await query(
        `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
         VALUES ($1, 'password_reset', $2, now() + ($3 || ' minutes')::interval)`,
        [user.id, hashAuthToken(token), String(TOKEN_TTL_MINUTES)],
      );
      logAudit({ eventType: 'password_reset_requested', userId: user.id, ip: clientIp(req) });

      // Awaited so a provider failure is logged against this request rather
      // than surfacing as an unhandled rejection later. sendMail never
      // throws, so this cannot change the response.
      await sendPasswordReset({ to: email, token, expiresInMinutes: TOKEN_TTL_MINUTES });
    }

    // Always the same response. Varying it by whether the account exists
    // turns this endpoint into an account enumeration oracle.
    res.json({ ok: true });
  }),
);

authRouter.post('/password/reset', passwordResetLimit, wrap(async (req, res) => {
  const body = parse(
    z.object({ token: z.string().min(1), password: passwordSchema }),
    req.body,
  );

  const row = await queryOne(
    `SELECT id, user_id FROM auth_tokens
      WHERE token_hash = $1 AND purpose = 'password_reset'
        AND consumed_at IS NULL AND expires_at > now()`,
    [hashAuthToken(body.token)],
  );
  if (!row) throw badRequest('This reset link is invalid or has expired');

  const passwordHash = await hashPassword(body.password);

  await transaction(async (client) => {
    // Consume the token in the same transaction that changes the password,
    // conditioned on it still being unconsumed. Two requests racing with
    // the same link therefore cannot both succeed.
    const { rowCount } = await client.query(
      `UPDATE auth_tokens SET consumed_at = now()
        WHERE id = $1 AND consumed_at IS NULL`,
      [row.id],
    );
    if (rowCount === 0) throw badRequest('This reset link has already been used');

    await client.query(`UPDATE app_users SET password_hash = $1 WHERE id = $2`,
      [passwordHash, row.user_id]);

    await logAudit({ eventType: 'password_reset_completed', userId: row.user_id, ip: clientIp(req) }, client);
  });

  // The whole point of a reset is usually to evict someone. Leaving their
  // existing sessions alive would defeat it.
  await revokeAllSessions(row.user_id);

  // Tell the account holder after the fact. If the reset was not theirs,
  // this is the only signal they get that someone else took the account.
  const account = await queryOne(`SELECT email FROM app_users WHERE id = $1`, [row.user_id]);
  if (account) sendPasswordChanged({ to: account.email });

  res.json({ ok: true });
}));

authRouter.post('/password/change', requireAuth, wrap(async (req, res) => {
  const body = parse(
    z.object({ current_password: z.string().min(1), new_password: passwordSchema }),
    req.body,
  );

  const user = await queryOne(`SELECT password_hash FROM app_users WHERE id = $1`, [req.user.id]);

  // An OAuth-only account has no password to confirm against. Let it set
  // one, so a Google user can add a password without a reset round trip.
  if (user.password_hash && !(await verifyPassword(body.current_password, user.password_hash))) {
    throw unauthorized('Your current password is incorrect');
  }

  await query(`UPDATE app_users SET password_hash = $1 WHERE id = $2`,
    [await hashPassword(body.new_password), req.user.id]);

  // Keep the caller signed in on this device, evict every other one.
  await revokeAllSessions(req.user.id, { exceptToken: req.sessionToken });
  logAudit({ eventType: 'password_changed', userId: req.user.id, ip: clientIp(req) });
  sendPasswordChanged({ to: req.user.email });

  res.json({ ok: true });
}));

// ------------------------------------------------------------------
// Multi-factor authentication
// ------------------------------------------------------------------

authRouter.post('/mfa/enroll', requireAuth, wrap(async (req, res) => {
  const existing = await queryOne(
    `SELECT mfa_confirmed_at FROM app_users WHERE id = $1`, [req.user.id]);
  if (existing?.mfa_confirmed_at) throw conflict('Two-factor authentication is already enabled');

  const secret = generateSecret();
  // Written unconfirmed. It grants nothing until /mfa/confirm proves the
  // user's authenticator actually holds it — otherwise a failed enrolment
  // locks the account behind a secret nobody has.
  await query(`UPDATE app_users SET mfa_secret = $1, mfa_confirmed_at = NULL WHERE id = $2`,
    [secret, req.user.id]);

  res.json({ secret, otpauth_url: otpauthUrl(secret, req.user.email) });
}));

authRouter.post('/mfa/confirm', requireAuth, wrap(async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().min(6).max(6) }), req.body);

  const user = await queryOne(`SELECT mfa_secret FROM app_users WHERE id = $1`, [req.user.id]);
  if (!user?.mfa_secret) throw badRequest('Start enrolment before confirming');
  if (!verifyTotp(user.mfa_secret, code)) throw badRequest('That code is not valid');

  await query(`UPDATE app_users SET mfa_confirmed_at = now() WHERE id = $1`, [req.user.id]);
  logAudit({ eventType: 'mfa_enabled', userId: req.user.id, ip: clientIp(req) });

  res.json({ ok: true });
}));

authRouter.post('/mfa/disable', requireAuth, wrap(async (req, res) => {
  // Disabling a second factor is a downgrade of the account's security, so
  // it is gated on the password even though the caller is already signed
  // in — a borrowed unlocked laptop should not be enough.
  const { password } = parse(z.object({ password: z.string().min(1) }), req.body);

  const user = await queryOne(`SELECT password_hash FROM app_users WHERE id = $1`, [req.user.id]);
  if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
    throw unauthorized('Your password is incorrect');
  }

  await query(`UPDATE app_users SET mfa_secret = NULL, mfa_confirmed_at = NULL WHERE id = $1`,
    [req.user.id]);
  logAudit({ eventType: 'mfa_disabled', userId: req.user.id, ip: clientIp(req) });

  res.json({ ok: true });
}));

// ------------------------------------------------------------------
// Session management
// ------------------------------------------------------------------

authRouter.get('/sessions', requireAuth, wrap(async (req, res) => {
  // The current-session flag is computed by comparing against the hash of
  // the caller's own cookie, done here rather than in SQL so it does not
  // depend on pgcrypto's digest() being on the search path.
  const currentHash = req.sessionToken ? hashAuthToken(req.sessionToken) : null;
  const sessions = await queryAll(
    `SELECT id, token_hash, ip_address, user_agent, created_at, last_seen_at, expires_at
       FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY last_seen_at DESC`,
    [req.user.id],
  );
  res.json(sessions.map(({ token_hash, ...s }) => ({
    ...s,
    is_current: token_hash === currentHash,
  })));
}));

authRouter.post('/sessions/revoke-others', requireAuth, wrap(async (req, res) => {
  await revokeAllSessions(req.user.id, { exceptToken: req.sessionToken });
  logAudit({ eventType: 'sessions_revoked', userId: req.user.id, ip: clientIp(req) });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------
// Google OAuth
//
// The authorization-code flow, run server side. The SPA never sees the
// client secret and never handles the code; it is redirected out and
// redirected back holding nothing but the session cookie.
// ------------------------------------------------------------------

const OAUTH_STATE_COOKIE = 'pc_oauth_state';

authRouter.get('/google', wrap(async (req, res) => {
  if (!googleOAuthConfigured) throw notFound('Google sign-in is not configured');

  // CSRF defence for the callback: a random value echoed through Google
  // and compared on return, so a forged callback cannot sign someone in.
  const state = crypto.randomBytes(16).toString('base64url');
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax', // must survive the top-level redirect back from Google
    maxAge: 10 * 60 * 1000,
    path: '/',
  });

  const params = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: env.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}));

authRouter.get('/google/callback', wrap(async (req, res) => {
  if (!googleOAuthConfigured) throw notFound('Google sign-in is not configured');

  const { code, state } = req.query;
  const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

  if (!code || !state || !expectedState || state !== expectedState) {
    throw badRequest('Invalid OAuth callback');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(code),
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: env.google.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw badRequest('Google rejected the sign-in attempt');

  const { access_token: accessToken } = await tokenRes.json();
  const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) throw badRequest('Could not read your Google profile');

  const gp = await profileRes.json();
  if (!gp.email || !gp.email_verified) {
    throw badRequest('Your Google account must have a verified email address');
  }
  const gEmail = String(gp.email).toLowerCase();

  const userId = await transaction(async (client) => {
    // Match on the Google subject first. It is stable for the life of the
    // account, whereas an email address can be released and reassigned to
    // a different person — matching on email alone would hand them the
    // original owner's account.
    const { rows: [bySubject] } = await client.query(
      `SELECT id FROM app_users WHERE oauth_provider = 'google' AND oauth_subject = $1`,
      [gp.sub],
    );
    if (bySubject) return bySubject.id;

    const { rows: [byEmail] } = await client.query(
      `SELECT id FROM app_users WHERE LOWER(email) = $1`, [gEmail]);

    if (byEmail) {
      // Link Google to the existing password account. Safe because Google
      // asserted the address is verified, which is the same proof a
      // password reset email would give.
      await client.query(
        `UPDATE app_users
            SET oauth_provider = 'google', oauth_subject = $1, email_verified_at = COALESCE(email_verified_at, now())
          WHERE id = $2`,
        [gp.sub, byEmail.id],
      );
      return byEmail.id;
    }

    const { rows: [created] } = await client.query(
      `INSERT INTO app_users (email, oauth_provider, oauth_subject, email_verified_at)
       VALUES ($1, 'google', $2, now()) RETURNING id`,
      [gEmail, gp.sub],
    );
    // Least privilege on first sight. The hardcoded-email super_admin
    // shortcut the old client carried is deliberately not reproduced:
    // elevation happens through the admin endpoint or the seed script.
    await client.query(
      `INSERT INTO profiles (id, email, full_name, avatar_url, global_role)
       VALUES ($1, $2, $3, $4, 'pharmacy_staff')`,
      [created.id, gEmail, gp.name ?? '', gp.picture ?? null],
    );
    return created.id;
  });

  // Refresh the avatar on each sign-in. This is the one thing the identity
  // provider's claims are trusted for, and it is not a security decision.
  if (gp.picture) {
    await query(`UPDATE profiles SET avatar_url = $1 WHERE id = $2`, [gp.picture, userId]);
  }

  const { token, expiresAt } = await createSession(userId, {
    ip: clientIp(req),
    userAgent: req.get('user-agent'),
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
  logAudit({ eventType: 'user_login_google', userId, ip: clientIp(req) });

  res.redirect(env.appUrl);
}));
