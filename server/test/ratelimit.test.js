import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The public endpoints have no authentication in front of them, so these
 * limits are the only thing bounding what an anonymous caller can spend —
 * Neon compute on search, and real money on the map proxy. The cases that
 * matter are the ones where a limiter looks like it is working but is not:
 * counting two callers in one bucket, or never letting a window expire.
 */
process.env.AUTH_SECRET ??= 'test-secret-that-is-definitely-long-enough-000';
process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused';
// Explicitly off: the module honours this only outside production, and a
// stray value in the environment must not silently pass these tests.
process.env.RATE_LIMIT_DISABLED = 'false';

const { rateLimit, resetRateLimits } = await import('../src/lib/rateLimit.js');

/** Minimal Express doubles — enough for middleware that only sets headers. */
const makeReq = (ip = '10.0.0.1', extra = {}) => ({
  ip,
  socket: { remoteAddress: ip },
  ...extra,
});

const makeRes = () => {
  const headers = {};
  return { headers, setHeader: (k, v) => { headers[k] = v; } };
};

/** Run middleware once; returns the error passed to next(), or null. */
function call(mw, req, res = makeRes()) {
  let captured = null;
  mw(req, res, (err) => { captured = err ?? null; });
  return { error: captured, res };
}

test.beforeEach(() => resetRateLimits());

test('allows up to the limit, then refuses', () => {
  const mw = rateLimit({ name: 'test-basic', limit: 3, windowMs: 60_000 });
  const req = makeReq();

  for (let i = 0; i < 3; i += 1) {
    assert.equal(call(mw, req).error, null, `request ${i + 1} should pass`);
  }

  const { error, res } = call(mw, req);
  assert.equal(error?.status, 429);
  assert.ok(res.headers['Retry-After'] > 0);
});

test('counts each address separately', () => {
  const mw = rateLimit({ name: 'test-per-ip', limit: 1, windowMs: 60_000 });

  assert.equal(call(mw, makeReq('10.0.0.1')).error, null);
  assert.equal(call(mw, makeReq('10.0.0.1')).error?.status, 429);
  // A second caller must not inherit the first's exhausted bucket.
  assert.equal(call(mw, makeReq('10.0.0.2')).error, null);
});

test('counts a signed-in user by id, not by address', () => {
  const mw = rateLimit({ name: 'test-per-user', limit: 1, windowMs: 60_000 });
  const user = { id: 'u-1' };

  // Same person, two networks — laptop then phone. Still one bucket.
  assert.equal(call(mw, makeReq('10.0.0.1', { user })).error, null);
  assert.equal(call(mw, makeReq('198.51.100.7', { user })).error?.status, 429);

  // Two colleagues behind one office connection are counted individually,
  // which is the reason for keying on the user at all.
  assert.equal(call(mw, makeReq('10.0.0.1', { user: { id: 'u-2' } })).error, null);
});

test('a new window forgives the caller', () => {
  const mw = rateLimit({ name: 'test-window', limit: 1, windowMs: 20 });
  const req = makeReq();

  assert.equal(call(mw, req).error, null);
  assert.equal(call(mw, req).error?.status, 429);

  // Busy-wait rather than a timer: the window is milliseconds and the
  // point is that resetAt is honoured, not how the test spends the time.
  const until = Date.now() + 25;
  while (Date.now() < until) { /* spin */ }

  assert.equal(call(mw, req).error, null);
});

test('a custom key can share one bucket across every caller', () => {
  // This is how the hourly Google budget works: the bill does not care
  // which address the traffic came from.
  const mw = rateLimit({ name: 'test-global', limit: 2, windowMs: 60_000, key: () => 'all' });

  assert.equal(call(mw, makeReq('10.0.0.1')).error, null);
  assert.equal(call(mw, makeReq('10.0.0.2')).error, null);
  assert.equal(call(mw, makeReq('10.0.0.3')).error?.status, 429);
});

test('reports the remaining allowance', () => {
  const mw = rateLimit({ name: 'test-headers', limit: 2, windowMs: 60_000 });
  const req = makeReq();

  assert.equal(call(mw, req).res.headers['RateLimit-Remaining'], 1);
  assert.equal(call(mw, req).res.headers['RateLimit-Remaining'], 0);
  // Never negative, however far over the caller goes.
  assert.equal(call(mw, req).res.headers['RateLimit-Remaining'], 0);
});

test('an unbounded key cannot be stored verbatim', () => {
  // The reset limiter keys on a submitted email address. Without the cap,
  // a caller could choose how much memory each of their requests costs.
  const mw = rateLimit({
    name: 'test-key-cap',
    limit: 1,
    windowMs: 60_000,
    key: (req) => req.body.email,
  });

  const long = 'a'.repeat(5000);
  assert.equal(call(mw, makeReq('10.0.0.1', { body: { email: long } })).error, null);
  // Truncated to the same key, so the second request is refused rather
  // than opening a second bucket.
  assert.equal(call(mw, makeReq('10.0.0.1', { body: { email: `${long}b` } })).error?.status, 429);
});
