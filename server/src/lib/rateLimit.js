import { env } from '../env.js';
import { tooMany } from './errors.js';
import { clientIp } from '../auth/middleware.js';

/**
 * Rate limits for the endpoints anyone can call without signing in.
 *
 * Failed logins are limited separately, in lib/audit.js, and counted in
 * Postgres — they are rare, and a limit that survives a restart matters
 * when the thing being ground is a password. These limits are the
 * opposite case: search and the map proxy are called constantly by normal
 * use, so a database round trip to decide whether to allow a request
 * would cost more than the request it protects. They are held in memory.
 *
 * What that costs:
 *
 *  - **Per instance.** Two API instances mean two counters and, in
 *    effect, double the limit. Correct today because Render runs one;
 *    scaling out needs a shared store (Redis, or a Postgres table for the
 *    slow limits) rather than a bigger number here.
 *  - **Reset on deploy.** A restart forgives everyone. Acceptable: these
 *    limits exist to stop sustained abuse and runaway cost, not to punish
 *    a burst.
 *
 * Callers are keyed by user id when signed in and by IP otherwise, so one
 * pharmacy's staff sharing an office connection are counted individually
 * once they have logged in. Anonymous callers behind one carrier NAT —
 * common on Zimbabwean mobile networks — do share a bucket, which is why
 * the public limits below are set well above what a person can generate
 * by hand rather than at the tightest value that would still "work".
 */

// One map for every limiter, keyed by "<name>:<caller>". A single sweep
// then bounds the memory used by all of them.
const buckets = new Map();

// A distinct key is at most a few dozen bytes, so this cap is about
// megabytes, not thousands. It exists so that a flood of spoofed or
// rotated addresses cannot grow the map without bound between sweeps.
const MAX_KEYS = 20_000;

const SWEEP_INTERVAL_MS = 60_000;

