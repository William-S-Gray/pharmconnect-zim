# Deployment

Three pieces:

| Piece | Where | Why |
|---|---|---|
| Frontend (Vite SPA) | **Vercel** | static build, `vercel.json` at the repo root |
| API | **Render** | needs a persistent process — see below |
| Database | **Neon** | Postgres 18 with PostGIS, pg_trgm, h3 |

**The API cannot live on Vercel**, which is why the split exists.
`server/src/routes/events.js` holds a long-lived Postgres `LISTEN`
connection open and fans changes out over SSE; a function torn down
between invocations keeps neither alive. `render.yaml` configures a
persistent process. The frontend is static, so Vercel suits it fine.

---

## Order matters

`main` currently expects Supabase. Merging the migration switches the
frontend to `VITE_API_URL`, which is compiled into the bundle **at build
time** — so if it is unset when Vercel builds, the live site ships
pointing at `http://localhost:4000` and every request fails.

Deploy in this order:

1. **Host the API** on Render; confirm `/health` returns `{"ok":true}`.
2. **Set `VITE_API_URL`** on the Vercel project.
3. **Set `CORS_ORIGINS`** on the API to the Vercel origin.
4. **Merge**, then confirm the deployed site talks to Neon.
5. Only then retire Supabase — pause it first, delete later.

---

## 1. API

```bash
render blueprint launch      # reads render.yaml
```

Or connect the repo in the Render dashboard with root directory `server`,
build `npm ci`, start `node src/index.js`, health check `/health`.

**The blueprint asks for `starter`, not `free`.** Free spins down after
~15 minutes idle; measured on it, the first request after a sleep took 22
seconds, and the SSE listener's Postgres `LISTEN` connection dies with the
instance, so realtime stays dead until someone wakes it. Changing the plan
is a billing decision, and Render will not act on the line in `render.yaml`
until the blueprint is synced or the plan is changed in the dashboard.

### Environment

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon **pooled** string (the `-pooler` host) |
| `DATABASE_URL_UNPOOLED` | Optional. Direct string for the SSE listener; derived by removing `-pooler` if unset |
| `AUTH_SECRET` | **Generate once, never rotate** — it is the password pepper, and changing it invalidates every stored password |
| `CORS_ORIGINS` | Comma-separated. The actual gate on which browsers may call the API |
| `APP_URL` | Where password-reset and invitation links point |
| `TRUST_PROXY` | `true` on Render. Without it the login rate limiter sees the proxy's IP for every request |
| `NODE_ENV` | `production` — switches cookies to `Secure` + `SameSite=None` |
| `GOOGLE_MAPS_API_KEY` | Server-side key, distinct from the browser one |
| `MAPS_HOURLY_BUDGET` | Optional, default 1000. Ceiling on Google-billed lookups per hour across all callers — the per-caller rate limit does nothing about many callers |
| `SMTP_*`, `EMAIL_FROM` | Without these, password reset cannot be delivered |

### After first deploy

```bash
# Schema (idempotent, safe to re-run)
DATABASE_URL='...' node db/migrate.js

# First administrator — there is no hardcoded one
DATABASE_URL='...' AUTH_SECRET='...' node db/seed-admin.js you@example.com

# Drug catalogue: 27 entries, 10 with reviewed clinical copy
DATABASE_URL='...' node db/seed-catalogue.js
```

---

## 2. Frontend (Vercel)

`vercel.json` at the repo root sets the build, the SPA rewrite and cache
headers. `.vercelignore` keeps `server/` out of the frontend build.

**`vercel.json` accepts no comments.** It is validated against a strict
schema that rejects additional properties, so the `"//"` key that works in
`package.json` fails the deploy with *"should NOT have additional
property"*. What each block is for:

| Block | Why |
|---|---|
| `rewrites` | Client-side routing — an unmatched path serves the SPA shell so `/dashboard/stock` does not 404 on refresh. The negative lookahead keeps `/assets/` and `/api/` out of it. |
| `Cache-Control` on `/assets/(.*)` | Vite fingerprints these filenames, so a URL's contents never change and it is safe to cache forever. |
| `Cache-Control` on `/index.html` | Must never be cached, or a deploy leaves browsers loading a shell that references bundles which no longer exist. |
| `Permissions-Policy` | The app asks for geolocation to find nearby pharmacies; everything else is denied. |

| Variable | Value |
|---|---|
| `VITE_API_URL` | The Render API URL, no trailing slash |
| `VITE_GOOGLE_MAPS_API_KEY` | Browser key — restrict by HTTP referrer, scope to **Maps JavaScript API only** |

`VITE_*` variables are baked in at build time, so changing one needs a
**redeploy**, not just a restart. Setting the variable alone changes
nothing until the next build.

Set them for Production *and* Preview, or preview deployments silently
fall back to `localhost:4000`.

---

## 3. Email DNS

Mail sends without any of this. It just does not arrive: a domain nobody
has vouched for goes to junk, and a password reset in a junk folder is the
same as no password reset. Since February 2024 Gmail and Yahoo reject bulk
mail outright when these are missing.

