import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Zero-click POS sync agent.
 *
 * Polls the pharmacy's local POS database and pushes inventory changes to
 * the PharmConnect API.
 *
 * Previously this held a Supabase **service role** key and wrote to
 * pharmacy_stock directly. That key bypasses every authorization rule in
 * the system, and it sat in a .env file on a pharmacy counter PC — so
 * anyone with access to that machine could read or rewrite every
 * pharmacy's data, not just this one's.
 *
 * It now authenticates as an ordinary pharmacy admin and goes through the
 * same API as the web app, so it can only touch its own pharmacy and every
 * write is authorized and audited like any other.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const AGENT_EMAIL = process.env.AGENT_EMAIL;
const AGENT_PASSWORD = process.env.AGENT_PASSWORD;
const PHARMACY_ID = process.env.PHARMACY_ID;
const LOCAL_DB_PATH = process.env.LOCAL_DB_PATH ?? './pos.db';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60_000);

if (!AGENT_EMAIL || !AGENT_PASSWORD || !PHARMACY_ID) {
  console.error('❌ Missing required environment variables (AGENT_EMAIL, AGENT_PASSWORD, PHARMACY_ID).');
  process.exit(1);
}

const db = new Database(LOCAL_DB_PATH);

// The session cookie, held in memory only. Never written to disk — that is
// the whole point of not shipping a long-lived key to this machine.
let sessionCookie = null;

function setupMockDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drug_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO local_inventory (drug_name, quantity, unit_price)
    SELECT 'Paracetamol 500mg', 100, 0.50
    WHERE NOT EXISTS (SELECT 1 FROM local_inventory WHERE drug_name = 'Paracetamol 500mg');
  `);
}

async function login() {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: AGENT_EMAIL, password: AGENT_PASSWORD }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Login failed: ${body.error ?? response.status}`);
  }

  const payload = await response.json();
  if (payload.mfa_required) {
    // An unattended agent cannot answer a TOTP prompt. Fail clearly rather
    // than retrying forever against an account it can never sign in to.
    throw new Error('This account has two-factor authentication enabled; use a dedicated agent account without it.');
  }

  const raw = response.headers.get('set-cookie');
  if (!raw) throw new Error('Login succeeded but returned no session cookie');
  sessionCookie = raw.split(';')[0];

  console.log(`✅ Authenticated as ${AGENT_EMAIL}`);
}

/** Fetch with the session cookie, re-authenticating once on a 401. */
async function apiFetch(path, options = {}, retry = true) {
  if (!sessionCookie) await login();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      'content-type': 'application/json',
      cookie: sessionCookie,
    },
  });

  // Sessions expire and can be revoked. One transparent retry keeps a
  // long-running agent alive across both without a restart.
  if (response.status === 401 && retry) {
    sessionCookie = null;
    return apiFetch(path, options, false);
  }

  return response;
}

setupMockDatabase();
console.log(`✅ Connected to local POS DB at ${LOCAL_DB_PATH}`);

let lastSyncTime = new Date(0).toISOString();

async function syncInventory() {
  try {
    const stmt = db.prepare('SELECT * FROM local_inventory WHERE last_updated > ?');
    const changes = stmt.all(lastSyncTime);
    if (changes.length === 0) return;

    console.log(`🔄 Found ${changes.length} inventory updates locally. Syncing…`);

    // Advance the watermark only after the push succeeds. Setting it first
    // — as the previous version effectively did by updating it inside the
    // try after the write — means a failed sync silently drops those rows
    // from every future poll.
    const attemptedAt = new Date().toISOString();

    const items = changes.map((row) => ({
      drug_name: row.drug_name,
      quantity: row.quantity,
      unit_price: row.unit_price,
      is_available: row.quantity > 0,
      // stock_status is derived by the server from quantity and threshold;
      // sending a client-computed one meant the agent's guess at the
      // pharmacy's threshold silently overrode the real setting.
    }));

    const response = await apiFetch(`/api/stock/${PHARMACY_ID}/bulk`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }

    const { imported } = await response.json();
    console.log(`✅ Synced ${imported} items at ${attemptedAt}`);
    lastSyncTime = attemptedAt;
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
  }
}

console.log(`🚀 Starting POS sync agent (polling every ${POLL_INTERVAL_MS}ms)`);
setInterval(syncInventory, POLL_INTERVAL_MS);
syncInventory();

process.on('SIGINT', () => {
  console.log('Gracefully shutting down agent…');
  db.close();
  process.exit(0);
});
