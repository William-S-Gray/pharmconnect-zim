# Supabase → Neon migration

**Status: complete.** The app runs entirely on Neon Postgres behind its own
API server. Nothing in the codebase references Supabase any more, and no
data was carried over — the Supabase project was abandoned rather than
migrated, by decision.

---

## What changed

Neon is Postgres and nothing else. The app depended on four Supabase
products; only one was a direct swap.

| Supabase dependency | Was | Now |
|---|---|---|
| Postgres + PostGIS | 20 tables | Neon — direct swap |
| Supabase Auth (password, Google OAuth, TOTP, reset) | ~20 call sites | `server/src/auth/` |
| Browser-direct PostgREST + RLS on `auth.uid()` | 51 files, 188 call sites | REST API, authz in code |
| Realtime (`postgres_changes`) | 4 channels | `LISTEN/NOTIFY` → SSE |
| Edge Functions (maps proxy, SMS) | 2 | Maps proxied via `/api/maps/*`; SMS still outstanding |

### The security model changed — read this before adding a table

**Before:** the browser held a Postgres role. RLS was the only thing between
a user and the data, which is why one bad policy exposed every profile in
the table.

**After:** the browser has no database credentials. The API server is the
only client, and every read and write is authorized in JavaScript
(`server/src/lib/authz.js`) before it reaches Postgres. RLS is not merely
disabled — it is no longer the boundary. Do not add a policy and assume it
protects anything; add the check to `authz.js`.

---

## Neon project

| | |
|---|---|
| Project | `pharmconnect-zim` |
| Project ID | `withered-thunder-99492358` |
| Region | `aws-us-east-2` |
| Postgres | 18.6 |
| Extensions | `postgis`, `pg_trgm`, `uuid-ossp`, `pgcrypto`, `h3` |

`h3` was not available on Supabase, which is why H3 cell indexes were
maintained by a Node script that read every pharmacy, computed cells in
JavaScript and wrote each row back. That script is gone; a trigger keeps
`h3_index_res8` correct automatically.

---

## Layout

```
server/
  db/schema.sql            canonical schema (22 tables), idempotent
  db/migrate.js            applies it
  db/seed-admin.js         creates or promotes the first super admin
  db/seed-catalogue.js     27 drugs; 10 with reviewed clinical copy
  src/
    env.js                 fail-at-boot config validation
    db.js                  pooled connections, transactions
    auth/                  scrypt passwords, opaque sessions, TOTP
    lib/authz.js           every authorization rule, in one file
    lib/symptoms.js        symptom → drug expansion
    routes/                auth, pharmacies, stock, drugs, search,
                           workflow, account, admin, maps, events
    lib/mailer.js          SMTP transport
    lib/emails.js          message content
  test/unit.test.js        14 tests
  test/email.test.js       4 tests
  test/smtp-sink.js        throwaway SMTP server for testing delivery
  test/smoke.sh            59 checks against a running server

src/lib/api.ts             typed API client (replaces supabaseClient.ts)
```

---

## Security decisions worth knowing

- **Sessions are opaque, not JWTs.** The gate-1 root cause was a token
  carrying its own authority: `user_metadata` rode inside the Supabase JWT
  and both the client and the RLS policies trusted it. An opaque token
  asserts nothing — the role is re-read from `profiles` on every request —
  so there is no claim to forge, and revocation is immediate.
- **Passwords use scrypt** (`node:crypto`, N=2¹⁵), peppered from
  `AUTH_SECRET`, which lives in the environment and never in Postgres. A
  stolen database dump lacks an input to the hash. No native addon.
- **The hardcoded-email super admin is gone.** Make the first one with
  `npm run seed:admin -- you@example.com`.
- **Role changes** go through one audited endpoint that refuses to change
  your own role — blocking self-promotion and the self-demotion that would
  strand the system with no reachable admin.
- **Staff still cannot write stock directly.** Their edits become
  `pending_approvals` rows. Previously enforced only in React, which meant
  not enforced at all.
- **The realtime stream carries identifiers only**, never row contents, and
  is filtered per subscriber against their memberships.
- **The POS agent no longer holds a service-role key.** It authenticates as
  an ordinary pharmacy admin, so it can only touch its own pharmacy.

---

## Bugs found and fixed during the port

These were all live defects, not migration artifacts.

**Schema**

- **Two different `drug_requests` tables.** `SUPABASE_MIGRATION_RBAC.sql`
  and `smart_search_requests.sql` both created it with incompatible
  columns. Both said `CREATE TABLE IF NOT EXISTS`, so whichever ran first
  won and the other silently did nothing — leaving one feature writing
  columns that did not exist. Now two tables: `drug_requests` (addressed to
  a pharmacy) and `drug_wanted_requests` (unmet demand).
- **Reservation codes were unusable.** Derived from `MD5(NEW.id)` in a
  `BEFORE INSERT` trigger, where `NEW.id` is still NULL — so every code was
  the MD5 of the empty string and the `UNIQUE` constraint rejected the
  second booking ever made.
- **`location_geog` went stale.** Backfilled once, then left to every later
  write to remember. The spatial index silently drifted from `lat`/`lng`.
