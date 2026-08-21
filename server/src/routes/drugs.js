import express from 'express';
import { z, parse, uuid, pagination } from '../lib/validate.js';
import { queryAll, queryOne } from '../db.js';
import { requireAuth, requireSuperAdmin, clientIp } from '../auth/middleware.js';
import { logAudit } from '../lib/audit.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';

export const drugRouter = express.Router();

/** Catalogue browse. Public: this is reference information, not tenant data. */
drugRouter.get('/', wrap(async (req, res) => {
  const { limit, offset } = parse(pagination, req.query);
  const { search, category } = parse(
    z.object({
      search: z.string().trim().max(120).optional(),
      category: z.string().trim().max(80).optional(),
    }),
    req.query,
  );

  const rows = await queryAll(
    `SELECT *, count(*) OVER () AS total_count
       FROM drugs
      WHERE ($1::text IS NULL
             OR generic_name ILIKE '%' || $1 || '%'
             OR common_name  ILIKE '%' || $1 || '%'
             OR EXISTS (SELECT 1 FROM unnest(brand_names) b WHERE b ILIKE '%' || $1 || '%'))
        AND ($2::text IS NULL OR category = $2)
      ORDER BY COALESCE(common_name, generic_name) ASC
      LIMIT $3 OFFSET $4`,
    [search ?? null, category ?? null, limit, offset],
  );

  res.json({
    items: rows.map(({ total_count, ...r }) => r),
    total: rows[0]?.total_count ?? 0, limit, offset,
  });
}));

/**
 * Drug information for the patient-facing panel.
 *
 * The React component keeps a hardcoded LOCAL_DRUG_INFO map as a fallback
 * for when the catalogue has no entry; this endpoint is the authoritative
 * half of that pair and 404s rather than inventing anything, so the client
 * can fall back deliberately.
 */
drugRouter.get('/:id', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const drug = await queryOne(`SELECT * FROM drugs WHERE id = $1`, [id]);
  if (!drug) throw notFound('Drug not found');
  res.json(drug);
}));

/** Where the panel starts from: a name, not an id. */
drugRouter.get('/lookup/by-name', wrap(async (req, res) => {
  const { name } = parse(z.object({ name: z.string().trim().min(1).max(120) }), req.query);

  const drug = await queryOne(
    `SELECT * FROM drugs
      WHERE generic_name ILIKE $1 OR common_name ILIKE $1
         OR EXISTS (SELECT 1 FROM unnest(brand_names) b WHERE b ILIKE $1)
      ORDER BY similarity(COALESCE(common_name, generic_name), $2) DESC
      LIMIT 1`,
    // Exact-ish match first via ILIKE, then ranked by trigram similarity so
    // "panado 500mg" still finds Panado.
    [name, name],
  );
  if (!drug) throw notFound('No catalogue entry for that name');
  res.json(drug);
}));

// Catalogue writes are super-admin only: it is shared reference data, and
// one pharmacy editing it would change what every other pharmacy sees.
drugRouter.use(requireAuth, requireSuperAdmin);

const drugBody = z.object({
  generic_name: z.string().trim().min(1).max(200),
  common_name: z.string().trim().max(200).nullable().optional(),
  strength: z.string().trim().max(80).nullable().optional(),
  form: z.string().trim().max(60).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  drug_class: z.string().trim().max(120).nullable().optional(),
  brand_names: z.array(z.string().trim().max(120)).max(50).default([]),
  search_terms: z.array(z.string().trim().max(120)).max(50).default([]),
  uses: z.array(z.string().trim().max(300)).max(50).default([]),
  side_effects: z.array(z.string().trim().max(300)).max(50).default([]),
  interactions: z.array(z.string().trim().max(300)).max(50).default([]),
  dosage: z.string().trim().max(1000).nullable().optional(),
  warnings: z.string().trim().max(2000).nullable().optional(),
  storage: z.string().trim().max(500).nullable().optional(),
  pregnancy: z.string().trim().max(500).nullable().optional(),
  controlled: z.coerce.boolean().default(false),
  requires_prescription: z.coerce.boolean().default(false),
});

drugRouter.post('/', wrap(async (req, res) => {
  const body = parse(drugBody, req.body);
  const fields = Object.keys(body);

  const row = await queryOne(
    `INSERT INTO drugs (${fields.join(', ')})
     VALUES (${fields.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING *`,
    fields.map((f) => body[f]),
  );

  logAudit({ eventType: 'drug_created', userId: req.user.id, ip: clientIp(req),
    metadata: { drug_id: row.id, name: row.generic_name } });
  res.status(201).json(row);
}));

drugRouter.patch('/:id', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const body = parse(drugBody.partial(), req.body);

  const fields = Object.keys(body);
  if (fields.length === 0) throw badRequest('No changes supplied');

  const setSql = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const row = await queryOne(
    `UPDATE drugs SET ${setSql} WHERE id = $1 RETURNING *`,
    [id, ...fields.map((f) => body[f])],
  );
  if (!row) throw notFound('Drug not found');

  logAudit({ eventType: 'drug_updated', userId: req.user.id, ip: clientIp(req),
    metadata: { drug_id: id, fields } });
  res.json(row);
}));

drugRouter.delete('/:id', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const row = await queryOne(`DELETE FROM drugs WHERE id = $1 RETURNING id`, [id]);
  if (!row) throw notFound('Drug not found');

  // pharmacy_stock.drug_id is ON DELETE SET NULL and drug_name is
  // denormalised, so pharmacies keep their listings and their inventory
  // does not silently empty when a catalogue entry is retired.
  logAudit({ eventType: 'drug_deleted', userId: req.user.id, ip: clientIp(req),
    metadata: { drug_id: id } });
  res.status(204).end();
}));
