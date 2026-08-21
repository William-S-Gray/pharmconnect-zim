import test from 'node:test';
import assert from 'node:assert/strict';

// env.js validates at import time.
process.env.AUTH_SECRET ??= 'test-secret-that-is-definitely-long-enough-000';
process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused';
process.env.APP_URL ??= 'http://localhost:8080';

const { displayName } = await import('../src/lib/validate.js');

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const NUL = String.fromCharCode(0);

test('displayName: accepts ordinary pharmacy and person names', () => {
  const schema = displayName(160);
  for (const name of [
    'Groombridge Pharmacy',
    'Bulawayo Chemist (Pty) Ltd',
    "O'Brien & Sons Dispensary",
    'Chemist 24/7 — Avondale',
  ]) {
    assert.equal(schema.safeParse(name).success, true, `should accept: ${name}`);
  }
});

test('displayName: rejects the control characters used for header injection', () => {
  const schema = displayName(160);

  // The raw material for a forged Subject continuation line. nodemailer
  // folds these rather than creating a real header — verified against a
  // live SMTP server — but a folded subject still reads to a human as
  // though the message carried extra headers.
  assert.equal(schema.safeParse(`Evil${CR}${LF}Bcc: attacker@evil.test`).success, false);
  assert.equal(schema.safeParse(`Evil${LF}X-Injected: yes`).success, false);
  assert.equal(schema.safeParse(`tab${TAB}here`).success, false);
  assert.equal(schema.safeParse(`nul${NUL}byte`).success, false);
});

test('displayName: reports a usable message for the form', () => {
  const result = displayName(160).safeParse(`Evil${CR}${LF}Bcc: x@y.test`);
  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /line breaks or control characters/);
});

test('displayName: still enforces length and non-emptiness', () => {
  const schema = displayName(10);
  assert.equal(schema.safeParse('').success, false);
  assert.equal(schema.safeParse('   ').success, false);
  assert.equal(schema.safeParse('a'.repeat(11)).success, false);
  assert.equal(schema.safeParse('a'.repeat(10)).success, true);
});
