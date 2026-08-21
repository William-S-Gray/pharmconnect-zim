#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, closePool } from '../src/db.js';

/**
 * Applies db/schema.sql.
 *
 * The schema is written to be idempotent (CREATE ... IF NOT EXISTS, DROP
 * POLICY IF EXISTS before CREATE, guarded DO blocks) and is the single
 * definition of the database, so this re-runs the whole file rather than
 * tracking incremental versions. That deliberately replaces the previous
 * arrangement, where ~25 loose .sql files were pasted into the Supabase
 * console by hand in an order nobody recorded, and several of them
 * redefined the same functions differently.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = await readFile(path.join(here, 'schema.sql'), 'utf8');

  console.info('[migrate] applying schema.sql');
  // One statement to node-postgres, one transaction: schema.sql wraps
  // itself in BEGIN/COMMIT, so a failure part-way leaves nothing applied.
  await pool.query(sql);

  const { rows } = await pool.query(
    `SELECT count(*)::int AS tables FROM pg_tables WHERE schemaname = 'public'`);
  console.info(`[migrate] done — ${rows[0].tables} tables in public`);
}

main()
  .catch((err) => {
    console.error('[migrate] failed:', err.message);
    process.exitCode = 1;
  })
  .finally(closePool);
