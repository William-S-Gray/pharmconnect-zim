# Deployment

Two pieces: a static frontend on Netlify, and the API as a **persistent
process** elsewhere.

The API cannot be serverless. `server/src/routes/events.js` holds a
long-lived Postgres `LISTEN` connection open and fans changes out over
SSE — a function torn down between invocations keeps neither alive. That
rules out Vercel Functions and Cloudflare Workers for this service.
`render.yaml` in the repo root configures Render; Fly, Railway or any
container host works the same way.

---

## Order matters

`main` currently expects Supabase. Merging the migration switches the
frontend to `VITE_API_URL`, which is compiled into the bundle at build
time — so if that variable is unset when Netlify builds, the live site
ships pointing at `http://localhost:4000` and every request fails.

Deploy in this order:

1. **Host the API** and confirm `/health` returns `{"ok":true}`.
2. **Set `VITE_API_URL`** in *both* Netlify sites.
3. **Set `CORS_ORIGINS`** on the API to the Netlify origins.
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

## 2. Frontend

Netlify already builds from `netlify.toml`. Add to **both** sites:

| Variable | Value |
|---|---|
| `VITE_API_URL` | The API's HTTPS URL, no trailing slash |
| `VITE_GOOGLE_MAPS_API_KEY` | Browser key — restrict by HTTP referrer, scope to **Maps JavaScript API only** |

`VITE_*` variables are baked in at build time, so changing one needs a
redeploy, not just a restart.

---

## Verifying the cutover

```bash
curl https://<api>/health                      # {"ok":true}
curl 'https://<api>/api/search?q=paracetamol'  # results, no auth needed
```

Then in a browser: sign in, load the dashboard, and confirm the
Network tab shows calls to the API host rather than `localhost:4000`.

`networkidle` never fires on an authenticated page — the SSE stream keeps
the network permanently active — so browser tests must wait on an element
instead.

---

## Gotchas that will cost you an afternoon

- **Cookies are cross-site.** The API and frontend are on different
  domains, so sessions rely on `SameSite=None; Secure`. Both sides must be
  HTTPS, and `CORS_ORIGINS` must match the frontend origin exactly —
  scheme included, no trailing slash.
- **`pg` and IPv6.** Node dials IPv6 and IPv4 concurrently; on a host whose
  AAAA route does not work, the dual-stack attempt reports `ETIMEDOUT` on
  the IPv4 socket too and *every* connection fails. `db.js` pins IPv4.
  Check this first if connections time out on a new host.
- **Neon free tier idles.** The first request after a sleep pays a cold
  start of several seconds. The health check keeps it warm on paid plans.
- **Email needs DNS.** Sending works without SPF/DKIM/DMARC, but a
  password reset in a spam folder is the same as no password reset.
