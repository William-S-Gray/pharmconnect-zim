import express from 'express';
import { z, parse } from '../lib/validate.js';
import { env } from '../env.js';
import { wrap, badRequest, notFound } from '../lib/errors.js';

/**
 * Replaces the `google-maps-proxy` Supabase Edge Function.
 *
 * The point of proxying is that the Maps API key stays server side. A key
 * shipped to the browser can be lifted off any page that loads it and
 * billed against this account, and referrer restrictions are a speed bump
 * rather than a control.
 *
 * Only the two operations the app actually uses are exposed. A general
 * pass-through would be an open relay to the whole Maps API on someone
 * else's bill.
 */
export const mapsRouter = express.Router();

const withKey = (url, params) => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, String(v));
  u.searchParams.set('key', env.mapsApiKey);
  return u;
};

async function callGoogle(url) {
  const response = await fetch(url);
  if (!response.ok) throw badRequest('Maps lookup failed');
  const data = await response.json();
  // Google reports failures in the body with HTTP 200. The status string
  // must be checked explicitly or an error is returned to the client as a
  // successful empty result.
  if (data.status && !['OK', 'ZERO_RESULTS'].includes(data.status)) {
    console.error('[maps] upstream error', data.status, data.error_message);
    throw badRequest('Maps lookup failed');
  }
  return data;
}

mapsRouter.use((_req, _res, next) => {
  if (!env.mapsApiKey) return next(notFound('Maps integration is not configured'));
  next();
});

/** Address -> coordinates, used when a pharmacy registers. */
mapsRouter.get('/geocode', wrap(async (req, res) => {
  const { address } = parse(
    z.object({ address: z.string().trim().min(3).max(300) }), req.query);

  const data = await callGoogle(
    withKey('https://maps.googleapis.com/maps/api/geocode/json', {
      address,
      // Biased to Zimbabwe: without it "Avondale" resolves to a suburb in
      // several other countries first.
      region: 'zw',
      components: 'country:ZW',
    }),
  );

  const best = data.results?.[0];
  res.json(best
    ? {
        formatted_address: best.formatted_address,
        lat: best.geometry.location.lat,
        lng: best.geometry.location.lng,
      }
    : null);
}));

/** Coordinates -> address, for the "use my location" control. */
mapsRouter.get('/reverse-geocode', wrap(async (req, res) => {
  const { lat, lng } = parse(
    z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
    }),
    req.query,
  );

  const data = await callGoogle(
    withKey('https://maps.googleapis.com/maps/api/geocode/json', { latlng: `${lat},${lng}` }),
  );
  res.json({ address: data.results?.[0]?.formatted_address ?? null });
}));

/**
 * Driving distance between two points.
 *
 * The old client tried the edge function and then fell back to calling
 * Google straight from the browser with the key inlined in the URL. That
 * fallback could not work — the Distance Matrix API sends no CORS headers —
 * so it failed on every request while exposing the key in the attempt.
 * There is no fallback here.
 */
mapsRouter.get('/distance', wrap(async (req, res) => {
  const q = parse(
    z.object({
      origin_lat: z.coerce.number().min(-90).max(90),
      origin_lng: z.coerce.number().min(-180).max(180),
      dest_lat: z.coerce.number().min(-90).max(90),
      dest_lng: z.coerce.number().min(-180).max(180),
    }),
    req.query,
  );

  const data = await callGoogle(
    withKey('https://maps.googleapis.com/maps/api/distancematrix/json', {
      origins: `${q.origin_lat},${q.origin_lng}`,
      destinations: `${q.dest_lat},${q.dest_lng}`,
    }),
  );

  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== 'OK') return res.json(null);

  res.json({
    distance_text: element.distance.text,
    distance_value: element.distance.value,
    duration_text: element.duration.text,
    duration_value: element.duration.value,
  });
}));

/** Address autocomplete for the registration form. */
mapsRouter.get('/autocomplete', wrap(async (req, res) => {
  const { input } = parse(z.object({ input: z.string().trim().min(2).max(200) }), req.query);

  const data = await callGoogle(
    withKey('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
      input,
      components: 'country:zw',
      types: 'geocode',
    }),
  );

  res.json((data.predictions ?? []).map((p) => ({
    description: p.description,
    place_id: p.place_id,
  })));
}));
