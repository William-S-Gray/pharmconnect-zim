import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { env } from './env.js';
import { pool, closePool } from './db.js';
import { attachUser } from './auth/middleware.js';
import { errorHandler } from './lib/errors.js';
import { purgeExpiredSessions } from './auth/session.js';
import { verifyMailer, closeMailer } from './lib/mailer.js';

import { authRouter } from './routes/auth.js';
import { pharmacyRouter } from './routes/pharmacies.js';
import { stockRouter } from './routes/stock.js';
import { drugRouter } from './routes/drugs.js';
import { searchRouter } from './routes/search.js';
import { adminRouter } from './routes/admin.js';
import { mapsRouter } from './routes/maps.js';
import { eventsRouter, stopListener } from './routes/events.js';
import { profileRouter, deleteRequestRouter, syncRouter } from './routes/account.js';
import {
  reservationRouter, requestRouter, approvalRouter, notificationRouter, wantedRouter,
} from './routes/workflow.js';

const app = express();

// Express only honours X-Forwarded-For — and therefore reports the real
// client IP to the rate limiter — when it is told to trust the proxy.
// Off by default, because trusting it on a directly-reachable server lets
// any caller spoof their address.
if (env.trustProxy) app.set('trust proxy', 1);

app.disable('x-powered-by');

app.use(cors({
  origin(origin, callback) {
    // Same-origin and server-to-server callers send no Origin header.
    if (!origin) return callback(null, true);
    if (env.corsOrigins.includes(origin)) return callback(null, true);

    // Refuse by omitting the Access-Control-Allow-Origin header, which is
    // what actually stops a browser using the response. Passing an Error
    // here instead sent it to the error handler, which logged a stack
    // trace and answered 500 — turning every stray bot request with an
    // Origin header into a server error in the logs.
    //
    // Note this is defence in depth, not the auth boundary: CORS is
    // enforced by browsers, and a non-browser client ignores it entirely.
    // The session cookie is what actually gates access.
    if (!env.isProd) console.warn(`[cors] refused origin: ${origin}`);
    return callback(null, false);
  },
  // Required for the session cookie to travel cross-origin at all.
  credentials: true,
}));

// A JSON body limit exists so a single request cannot exhaust memory. The
// bulk stock import is the largest legitimate payload here.
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Resolves req.user when a session cookie is present. Mounted before the
// routers so public endpoints can still attribute activity to a signed-in
// user without requiring one.
app.use(attachUser);

/**
 * Liveness. Deliberately does NOT touch the database.
 *
 * This is what the platform polls to decide whether to restart the
 * instance, so it must answer the question "is this process alive" and
 * nothing else. The previous version ran SELECT 1, which coupled the
 * process's survival to the database being warm — and on a stack where
 * both Render and Neon idle, a cold database made the check slow, Render
 * cycled the instance, and the service flapped between 200 and no-server
 * without anything actually being wrong with it.
 */
app.get('/health', (_req, res) => res.json({ ok: true }));

/**
 * Readiness. Checks the things a request actually needs.
 *
 * Use this for "should traffic go here", monitoring and deploy gates —
 * not as a restart trigger.
 */
app.get('/health/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'reachable' });
  } catch {
    res.status(503).json({ ok: false, database: 'unreachable' });
  }
});

app.use('/api/auth',          authRouter);
app.use('/api/pharmacies',    pharmacyRouter);
app.use('/api/stock',         stockRouter);
app.use('/api/drugs',         drugRouter);
app.use('/api/search',        searchRouter);
app.use('/api/reservations',  reservationRouter);
app.use('/api/requests',      requestRouter);
app.use('/api/wanted',        wantedRouter);
app.use('/api/approvals',     approvalRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/profile',       profileRouter);
app.use('/api/delete-requests', deleteRequestRouter);
app.use('/api/sync',          syncRouter);
app.use('/api/admin',         adminRouter);
app.use('/api/maps',          mapsRouter);
app.use('/api/events',        eventsRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.info(`[api] listening on :${env.port} (${env.isProd ? 'production' : 'development'})`);
});

// Check SMTP at boot so a bad host or wrong credentials show up in the
// deploy log, rather than the first time someone cannot reset a password.
verifyMailer().catch((err) => console.error('[email] verification error', err));

// Expired rows are already excluded on read; this only stops the table
// growing without bound. Hourly is far more often than necessary and
// still cheap.
const purgeTimer = setInterval(() => {
  purgeExpiredSessions()
    .then((n) => { if (n) console.info(`[sessions] purged ${n} expired rows`); })
    .catch((err) => console.error('[sessions] purge failed', err));
}, 3_600_000);
purgeTimer.unref();

/**
 * Stop accepting connections, then drain. Without this, a deploy cuts
 * in-flight requests mid-transaction and clients see a connection reset
 * rather than a response.
 */
async function shutdown(signal) {
  console.info(`[api] ${signal} received, shutting down`);
  clearInterval(purgeTimer);

  server.close(async () => {
    await stopListener();
    await closeMailer();
    await closePool();
    process.exit(0);
  });

  // Backstop for connections that never close on their own — an open SSE
  // stream will not, by design.
  setTimeout(() => {
    console.warn('[api] forced exit after shutdown timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
