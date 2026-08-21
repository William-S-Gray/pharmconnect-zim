import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { env } from '../env.js';

const scrypt = promisify(crypto.scrypt);

// scrypt from node:crypto rather than bcrypt or argon2, both of which are
// native addons that have to compile on every deploy target. scrypt is
// memory-hard, ships with Node, and at these parameters costs ~100ms and
// ~64MB per hash — expensive enough to make offline cracking painful.
const PARAMS = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };

// Node's default maxmem (32MB) is below what N=2^15,r=8 needs (~128 *
// N * r = 32MB, plus overhead), and scrypt throws rather than degrading.
const MAXMEM = 96 * 1024 * 1024;

/**
 * The pepper is derived from AUTH_SECRET, which lives in the environment
 * and never in Postgres. A stolen database dump therefore lacks an input
 * to the hash, so the stored values cannot be attacked offline on their
 * own — unlike the salt, which is stored alongside by necessity.
 */
function pepper(password) {
  return crypto.createHmac('sha256', env.authSecret).update(password).digest();
}

/** Returns a self-describing string: scrypt$N$r$p$salt$hash */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(pepper(password), salt, PARAMS.keylen, {
    ...PARAMS,
    maxmem: MAXMEM,
  });
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verify against a stored hash, reading the cost parameters back out of
 * the stored string rather than assuming the current constants. That is
 * what makes it possible to raise N later without invalidating every
 * existing password.
 */
export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;

  const [, nStr, rStr, pStr, saltB64, hashB64] = stored.split('$');
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!N || !r || !p || !saltB64 || !hashB64) return false;

  const expected = Buffer.from(hashB64, 'base64');
  let derived;
  try {
    derived = await scrypt(pepper(password), Buffer.from(saltB64, 'base64'), expected.length, {
      N, r, p, maxmem: MAXMEM,
    });
  } catch {
    // Malformed parameters in the stored value: treat as a failed match
    // rather than a 500, so one corrupt row cannot break the login route.
    return false;
  }

  // timingSafeEqual throws on a length mismatch, which would itself leak
  // the length through the difference between a throw and a false.
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

/**
 * A hash of a value nobody will ever submit, used to spend the same ~100ms
 * on a login for an unknown email as for a known one. Without it, response
 * time alone enumerates which addresses have accounts.
 */
let dummyHashPromise;
export function dummyVerify() {
  dummyHashPromise ??= hashPassword(crypto.randomBytes(32).toString('hex'));
  return dummyHashPromise.then((h) => verifyPassword('not-the-password', h));
}
