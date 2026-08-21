import express from 'express';
import pg from 'pg';
import { env } from '../env.js';
import { requireAuth } from '../auth/middleware.js';
import { visiblePharmacyIds } from '../lib/authz.js';
import { wrap } from '../lib/errors.js';

/**
 * Replacement for Supabase Realtime.
 *
 * Supabase streamed WAL changes straight to the browser and relied on RLS
 * to decide what each subscriber was allowed to see. There is no such
 * service here, so:
 *
 *   Postgres trigger -> pg_notify -> one long-lived LISTEN connection
 *     -> fan-out in this process -> per-subscriber filter -> SSE
 *
 * The filter is the important part. The notification payload carries only
 * identifiers (see notify_change() in schema.sql), and each subscriber is
 * sent an event only when it concerns a pharmacy they belong to or a row
 * addressed to them. Broadcasting to everyone and letting the client
 * ignore what it does not need would leak the shape of other pharmacies'
 * activity.
 *
 * SSE rather than WebSockets: the traffic is one-directional, it is plain
 * HTTP so it survives proxies unchanged, and EventSource reconnects on its
 * own.
 */

export const eventsRouter = express.Router();

const CHANNEL = 'pharmconnect_changes';
const subscribers = new Set();

/**
 * A dedicated client, not a pool checkout. A LISTEN registration belongs
 * to one connection: taken from the pool it would be released back and the
 * subscription silently lost on the next checkout.
 */
let listener = null;

async function startListener() {
  if (listener) return;

  const client = new pg.Client({ connectionString: env.databaseUrlUnpooled });
  listener = client;

  client.on('notification', (msg) => {
    let payload;
    try {
      payload = JSON.parse(msg.payload);
    } catch {
      return; // malformed payload: nothing useful to forward
    }

    for (const sub of subscribers) {
      if (!isRelevant(sub, payload)) continue;
      try {
        sub.res.write(`event: change\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch {
        // The socket went away between the readiness check and the write.
        // Drop the subscriber; its close handler may not have fired yet.
        subscribers.delete(sub);
      }
    }
  });

  // Neon suspends idle computes and will drop this connection. Reconnect
  // with a delay rather than tearing the process down; without this,
  // realtime dies quietly after the first idle timeout and every client
  // falls back to whatever it last fetched.
  client.on('error', (err) => {
    console.error('[events] listener connection error, reconnecting', err.message);
    listener = null;
    client.end().catch(() => {});
    setTimeout(() => startListener().catch((e) => console.error('[events] reconnect failed', e)), 2000);
  });

  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
  console.info('[events] listening on', CHANNEL);
}

function isRelevant(sub, payload) {
  if (payload.user_id && payload.user_id === sub.userId) return true;
  if (!payload.pharmacy_id) return false;
  // null pharmacyIds means super admin: everything is in scope.
  if (sub.pharmacyIds === null) return true;
  return sub.pharmacyIds.includes(payload.pharmacy_id);
}

eventsRouter.get('/', requireAuth, wrap(async (req, res) => {
  await startListener();

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Defeats proxy buffering, which would otherwise hold events until a
    // buffer filled and make the stream look dead.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const sub = {
    userId: req.user.id,
    // Resolved once at subscribe time. A membership change mid-stream is
    // not picked up until the client reconnects, which is acceptable
    // because it can only ever narrow what they already had access to at
    // connect time — and the reconnect happens on the next page load.
    pharmacyIds: await visiblePharmacyIds(req.user),
    res,
  };
  subscribers.add(sub);

  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  // Comment-only keepalive. Idle connections are reaped by load balancers
  // at around 60s, so this stays comfortably inside that.
  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
      subscribers.delete(sub);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    subscribers.delete(sub);
  });
}));

export async function stopListener() {
  if (!listener) return;
  const client = listener;
  listener = null;
  await client.end().catch(() => {});
}

export const subscriberCount = () => subscribers.size;
