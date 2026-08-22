import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The CORS allow-list is the gate on which browser origins may make
 * credentialed requests, so a pattern that matches more than intended
 * hands session access to somebody else's site. These assert the denials
 * as much as the matches.
 */
process.env.AUTH_SECRET ??= 'test-secret-that-is-definitely-long-enough-000';
process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused';
process.env.CORS_ORIGINS = [
  'https://pharmconnect-zim.vercel.app',
  'https://pharmconnect-*-graywilliamwiltino-9906s-projects.vercel.app',
].join(',');

const { isAllowedOrigin } = await import('../src/env.js');

test('allows the exact production origin', () => {
  assert.equal(isAllowedOrigin('https://pharmconnect-zim.vercel.app'), true);
});

test('allows Vercel preview URLs matching the scoped pattern', () => {
  for (const o of [
    'https://pharmconnect-ask4r9zik-graywilliamwiltino-9906s-projects.vercel.app',
    'https://pharmconnect-oijxgdh94-graywilliamwiltino-9906s-projects.vercel.app',
  ]) {
    assert.equal(isAllowedOrigin(o), true, `should allow ${o}`);
  }
});

test('a missing Origin is allowed — same-origin and server-to-server send none', () => {
  assert.equal(isAllowedOrigin(undefined), true);
  assert.equal(isAllowedOrigin(''), true);
});

test('refuses other origins outright', () => {
  for (const o of [
    'https://evil.example',
    'http://pharmconnect-zim.vercel.app',        // wrong scheme
    'https://pharmconnect-zim.vercel.app.evil.com',
    'https://notpharmconnect-zim.vercel.app',
  ]) {
    assert.equal(isAllowedOrigin(o), false, `should refuse ${o}`);
  }
});

test('the wildcard cannot span a domain boundary', () => {
  // `*` excludes "." and "/", so a pattern anchored inside one host cannot
  // be satisfied by a different host that merely contains the same text.
  // Without that restriction each of these would match.
  for (const o of [
    'https://pharmconnect-x.evil.com-graywilliamwiltino-9906s-projects.vercel.app',
    'https://pharmconnect-a/b-graywilliamwiltino-9906s-projects.vercel.app',
    'https://pharmconnect-evil.attacker.com-graywilliamwiltino-9906s-projects.vercel.app',
  ]) {
    assert.equal(isAllowedOrigin(o), false, `should refuse ${o}`);
  }
});

test('another team on the same platform is refused', () => {
  // The pattern is scoped to one project in one team, not to *.vercel.app.
  assert.equal(
    isAllowedOrigin('https://pharmconnect-abc-someone-elses-projects.vercel.app'),
    false,
  );
});
