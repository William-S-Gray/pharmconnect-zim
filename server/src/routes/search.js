import express from 'express';
import { z, parse } from '../lib/validate.js';
import { queryAll, query } from '../db.js';
import { expandSymptoms, detectIntent } from '../lib/symptoms.js';
import { wrap } from '../lib/errors.js';

export const searchRouter = express.Router();

const searchSchema = z.object({
  q: z.string().trim().min(1, 'Enter something to search for').max(120),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius_km: z.coerce.number().min(1).max(500).default(50),
  city: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Public drug availability search.
 *
 * Ported from find_nearby_pharmacies_v2(). Two things changed:
 *
 *  - Distance uses PostGIS ST_DWithin against the GIST-indexed
 *    location_geog rather than Haversine arithmetic in the WHERE clause.
 *    The arithmetic version could not use an index, so every search read
 *    every approved pharmacy.
 *  - Symptom expansion moved to JavaScript (lib/symptoms.js) and arrives
 *    here as a parameter, so the SQL is fixed text with bound parameters
 *    instead of a query built around a CASE over user input.
 */
searchRouter.get('/', wrap(async (req, res) => {
  const params = parse(searchSchema, req.query);
  const keywords = expandSymptoms(params.q);
  const hasPoint = params.lat !== undefined && params.lng !== undefined;

  const rows = await queryAll(
    `WITH origin AS (
       SELECT CASE WHEN $2::float8 IS NOT NULL AND $3::float8 IS NOT NULL
                   THEN ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography
              END AS geog
     )
     SELECT ph.id            AS pharmacy_id,
            ph.name          AS pharmacy_name,
            ph.suburb, ph.city, ph.phone, ph.whatsapp_number,
            ph.lat, ph.lng,
            d.id             AS drug_id,
            COALESCE(ps.drug_name, d.common_name, d.generic_name) AS drug_name,
            COALESCE(ps.strength, d.strength)                     AS drug_strength,
            ps.id            AS stock_id,
            ps.unit_price, ps.quantity,
            CASE
              WHEN ps.quantity = 0 OR NOT ps.is_available THEN 'OUT_OF_STOCK'
              WHEN ps.quantity <= ps.threshold            THEN 'LOW_STOCK'
              ELSE 'IN_STOCK'
            END AS stock_status,
            CASE WHEN o.geog IS NOT NULL AND ph.location_geog IS NOT NULL
                 THEN ROUND((ST_Distance(ph.location_geog, o.geog) / 1000)::numeric, 1)
            END AS distance_km
       FROM pharmacy_stock ps
       JOIN pharmacies ph ON ph.id = ps.pharmacy_id
       LEFT JOIN drugs  d ON d.id = ps.drug_id
       CROSS JOIN origin o
      WHERE ph.status = 'APPROVED'
        AND ph.lifecycle_status = 'ACTIVE'
        AND ($5::text IS NULL OR LOWER(ph.city) = LOWER($5))
        AND (
              ps.drug_name  ILIKE '%' || $1 || '%'
           OR d.generic_name ILIKE '%' || $1 || '%'
           OR d.common_name  ILIKE '%' || $1 || '%'
           -- && is the array-overlap operator: true when any brand name or
           -- search term matches any expanded symptom keyword.
           OR ($6::text[] <> '{}' AND (
                 d.generic_name ILIKE ANY (SELECT '%' || k || '%' FROM unnest($6::text[]) k)
              OR d.common_name  ILIKE ANY (SELECT '%' || k || '%' FROM unnest($6::text[]) k)
              OR ps.drug_name   ILIKE ANY (SELECT '%' || k || '%' FROM unnest($6::text[]) k)
           ))
           OR EXISTS (SELECT 1 FROM unnest(d.brand_names)  b WHERE b ILIKE '%' || $1 || '%')
           OR EXISTS (SELECT 1 FROM unnest(d.search_terms) t WHERE t ILIKE '%' || $1 || '%')
        )
        -- Radius filter only when the caller gave a position. ST_DWithin on
        -- a geography column is index-backed, unlike the original's inline
        -- Haversine expression.
        AND (o.geog IS NULL OR ph.location_geog IS NULL
             OR ST_DWithin(ph.location_geog, o.geog, $4 * 1000))
      ORDER BY distance_km ASC NULLS LAST, ps.unit_price ASC NULLS LAST
      LIMIT $7`,
    [
      params.q,
      hasPoint ? params.lat : null,
      hasPoint ? params.lng : null,
      params.radius_km,
      params.city ?? null,
      keywords,
      params.limit,
    ],
  );

  // Analytics are best-effort: a logging failure must not fail the search.
  query(
    `INSERT INTO drug_searches (query, city, result_count, user_id) VALUES ($1,$2,$3,$4)`,
    [params.q, params.city ?? 'Harare', rows.length, req.user?.id ?? null],
  ).catch((err) => console.error('[search] analytics insert failed', err));

  res.json({ query: params.q, intent: detectIntent(params.q), results: rows });
}));

/** Intent classification on its own, for the search bar's live hinting. */
searchRouter.get('/intent', wrap(async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().max(120).default('') }), req.query);
  const intent = detectIntent(q);

  query(
    `INSERT INTO smart_search_logs (query, detected_intent, city, user_id) VALUES ($1,$2,$3,$4)`,
    [q, intent, req.query.city ?? null, req.user?.id ?? null],
  ).catch((err) => console.error('[search] intent log failed', err));

  res.json({ intent, suggestions: expandSymptoms(q) });
}));

/** Typeahead over the drug catalogue, for the stock-entry form. */
searchRouter.get('/drugs', wrap(async (req, res) => {
  const { q, limit } = parse(
    z.object({
      q: z.string().trim().min(1).max(80),
      limit: z.coerce.number().int().min(1).max(25).default(10),
    }),
    req.query,
  );

  const rows = await queryAll(
    `SELECT id, common_name, generic_name, strength, form
       FROM drugs
      WHERE generic_name ILIKE '%' || $1 || '%'
         OR common_name  ILIKE '%' || $1 || '%'
         OR EXISTS (SELECT 1 FROM unnest(brand_names) b WHERE b ILIKE '%' || $1 || '%')
      -- similarity() needs pg_trgm; ranks exact-ish prefixes above
      -- incidental substring hits.
      ORDER BY similarity(COALESCE(common_name, generic_name), $1) DESC
      LIMIT $2`,
    [q, limit],
  );
  res.json(rows);
}));
