# Google Maps Integration & Security Guide

How Google Maps is used and secured in PharmConnect Zim.

## 1. Two keys, not one

There are two distinct Google Maps keys, and keeping them separate is the
whole security model. Sharing one key between both makes the restriction on
the browser key pointless, because the same value is then valid from
anywhere.

| | Where it lives | Restriction |
|---|---|---|
| **Browser key** | `.env` → `VITE_GOOGLE_MAPS_API_KEY` | HTTP referrer, **Maps JavaScript API only** |
| **Server key** | `server/.env` → `GOOGLE_MAPS_API_KEY` | No referrer (server-side), Geocoding + Places + Distance Matrix |

### Why the browser key cannot be hidden

The Maps JavaScript SDK renders the interactive map inside the page, so its
key has to be readable by the page. That is unavoidable and it is why the
referrer restriction matters: it is the only thing stopping the key being
lifted and billed against this account from someone else's site.

Restrict it in the [Google Cloud Console](https://console.cloud.google.com/):

1. **Website restrictions (HTTP referrers)** — `localhost:8080/*` for
   development, plus your production domain.
2. **API restrictions** — *Maps JavaScript API* and nothing else. If this
   key can also call Geocoding, a referrer spoof gets free geocoding.

## 2. Server-side proxy

Geocoding, place autocomplete and distance lookups never touch the browser
key. They go through the API server, which holds the unrestricted key:

| Endpoint | Purpose |
|---|---|
| `GET /api/maps/geocode?address=` | Address → coordinates (pharmacy registration) |
| `GET /api/maps/autocomplete?input=` | Address autocomplete |
| `GET /api/maps/reverse-geocode?lat=&lng=` | Coordinates → address |
| `GET /api/maps/distance?origin_lat=…` | Driving distance and duration |

Only these four operations are exposed. A general pass-through would be an
open relay to the whole Maps API on this account's bill.

Note that these replaced a Supabase Edge Function which the client called
first and then **fell back to calling Google directly from the browser with
the key in the URL**. That fallback could never have worked — neither the
Distance Matrix nor the Geocoding API sends CORS headers — so it failed on
every request while exposing the key in the attempt. There is no fallback
in `src/lib/googleMapsProxy.ts` now.

## 3. "Find nearest pharmacy"

Uses the browser's Geolocation API for the user's position, then
`GET /api/search?q=…&lat=…&lng=…&radius_km=…`.

The radius filter is `ST_DWithin` against a GIST-indexed `geography`
column, so it is an index scan. The original computed Haversine distance
inline in the `WHERE` clause, which no index can serve — every search read
every approved pharmacy in the country.

## 4. Rate limiting

The maps endpoints are currently unauthenticated and unthrottled beyond
client-side debouncing. Before launch, put a rate limit on them: they cost
real money per call, and nothing stops a script hitting
`/api/maps/geocode` in a loop. See the outstanding items in `MIGRATION.md`.