- **Bulk stock upserts silently duplicated.** The uniqueness key spans
  nullable columns, and two NULLs never conflict by default — so every POS
  sync re-inserted instead of updating. Now `UNIQUE NULLS NOT DISTINCT`.
- **Columns that no migration ever declared** but the UI read and wrote:
  `delivery_required`, `delivery_address`, `reserved_until`,
  `alert_phone`, `default_threshold`, `alert_frequency`, and four
  `notify_*` flags. Every save to those forms was silently discarded.
  Declared now.

**Application**

- **`TrashPage` showed every trashed profile to every pharmacy admin.** It
  ran a membership query to scope the list, then never applied the result.
- **Admin notification preferences were written to a `metadata` column on
  `pharmacies`** that did not exist. Now `profiles.preferences`.
- **`DrugInfoPanel` selected `pregnancy_category` and `is_controlled`**;
  the columns are `pregnancy` and `controlled`.
- **`SecurityAuditPage` login history filtered `audit_logs` by pharmacy id
  against the `user_id` column** — two different id spaces, so it always
  showed an empty list. Its 2FA verify step was a toast saying the flow was
  unimplemented, while the surrounding UI reported success.
- **`B2BSupplyIntelligencePage` read a materialized view that was never
  created**, caught the error, and rendered four hardcoded rows under a
  "Live Demand Data" badge.
- **`AlertSettingsPage` reported "Simulated SMS" success** for messages
  that were never sent.
- **`PharmacyRegisterPage` set `pharmacies.id` to the user's id** and wrote
  `latitude`/`longitude`, then deliberately swallowed the failure — leaving
  accounts with no pharmacy and no way to notice.
- **`UserManagementPage` updated membership roles with no `pharmacy_id` in
  the WHERE clause**, changing that user's role at every pharmacy they
  belonged to.
- **The Maps fallback could never have worked.** The client called Google
  directly from the browser with the key in the URL when the edge function
  failed; neither API sends CORS headers, so it failed every time while
  exposing the key.
- **`AdminApprovalsPage` set rejected pharmacies to `SUSPENDED`**, making a
  rejected application indistinguishable from a suspended pharmacy.

**Found by running the app** — measured, not guessed:

- **`/api/auth/me` took 1.11s and `/dashboard` 1.39s** on every page load.
  One Neon round trip costs ~275ms from Zimbabwe, and both were sequential
  chains — four and five round trips. Collapsed into one query each:
  **0.55s** and **0.83s**.
- **The security page 403'd for anyone but a super admin.** The login
  history was calling `/api/admin/audit`; it now reads the caller's own
  `login_attempts` via `/api/profile/activity`.
- **"Failed Logins" counted every non-login event as a failure.** It
  derived `success` from `event_type === 'user_login'` over audit_logs, so
  four stock edits and a registration showed as five failed logins. Reading
  `login_attempts`, which carries a real per-attempt flag, reports two
  failures for two wrong passwords.

**Performance** — several N+1 client-side joins collapsed into single
queries: the staff roster (5 round trips), user management (3), the admin
pharmacy list (which downloaded every `pharmacy_stock` row in the system to
count them), the dashboard (4), and analytics (6). Sidebar badge counts
went from five separate head-count queries on 20–30s intervals to one.

---

## Email

Sent over plain SMTP through `nodemailer`, so any provider works — Gmail
with an app password, Zoho, Brevo, SES, Postmark, a local relay. No vendor
SDK and no lock-in.

This replaced `src/lib/emailService.ts`, which called EmailJS **from the
browser**. That could never have carried password resets: the reset link is
built from a token the browser must not hold before the user clicks it, and
the request that triggers it is unauthenticated. It was also configured
with literal placeholder values (`"your_service_id"`, quotes included), so
nothing had ever been delivered by it.

| Message | Trigger |
|---|---|
| Password reset link | `POST /api/auth/password/forgot` |
| Password changed | after a reset or a change — the only signal a hijacked account gets |
| Invitation | `POST /api/pharmacies/:id/invitations` (previously created a row and told nobody) |
| Account created | admin provisions a user, or creates a pharmacy with its first admin |
| New pharmacy awaiting approval | registration — to `ADMIN_ALERT_EMAIL`, or every active super admin |
| Pharmacy approved / rejected | `POST /api/admin/pharmacies/:id/status` |

### Configuration

```
SMTP_HOST=        SMTP_PORT=587     SMTP_USER=      SMTP_PASS=
SMTP_SECURE=false               # true only for port 465
EMAIL_FROM=                     # defaults to SMTP_USER
EMAIL_FROM_NAME=PharmConnect Zim
ADMIN_ALERT_EMAIL=              # blank → notify every active super admin
```

Leaving `SMTP_HOST` blank writes messages to the console instead, which is
how the reset link is obtained in development. The server **warns loudly at
boot** when email is unconfigured, and verifies the SMTP connection on
startup so a bad host or wrong credentials appear in the deploy log rather
than the first time someone is locked out.

Sending never throws and never blocks. A pharmacy that registered
successfully does not see an error because an administrator's alert
bounced; failures are logged with the recipient and subject.