function sweep() {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

const sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
// Must not hold the process open: without this, a shutdown waits for a
// timer that exists only to free memory.
sweepTimer.unref();

/**
 * Default bucket key: the signed-in user, else the caller's address.
 *
 * `clientIp` only honours X-Forwarded-For when TRUST_PROXY is set. On a
 * directly-reachable server, trusting it would let a caller rotate their
 * apparent address per request and walk straight past every limit here.
 */
function callerKey(req) {
  return req.user?.id ? `u:${req.user.id}` : `ip:${clientIp(req) ?? 'unknown'}`;
}

/**
 * Fixed-window counter.
 *
 * A sliding window would be fairer at the window boundary — a caller can
 * spend a full allowance either side of a reset and so send 2x the limit
 * across two adjacent seconds. That is a real property of this
 * implementation and an acceptable one: the burst it permits is still
 * bounded, and the alternative costs a timestamp list per caller.
 *
 * @param {object}   opts
 * @param {string}   opts.name      bucket namespace, so limits do not share counters
 * @param {number}   opts.limit     requests allowed per window
 * @param {number}   opts.windowMs  window length
 * @param {Function} [opts.key]     bucket key from the request
 * @param {string}   [opts.message] what the client is told on 429
 * @param {boolean}  [opts.exposeHeaders] advertise the allowance in RateLimit-*
 */
export function rateLimit({
  name, limit, windowMs, key = callerKey, message, exposeHeaders = true,
}) {
  const denial = message ?? 'Too many requests. Please try again shortly.';

  return function rateLimitMiddleware(req, res, next) {
    // Honoured outside production only. A live deploy cannot be talked out
    // of its limits by an environment variable — the flag being set there
    // is a mistake, and one that would silently remove the protection.
    if (env.rateLimitDisabled && !env.isProd) return next();

    const now = Date.now();
    // Bound the key: it is derived from request data, and an unbounded one
    // (a long email in a body) would be stored verbatim.
    const bucketKey = `${name}:${String(key(req)).slice(0, 160)}`;

    let entry = buckets.get(bucketKey);
    if (!entry || entry.resetAt <= now) {
      if (buckets.size >= MAX_KEYS) {
        sweep();
        if (buckets.size >= MAX_KEYS) {
          // Under a flood of distinct keys, start over rather than grow.
          // This forgives everyone currently counted, which is the lesser
          // failure: the alternative is unbounded memory in the process
          // that is supposed to be surviving the flood.
          console.warn(`[ratelimit] key table full (${buckets.size}); clearing`);
          buckets.clear();
        }
      }
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(bucketKey, entry);
    }

    entry.count += 1;

    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    // A shared bucket describes the server's budget rather than this
    // caller's allowance, so advertising it would both mislead the client
    // and report how busy the account is to anyone who asks.
    if (exposeHeaders) {
      res.setHeader('RateLimit-Limit', limit);
      res.setHeader('RateLimit-Remaining', Math.max(0, limit - entry.count));
      res.setHeader('RateLimit-Reset', resetSeconds);
    }

    if (entry.count > limit) {
      res.setHeader('Retry-After', resetSeconds);
      return next(tooMany(denial));
    }

    return next();
  };
}

/** Test seam: drop all counters. Not used by the server. */
export function resetRateLimits() {
  buckets.clear();
}

const MINUTE = 60_000;
const HOUR = 3_600_000;

// ------------------------------------------------------------------
// The limits themselves, in one place so the whole policy is readable
// ------------------------------------------------------------------

/**
 * Availability search. Each call is a PostGIS query across every approved
 * pharmacy's stock, so this is the endpoint that decides how much Neon
 * compute an anonymous caller can spend.
 *
 * 60/minute is roughly ten times what the UI can generate: results are
 * fetched on submit, not per keystroke.
 */
export const searchLimit = rateLimit({
  name: 'search',
  limit: 60,
  windowMs: MINUTE,
  message: 'Too many searches. Please wait a moment and try again.',
});

/**
 * Typeahead and intent hinting. The search bar debounces at 300ms and
 * then fires both of these together, so a fast typist legitimately
 * produces several a second — this has to be far looser than the search
 * limit, and can be, since both queries are small and indexed.
 */
export const typeaheadLimit = rateLimit({
  name: 'typeahead',
  limit: 180,
  windowMs: MINUTE,
  message: 'Too many requests. Please wait a moment and try again.',
});

/**
 * Google-billed lookups, per caller. Distance is one call per marker the
 * user clicks and geocoding one per registration, so 30/minute is far
 * above deliberate use and still stops a script.
 */
export const mapsLimit = rateLimit({
  name: 'maps',
  limit: 30,
  windowMs: MINUTE,
  message: 'Too many map lookups. Please wait a moment and try again.',
});

/**
 * Google-billed lookups, in total. The per-caller limit does nothing
 * against many callers, and the bill does not care how the traffic was
 * distributed. Mounted alongside `mapsLimit`; `MAPS_HOURLY_BUDGET` tunes
 * it without a code change.
 */
export const mapsBudget = rateLimit({
  name: 'maps-budget',
  limit: env.mapsHourlyBudget,
  windowMs: HOUR,
  key: () => 'all',
  exposeHeaders: false,
  message: 'Map lookups are temporarily unavailable. Please try again later.',
});

/**
 * Public writes: reservations, requests to a pharmacy, and wanted-drug
 * posts. Each one puts a row in front of a pharmacist, so the cost of
 * abuse is somebody's attention rather than compute.
 *
 * All three share one bucket, so the limit is on public writes as a
 * whole rather than per endpoint — someone posting twenty reservations
 * and then twenty wanted-drug notices is the case worth stopping.
 *
 * 20/hour is generous for a person and cheap to raise; it is set here
 * rather than lower because anonymous callers sharing a carrier NAT share
 * this bucket.
 */
export const publicWriteLimit = rateLimit({
  name: 'public-write',
  limit: 20,
  windowMs: HOUR,
  message: 'Too many requests from this connection. Please try again later.',
});

/**
 * Reservation lookup by code. The code is the only thing protecting a
 * reservation's details, so this endpoint is guessable by construction and
 * the limit is what makes guessing impractical.
 */
export const codeLookupLimit = rateLimit({
  name: 'code-lookup',
  limit: 30,
  windowMs: 10 * MINUTE,
  message: 'Too many lookups. Please try again later.',
});

/**
 * Registration. Creates an account and emails an administrator, so it is
 * both a spam vector and a way to fill the users table.
 *
 * Ten per hour also lets the smoke suite — which registers six accounts
 * from one address — run against a real server without tripping it.
 */
export const signupLimit = rateLimit({
  name: 'signup',
  limit: 10,
  windowMs: HOUR,
  message: 'Too many registrations from this connection. Please try again later.',
});

/**
 * Password reset requests, per address. Stops one host working through a
 * list of emails.
 */
export const passwordForgotIpLimit = rateLimit({
  name: 'forgot-ip',
  limit: 10,
  windowMs: HOUR,
  message: 'Too many reset requests. Please try again later.',
});

/**
 * Password reset requests, per email. The per-IP limit does not protect
 * the *recipient*: without this, an attacker rotating addresses can fill
 * one person's inbox with genuine reset links. Keyed on the submitted
 * address, which is why it is unaffected by whether that account exists —
 * the endpoint deliberately answers the same either way.
 */
export const passwordForgotEmailLimit = rateLimit({
  name: 'forgot-email',
  limit: 3,
  windowMs: HOUR,
  key: (req) => `e:${String(req.body?.email ?? '').toLowerCase()}`,
  // Says nothing about whether a link was actually sent — the endpoint
  // answers identically for an address with no account, and so must this.
  message: 'Too many reset requests for that address. Please try again later.',
});

/**
 * Redeeming a reset token. The token is 32 random bytes, so this is not
 * what makes guessing it infeasible — it is here so that trying anyway
 * costs an attacker a rate limit rather than unlimited database lookups.
 */
export const passwordResetLimit = rateLimit({
  name: 'password-reset',
  limit: 20,
  windowMs: HOUR,
  message: 'Too many attempts. Please request a new reset link.',
});