**Two things must exist before a single record can be written**: a
registered domain, and a chosen SMTP provider. The domain is what the
records live on; the provider is what they authorise. `EMAIL_FROM` must
then be an address *at that domain* — the whole scheme checks that the
visible From matches the domain that authenticated the message, so mail
sent as `you@gmail.com` through your own provider fails no matter how
correct your records are.

### The three records

Replace `example.co.zw` with your domain. Your provider's dashboard prints
its own exact values — paste those; this is what to expect, not a
substitute for them.

| Purpose | Host | Type | Value |
|---|---|---|---|
| SPF | `@` (the root) | TXT | `v=spf1 include:<provider> ~all` |
| DKIM | `<selector>._domainkey` | TXT or CNAME | issued by the provider — a public key, or a CNAME pointing at theirs |
| DMARC | `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@example.co.zw; fo=1` |

The `include:` depends on the provider. Each of these was confirmed to
publish a live SPF record:

| Provider | `include:` |
|---|---|
| Google Workspace | `_spf.google.com` |
| Brevo | `spf.brevo.com` |
| Zoho | `zohomail.com` |
| Amazon SES | `amazonses.com` |
| Postmark | `spf.mtasv.net` |
| Mailgun | `mailgun.org` |
| SendGrid | `sendgrid.net` |

### What actually goes wrong

- **Two SPF records is worse than none.** RFC 7208 permits exactly one per
  domain; a second does not merge with the first, it makes receivers fail
  the check outright. Adding a provider means editing the existing record,
  never adding another.
- **An empty `p=` in a DKIM record is a revocation**, not a placeholder.
  The record exists, looks configured, and fails every signature.
- **Start at `p=none`.** DMARC's policy applies to mail that fails, and the
  first thing it usually catches is your own forgotten sender. Read the
  `rua` reports for a couple of weeks, then move to `p=quarantine` and only
  then `p=reject`. Going straight to reject silently discards real mail.
- **`~all`, not `+all`.** `+all` authorises the entire internet to send as
  you, which is worse than publishing nothing.

### Checking it

```bash
cd server
./test/check-email-dns.sh example.co.zw            # probes common selectors
./test/check-email-dns.sh example.co.zw brevo1     # or name yours
```

Exits non-zero if SPF, DKIM or DMARC is missing or broken. It queries over
DNS-over-HTTPS rather than the local resolver, which is the component most
likely to be answering from a stale cache — a record can look absent for
hours after you add it if you only ask your own machine.

Records take up to a few hours to propagate, and the provider will not
mark the domain verified until it sees them.

---

## Health endpoints

| Path | Checks | Use for |
|---|---|---|
| `/health` | the process is alive | platform restart probe |
| `/health/ready` | the process **and** Postgres | monitoring, deploy gates |

Keep the restart probe on `/health`. Pointing it at `/health/ready`
couples the instance's survival to the database being warm: on a stack
where both the host and Neon idle, a cold database makes the check slow,
the platform cycles the instance, and the service flaps between healthy
and unroutable with nothing actually wrong.

## Verifying the cutover

```bash
curl https://<api>/health                      # {"ok":true}
curl https://<api>/health/ready                # {"ok":true,"database":"reachable"}
curl 'https://<api>/api/search?q=paracetamol'  # results, no auth needed
```

Then in a browser: sign in, load the dashboard, and confirm the
Network tab shows calls to the API host rather than `localhost:4000`.

`networkidle` never fires on an authenticated page — the SSE stream keeps
the network permanently active — so browser tests must wait on an element
instead.

---

## Gotchas that will cost you an afternoon

- **Cookies are cross-site.** Vercel and Render are different domains, so
  sessions rely on `SameSite=None; Secure`. Both sides must be HTTPS, and
  `CORS_ORIGINS` must match the frontend origin exactly — scheme included,
  no trailing slash. Vercel preview URLs are per-deployment, so a preview
  cannot log in unless its origin is added too.
- **`AUTH_SECRET` is the password pepper.** Every environment sharing a
  database must use the identical value, and it must never be rotated —
  a different secret cannot verify existing password hashes, so every
  login returns 401 with nothing else appearing wrong.
- **`pg` and IPv6.** Node dials IPv6 and IPv4 concurrently; on a host whose
  AAAA route does not work, the dual-stack attempt reports `ETIMEDOUT` on
  the IPv4 socket too and *every* connection fails. `db.js` pins IPv4.
  Check this first if connections time out on a new host.
- **Neon free tier idles.** The first request after a sleep pays a cold
  start of several seconds. The health check keeps it warm on paid plans.
- **Email needs DNS.** Sending works without SPF/DKIM/DMARC, but a
  password reset in a spam folder is the same as no password reset.
- **Rate limits are per instance and held in memory.** Running two API
  instances doubles every public limit, and a deploy resets the counters.
  One instance is the assumption; scaling out needs a shared store rather
  than a bigger number. See "Rate limiting" in `MIGRATION.md`.
