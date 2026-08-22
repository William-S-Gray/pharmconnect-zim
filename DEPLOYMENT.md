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
