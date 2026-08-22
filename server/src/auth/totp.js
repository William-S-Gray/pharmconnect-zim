import crypto from 'node:crypto';

/**
 * RFC 6238 TOTP, implemented directly against node:crypto.
 *
 * Supabase provided this as a hosted service (auth.mfa.*). The algorithm
 * is about thirty lines and pulling in a dependency for it would add a
 * supply-chain surface to the most security-sensitive path in the app.
 */

const DIGITS = 6;
const PERIOD = 30;
// One step either side, so a code entered as the window rolls over is
// still accepted. Widening this trades brute-force resistance for
// tolerance of clock skew; ±1 is the usual compromise.
const SKEW = 1;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(bytes = 20) {
  const buf = crypto.randomBytes(bytes);
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');

  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += B32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(secret) {
  const clean = secret.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = '';
  for (const char of clean) {
    const idx = B32.indexOf(char);
    if (idx === -1) throw new Error('Invalid base32 character in TOTP secret');
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(key, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac('sha1', key).update(buf).digest();
  // Dynamic truncation, RFC 4226 §5.4.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

/**
 * Verify a submitted code against the secret.
 *
 * Every candidate in the window is compared with timingSafeEqual and the
 * loop does not break early on a match, so the time taken does not reveal
 * which step matched — or, more importantly, how much of a wrong code was
 * correct.
 */
export function verifyTotp(secret, token) {
  if (typeof token !== 'string') return false;
  const normalized = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;

  let key;
  try {
    key = base32Decode(secret);
  } catch {
    return false;
  }

  const counter = Math.floor(Date.now() / 1000 / PERIOD);
  const submitted = Buffer.from(normalized);
  let matched = false;

  for (let i = -SKEW; i <= SKEW; i += 1) {
    const candidate = Buffer.from(hotp(key, counter + i));
    if (candidate.length === submitted.length && crypto.timingSafeEqual(candidate, submitted)) {
      matched = true;
    }
  }
  return matched;
}

/** otpauth:// URI for the enrolment QR code. */
export function otpauthUrl(secret, email, issuer = 'PharmConnect ZIM') {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