### Testing it without a provider

`test/smtp-sink.js` is a throwaway SMTP server that accepts everything and
writes what it received to a file. It exercises the real nodemailer path —
envelope, AUTH negotiation, MIME structure — rather than only the console
fallback, which proves nothing about whether a message would send.

```bash
node test/smtp-sink.js 2525 /tmp/smtp-sink.log &
# then set SMTP_HOST=127.0.0.1 SMTP_PORT=2525 in server/.env
```

### Two injection defences, both verified

- **HTML escaping.** Pharmacy names reach an administrator's inbox. A
  pharmacy called `<script>…` renders escaped, confirmed against a live
  send.
- **Control characters in names are rejected** at the input boundary
  (`displayName` in `lib/validate.js`) and stripped again when building a
  subject. nodemailer already refuses to turn an embedded CRLF into a real
  header — tested with `Evil\r\nBcc: attacker@evil.test`, which produced
  one envelope recipient and no injected header — but it *folds* the value
  into a continuation line, so the subject still reads to a human as though
  the message carried extra headers.

## Test results

```
npx tsc --noEmit          0 errors   (was 14 pre-existing)
npm run build             passes
node --test               18 passed
./test/smoke.sh           59 passed, 0 failed
```

The smoke suite asserts denials as well as successes — the gate-1
escalation (`self-assigned global_role ignored at signup`) and cross-tenant
isolation on every pharmacy-scoped route. A suite that only checked happy
paths would have passed against the vulnerable code.

---

## Running it

```bash
# Backend
cd server
npm install
cp .env.example .env          # fill in DATABASE_URL and AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

npm run migrate               # apply schema.sql (idempotent)
npm run seed:admin -- you@example.com
node db/seed-catalogue.js     # 27 drugs
npm start                     # :4000

# Frontend
cd ..
npm install
npm run dev                   # :8080, needs VITE_API_URL
```

### Driving it in a browser

`networkidle` **never fires** on an authenticated page: the app holds an
SSE stream open at `/api/events` for realtime updates, so the network is
never idle. Playwright, Puppeteer and anything else waiting on it will time
out. Use `domcontentloaded` and wait on an element instead.

Allow generously for Neon latency when asserting on rendered content —
around 275ms per round trip from Zimbabwe, so a dashboard settles in about
a second, not instantly.

### Two connection strings

`DATABASE_URL` should be the **pooled** (`-pooler`) endpoint. The SSE
listener needs a **direct** one, because `LISTEN/NOTIFY` cannot work
through PgBouncer transaction pooling — the connection returns to the pool
after every transaction, so the registration never survives. `env.js`
derives it by removing `-pooler`; override with `DATABASE_URL_UNPOOLED`.

### If connections time out on a new host

`pg` on Node 20+ dials IPv6 and IPv4 concurrently. On a host with a AAAA
route that does not work — the common case for Neon from a plain Linux box
— the dual-stack attempt reports `ETIMEDOUT` on the IPv4 socket too and
*every* connection fails, while IPv4 alone connects instantly. `db.js`
pins IPv4. Check that first.

### Two Google Maps keys

The browser key (`VITE_GOOGLE_MAPS_API_KEY`) renders maps and cannot be
hidden — restrict it by HTTP referrer and scope it to *Maps JavaScript API
only*. The server key (`server/.env`) does geocoding and distance lookups
via `/api/maps/*`. Keep them distinct: sharing one makes the referrer
restriction pointless. See `GOOGLE_MAPS_GUIDE.md`.

---

## Outstanding

1. **SMS.** The `send-test-sms` edge function has no replacement. The UI
   now says so plainly instead of reporting a fake success.
2. **Rate limiting** covers failed logins only. The public reservation,
   search and `/api/maps/*` endpoints are unthrottled — and the maps ones
   cost real money per call. Worth doing before launch.
3. **Single-session revoke.** `SecurityAuditPage` lists every session
   individually, but revoking one signs out all other devices; there is no
   per-session endpoint yet. The UI says so rather than pretending.
4. **Backup codes** for 2FA are shown in the UI but not generated or
   stored. Losing an authenticator currently means an admin reset.
5. **Email deliverability.** Sending works, but a new domain lands in spam
   without DNS records. Set SPF, DKIM and DMARC for whatever domain
   `EMAIL_FROM` uses — a password reset in the junk folder is the same as
   no password reset.

---

## The old Supabase project

Nothing depends on it. Its data was abandoned by decision, its schema is
superseded by `server/db/schema.sql`, and no code references it.

Deleting it is yours to do — it lives in your dashboard and I have no
credentials for it. Two suggestions before you click:

- **Take a throwaway `pg_dump` first** and park it somewhere. You said you
  do not want the data, and nothing here needs it — but it is the only
  record of what the live `drugs` and `pharmacy_stock` tables actually
  held, and it costs a minute.
- **Pause rather than delete** for a couple of weeks. Pausing is
  reversible; deletion is not.

Also rotate the Supabase database password if you ever pasted it anywhere,
and revoke the old anon key's project once deleted.
