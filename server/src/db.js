import net from 'node:net';
import dns from 'node:dns';
import pg from 'pg';
import { env } from './env.js';

// Node 20+ dials IPv6 and IPv4 concurrently ("happy eyeballs"). On a host
// with a AAAA route that does not actually work — which is the common case
// for Neon from a plain Linux box — the dual-stack attempt reports
// ETIMEDOUT on the IPv4 socket too, and every connection fails even though
// IPv4 on its own connects immediately. Pinning to IPv4 avoids the race.
//
// Set before pg is used, since it changes the default for new sockets.
net.setDefaultAutoSelectFamily(false);
dns.setDefaultResultOrder('ipv4first');

const { Pool, types } = pg;

// node-postgres hands back NUMERIC as a string to avoid float precision
// loss. Prices here are NUMERIC(10,2) — comfortably inside the range a
// double represents exactly — and the React pages do arithmetic on them,
// so parse them rather than shipping strings the client has to coerce.
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
// INT8 (count(*)) has the same problem and the same fix; row counts here
// will never approach 2^53.
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)));

export const pool = new Pool({
  connectionString: env.databaseUrl,
  // Neon terminates idle TLS connections; keep the pool small and let it
  // recycle rather than holding connections open against a serverless
  // compute that may scale to zero.
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// An error on an idle pooled client is emitted on the pool, not on any
// request. Without this listener Node treats it as unhandled and exits.
pool.on('error', (err) => {
  console.error('[db] idle client error', err);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** First row, or null. */
export async function queryOne(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

/** All rows. */
export async function queryAll(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

/**
 * Run `fn` inside a transaction, rolling back on any throw.
 *
 * Multi-step writes here are not optional niceties: approving a stock
 * change writes pharmacy_stock, pending_approvals and audit_logs, and a
 * partial apply leaves an approval marked done whose effect never landed.
 */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // Rollback can itself fail if the connection dropped mid-transaction.
    // Surface the original error, which is the one that explains the
    // failure, rather than masking it with the rollback's.
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[db] rollback failed', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
