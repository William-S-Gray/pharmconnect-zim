import dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

function required(name) {
  const value = process.env[name];
  if (!value) {
    // Fail at boot rather than at the first request that needs it. A server
    // that starts without DATABASE_URL only reports the problem once a user
    // hits it, by which point the deploy looks healthy.
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// A single shared secret is used to derive the pepper for password hashing.
// It must be stable across restarts and across instances: rotating it
// invalidates every stored password. Kept out of the database deliberately,
// so a database dump alone cannot be brute-forced offline.
const authSecret = required('AUTH_SECRET');
if (authSecret.length < 32) {
  throw new Error('AUTH_SECRET must be at least 32 characters');
}

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),

  // LISTEN/NOTIFY cannot work through Neon's -pooler endpoint: that is
  // PgBouncer in transaction pooling mode, where a connection is handed
  // back to the pool at the end of every transaction, so a LISTEN
  // registration does not survive to receive anything. The SSE listener
  // therefore needs a direct connection.
  //
  // Neon's convention is that the direct host is the pooled host with
  // "-pooler" removed, which is the default derived here; override it
  // explicitly if that ever stops holding.
  databaseUrlUnpooled:
    process.env.DATABASE_URL_UNPOOLED ?? required('DATABASE_URL').replace('-pooler.', '.'),

  authSecret,

  // Browsers only attach credentialed requests to origins the server names
  // explicitly, so this list is the actual gate on who may call the API
  // with a session cookie.
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:8080')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),

  // Trusting X-Forwarded-For unconditionally lets any caller spoof their IP
  // and defeat the login rate limiter, so it is opt-in and should only be
  // enabled when the app genuinely sits behind a proxy that sets it.
  trustProxy: process.env.TRUST_PROXY === 'true',

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
  },

  // Where to send the browser after an OAuth round trip.
  appUrl: process.env.APP_URL ?? 'http://localhost:8080',

  mapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',

  /**
   * Outbound email, over plain SMTP so any provider works — Gmail with an
   * app password, Zoho, Brevo, SES, Postmark, a local relay. Deliberately
   * not tied to a vendor SDK.
   *
   * Port 465 is implicit TLS; 587 and 25 start plaintext and upgrade with
   * STARTTLS, which nodemailer does automatically when `secure` is false.
   */
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },

  // Envelope sender. Many providers reject a From that does not match the
  // authenticated account, so this defaults to SMTP_USER.
  emailFrom: process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? '',
  emailFromName: process.env.EMAIL_FROM_NAME ?? 'PharmConnect Zim',

  // Where new-pharmacy registration alerts go. Falls back to notifying
  // every active super admin, which is looked up at send time.
  adminAlertEmail: process.env.ADMIN_ALERT_EMAIL ?? '',
};

/**
 * Whether real email can be sent. When false the mailer logs messages to
 * stderr instead — useful in development, and the reason password reset
 * links appear in the console there.
 */
export const emailConfigured = Boolean(env.smtp.host && env.emailFrom);

if (!emailConfigured) {
  // Not fatal: the rest of the app works without email. But password reset
  // and invitations cannot complete, so this must be impossible to miss in
  // a production log rather than a quiet debug line.
  console.warn(
    env.isProd
      ? '[email] SMTP is NOT configured. Password reset and invitation emails will NOT be delivered. Set SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM.'
      : '[email] SMTP not configured; emails will be written to the console.',
  );
}

export const googleOAuthConfigured = Boolean(
  env.google.clientId && env.google.clientSecret && env.google.redirectUri,
);
