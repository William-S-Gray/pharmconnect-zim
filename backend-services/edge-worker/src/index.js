/**
 * PharmConnect edge routing and caching layer.
 *
 * Sits in front of the API and caches drug availability searches at the
 * Cloudflare edge, keyed by the query and the caller's rough location, so
 * repeated searches from the same neighbourhood do not each cross the
 * Atlantic to the database.
 *
 * Previously this called Supabase's PostgREST endpoint directly with an
 * anon key pasted into wrangler.toml. It now forwards to the API, which
 * needs no credentials for this route — search is public.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cache = caches.default;
    const apiUrl = env.API_URL;

    if (!apiUrl) {
      return new Response(
        JSON.stringify({ error: 'Edge worker is missing API_URL' }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      );
    }

    // Only GET searches are cacheable. Everything else is passed straight
    // through to the origin.
    if (url.pathname !== '/api/search' || request.method !== 'GET') {
      return fetch(`${apiUrl}${url.pathname}${url.search}`, request);
    }

    const query = url.searchParams.get('q');
    if (!query) {
      return fetch(`${apiUrl}${url.pathname}${url.search}`, request);
    }

    // Cache key: the query plus a coarsened position. Rounding to two
    // decimal places (~1km) is what makes the cache useful — caching on
    // exact coordinates would give every caller their own entry and a 0%
    // hit rate. It also means the key never carries a precise location.
    const city = url.searchParams.get('city') ?? '';
    const lat = url.searchParams.get('lat');
    const lng = url.searchParams.get('lng');
    const cell = lat && lng
      ? `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`
      : city || 'anywhere';

    const cacheKey = new Request(
      `${url.origin}/__cache/search/${encodeURIComponent(query)}/${encodeURIComponent(cell)}`,
      { method: 'GET' },
    );

    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    const originResponse = await fetch(`${apiUrl}/api/search${url.search}`, {
      headers: { accept: 'application/json' },
    });

    // Only successful responses are cached. Caching a 5xx would pin an
    // outage in place at the edge for the full TTL.
    if (!originResponse.ok) return originResponse;

    const response = new Response(originResponse.body, originResponse);
    // Short TTL: stock levels change through the day, and a stale "in
    // stock" sends someone walking to a pharmacy that has none left.
    response.headers.set('Cache-Control', 's-maxage=120');

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
