/**
 * PharmConnect Edge Routing & H3 Caching Layer
 * 
 * This Cloudflare Worker intercepts requests to /api/search and implements
 * localized caching based on the user's H3 Hexagon Cell ID.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cache = caches.default;

    // Only cache GET searches
    if (url.pathname !== '/api/search' || request.method !== 'GET') {
      return fetch(request);
    }

    const drug = url.searchParams.get('drug');
    const h3Index = url.searchParams.get('h3'); // Client passes their H3 cell ID
    
    if (!drug || !h3Index) {
      return fetch(request);
    }

    // Create a cache key unique to the drug and the 1km hexagon
    const cacheKey = new Request(`${url.origin}/cache/${drug}/${h3Index}`, request);
    
    let response = await cache.match(cacheKey);

    if (!response) {
      console.log(`[EDGE] Cache Miss for ${drug} in Cell ${h3Index}. Fetching from Supabase...`);
      
      // Call Supabase RPC
      const supabaseRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/find_nearby_pharmacies_v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_ANON_KEY // Should be a secret
        },
        body: JSON.stringify({
          p_query: drug,
          p_h3: h3Index // In a real setup, we'd query by H3 neighbor cells for 10x speed
        })
      });

      // Construct response to cache
      response = new Response(supabaseRes.body, supabaseRes);
      response.headers.append('Cache-Control', 's-maxage=300'); // Cache for 5 minutes at the edge

      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    } else {
      console.log(`[EDGE] Cache Hit! Serving ${drug} for Cell ${h3Index} directly from Harare Edge Node.`);
    }

    return response;
  },
};
