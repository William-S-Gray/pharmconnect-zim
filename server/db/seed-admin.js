#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pool, closePool, queryOne } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

/**
 * Creates or promotes the first super administrator.
 *
 * This exists because the hardcoded-email escalation was removed. Under
 * the old system, is_super_admin() returned true for one literal address
 * and the React client force-set the role to match — which meant anyone
 * able to set that address, or to write their own user_metadata, became an
 * administrator. There is now no such back door, so the first admin has to
 * be made deliberately, once, by someone with database access.
 *
 * Usage:
 *   node db/seed-admin.js admin@example.com
 *   ADMIN_PASSWORD=... node db/seed-admin.js admin@example.com   # non-interactive
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.error('Usage: node db/seed-admin.js <email>');
    process.exitCode = 1;
    return;
  }

  const existing = await queryOne(`SELECT id FROM app_users WHERE LOWER(email) = $1`, [email]);

  if (existing) {
    // Promote in place. Re-running against an existing admin is a no-op
    // that reports what it found, which makes this safe to put in a
    // provisioning script.
    await pool.query(
      `UPDATE profiles SET global_role = 'super_admin', lifecycle_status = 'ACTIVE' WHERE id = $1`,
      [existing.id],
    );
    await pool.query(
      `INSERT INTO audit_logs (event_type, user_id, metadata)
       VALUES ('user_mgmt_role_change', $1, $2)`,
      [existing.id, { target_user: existing.id, new_role: 'super_admin', via: 'seed-admin script' }],
    );
    console.info(`[seed] promoted existing account ${email} to super_admin`);
    return;
  }

  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    password = await rl.question(`Password for new super admin ${email}: `);
    rl.close();
  }
  if (!password || password.length < 10) {
    console.error('[seed] password must be at least 10 characters');
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [user] } = await client.query(
      `INSERT INTO app_users (email, password_hash, email_verified_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [email, passwordHash],
    );
    await client.query(
      `INSERT INTO profiles (id, email, full_name, global_role)
       VALUES ($1, $2, 'System Administrator', 'super_admin')`,
      [user.id, email],
    );
    await client.query(
      `INSERT INTO audit_logs (event_type, user_id, metadata)
       VALUES ('user_registered', $1, $2)`,
      [user.id, { via: 'seed-admin script', role: 'super_admin' }],
    );
    await client.query('COMMIT');
    console.info(`[seed] created super admin ${email}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err.message);
    process.exitCode = 1;
  })
  .finally(closePool);
