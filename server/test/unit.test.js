import test from 'node:test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// AUTH_SECRET is required at import time by env.js. Set a fixed one so the
// password tests are deterministic and do not depend on a local .env.
process.env.AUTH_SECRET ??= 'test-secret-that-is-definitely-long-enough-000';
process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused';

const { hashPassword, verifyPassword } = await import('../src/auth/password.js');
const { generateSecret, verifyTotp, otpauthUrl } = await import('../src/auth/totp.js');
const { expandSymptoms, detectIntent } = await import('../src/lib/symptoms.js');

test('password: round trips', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('wrong password entirely', hash), false);
});

test('password: same input hashes differently each time', async () => {
  // Distinct salts, so identical passwords do not produce identical rows —
  // otherwise the table reveals which users share a password.
  const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('same', a), true);
  assert.equal(await verifyPassword('same', b), true);
});

test('password: rejects malformed stored values without throwing', async () => {
  for (const bad of ['', 'not-a-hash', 'scrypt$', 'bcrypt$x$y', 'scrypt$0$0$0$$', null, undefined]) {
    assert.equal(await verifyPassword('x', bad), false);
  }
});

test('password: reads cost parameters from the stored hash', async () => {
  // Verification must not assume the current constants, or raising N later
  // would invalidate every password already on file.
  const hash = await hashPassword('portable');
  const [, N, r, p] = hash.split('$');
  assert.ok(Number(N) > 0 && Number(r) > 0 && Number(p) > 0);
  assert.equal(await verifyPassword('portable', hash), true);
});

/**
 * An independent RFC 6238 implementation, written against the spec rather
 * than by calling the module under test. Comparing two implementations is
 * what makes this a real check: asserting verifyTotp against a code
 * produced by the same code would pass even if both were wrong.
 */
function referenceTotp(base32Secret, atMs = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of base32Secret) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));

  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / 30)));
  const digest = crypto.createHmac('sha1', Buffer.from(bytes)).update(counter).digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, '0');
}

test('totp: accepts the code an authenticator app would produce', () => {
  const secret = generateSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  assert.equal(verifyTotp(secret, referenceTotp(secret)), true);
});

test('totp: accepts the adjacent window but not a distant one', () => {
  const secret = generateSecret();
  // ±1 step tolerates a code entered as the window rolls over.
  assert.equal(verifyTotp(secret, referenceTotp(secret, Date.now() - 30_000)), true);
  assert.equal(verifyTotp(secret, referenceTotp(secret, Date.now() + 30_000)), true);
  // Ten minutes out must not be accepted.
  assert.equal(verifyTotp(secret, referenceTotp(secret, Date.now() - 600_000)), false);
});

test('totp: a code from one secret does not validate against another', () => {
  const a = generateSecret();
  const b = generateSecret();
  assert.equal(verifyTotp(b, referenceTotp(a)), false);
});

test('totp: rejects malformed input', () => {
  const secret = generateSecret();
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, 123456]) {
    assert.equal(verifyTotp(secret, bad), false);
  }
});

test('totp: rejects a bad secret without throwing', () => {
  assert.equal(verifyTotp('not!valid!base32', '123456'), false);
});

test('totp: otpauth url carries the required parameters', () => {
  const url = otpauthUrl('JBSWY3DPEHPK3PXP', 'user@example.com');
  assert.ok(url.startsWith('otpauth://totp/'));
  assert.ok(url.includes('secret=JBSWY3DPEHPK3PXP'));
  assert.ok(url.includes('digits=6'));
  assert.ok(url.includes('period=30'));
});

test('symptoms: maps colloquial Zimbabwean phrasing', () => {
  assert.ok(expandSymptoms('running stomach').includes('loperamide'));
  assert.ok(expandSymptoms('I have a headache').includes('paracetamol'));
  assert.ok(expandSymptoms('high blood pressure').includes('amlodipine'));
});

test('symptoms: specific entries win over the general pain rule', () => {
  // 'stomach pain' contains 'pain'; order in SYMPTOM_MAP is what keeps it
  // from falling through to the analgesics.
  assert.ok(expandSymptoms('stomach pain').includes('omeprazole'));
  assert.ok(!expandSymptoms('stomach pain').includes('diclofenac'));
});

test('symptoms: a drug name expands to nothing', () => {
  assert.deepEqual(expandSymptoms('amoxicillin'), []);
  assert.deepEqual(expandSymptoms(''), []);
  assert.deepEqual(expandSymptoms(null), []);
});

test('intent: classifies queries', () => {
  assert.equal(detectIntent('running stomach'), 'symptom');
  assert.equal(detectIntent('paracetamol 500mg'), 'drug_with_strength');
  assert.equal(detectIntent('amoxicillin'), 'drug');
  assert.equal(detectIntent(''), 'unknown');
});
