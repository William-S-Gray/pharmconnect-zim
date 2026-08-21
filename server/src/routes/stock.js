import express from 'express';
import { z, parse, uuid, pagination } from '../lib/validate.js';
import { queryAll, queryOne, transaction } from '../db.js';
import { requireAuth, clientIp } from '../auth/middleware.js';
import { requirePharmacyRole, hasPharmacyRole, ROLES } from '../lib/authz.js';
import { logAudit } from '../lib/audit.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';

export const stockRouter = express.Router();
stockRouter.use(requireAuth);

const stockBody = z.object({
  drug_id: uuid.nullable().optional(),
  drug_name: z.string().trim().min(1).max(200),
  strength: z.string().trim().max(80).optional().nullable(),
  form: z.string().trim().max(60).optional().nullable(),
  quantity: z.coerce.number().int().min(0).default(0),
  unit_price: z.coerce.number().min(0).nullable().optional(),
  threshold: z.coerce.number().int().min(0).default(10),
  is_available: z.coerce.boolean().default(true),
  expiry_date: z.string().date().nullable().optional(),
});

/** List one pharmacy's inventory. Any member may read. */
stockRouter.get('/:pharmacyId', wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const { limit, offset } = parse(pagination, req.query);
  const { search, status } = parse(
    z.object({
      search: z.string().trim().max(120).optional(),
      status: z.enum(['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).default('ALL'),
    }),
    req.query,
  );

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_STAFF);

  // Filtering and paging happen in SQL. The pages this replaces fetched the
  // whole inventory and filtered in React, which is fine at 50 rows and not
  // at 5,000.
  const rows = await queryAll(
    `SELECT ps.*,
            CASE
              WHEN ps.quantity = 0 OR NOT ps.is_available THEN 'OUT_OF_STOCK'
              WHEN ps.quantity <= ps.threshold            THEN 'LOW_STOCK'
              ELSE 'IN_STOCK'
            END AS stock_status,
            count(*) OVER () AS total_count
       FROM pharmacy_stock ps
      WHERE ps.pharmacy_id = $1
        AND ($2::text IS NULL OR ps.drug_name ILIKE '%' || $2 || '%')
        AND ($3 = 'ALL' OR $3 = CASE
              WHEN ps.quantity = 0 OR NOT ps.is_available THEN 'OUT_OF_STOCK'
              WHEN ps.quantity <= ps.threshold            THEN 'LOW_STOCK'
              ELSE 'IN_STOCK'
            END)
      ORDER BY ps.drug_name ASC
      LIMIT $4 OFFSET $5`,
    [pharmacyId, search ?? null, status, limit, offset],
  );

  res.json({
    items: rows.map(({ total_count, ...r }) => r),
    total: rows[0]?.total_count ?? 0,
    limit,
    offset,
  });
}));

/**
 * Create a stock row.
 *
 * Admins write through. Staff cannot — their submission becomes a
 * pending_approvals row instead. That split was previously enforced only
 * in the React layer, which meant it was not enforced: the browser held a
 * Postgres role and could insert directly.
 */
stockRouter.post('/:pharmacyId', wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const body = parse(stockBody, req.body);

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_STAFF);
  const isAdmin = await hasPharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_ADMIN);

  if (!isAdmin) {
    const approval = await queryOne(
      `INSERT INTO pending_approvals (pharmacy_id, requester_id, action_type, table_name, payload)
       VALUES ($1, $2, 'CREATE', 'pharmacy_stock', $3) RETURNING *`,
      [pharmacyId, req.user.id, body],
    );
    return res.status(202).json({ pending: true, approval });
  }

  const row = await queryOne(
    `INSERT INTO pharmacy_stock
       (pharmacy_id, drug_id, drug_name, strength, form, quantity, unit_price, threshold, is_available, expiry_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [pharmacyId, body.drug_id ?? null, body.drug_name, body.strength ?? null, body.form ?? null,
     body.quantity, body.unit_price ?? null, body.threshold, body.is_available, body.expiry_date ?? null],
  );

  logAudit({ eventType: 'stock_created', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: pharmacyId, stock_id: row.id } });

  res.status(201).json(row);
}));

stockRouter.patch('/:pharmacyId/:stockId', wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const stockId = parse(uuid, req.params.stockId);
  const body = parse(stockBody.partial(), req.body);

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_STAFF);

  // Confirm the row belongs to the pharmacy named in the path before doing
  // anything else. Without this a member of pharmacy A could pass A's id
  // and B's stock id and edit B's inventory.
  const existing = await queryOne(
    `SELECT id FROM pharmacy_stock WHERE id = $1 AND pharmacy_id = $2`, [stockId, pharmacyId]);
  if (!existing) throw notFound('Stock item not found');

  const isAdmin = await hasPharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_ADMIN);
  if (!isAdmin) {
    const approval = await queryOne(
      `INSERT INTO pending_approvals (pharmacy_id, requester_id, action_type, table_name, target_id, payload)
       VALUES ($1, $2, 'UPDATE', 'pharmacy_stock', $3, $4) RETURNING *`,
      [pharmacyId, req.user.id, stockId, body],
    );
    return res.status(202).json({ pending: true, approval });
  }

  const fields = Object.keys(body);
  if (fields.length === 0) throw badRequest('No changes supplied');

  // Column names come from the schema's own key list, never from raw
  // request keys, so there is nothing user-controlled in the SQL text.
  const setSql = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const row = await queryOne(
    `UPDATE pharmacy_stock SET ${setSql}
      WHERE id = $1 AND pharmacy_id = $2 RETURNING *`,
    [stockId, pharmacyId, ...fields.map((f) => body[f])],
  );

  logAudit({ eventType: 'stock_updated', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: pharmacyId, stock_id: stockId, fields } });

  res.json(row);
}));

stockRouter.delete('/:pharmacyId/:stockId', wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const stockId = parse(uuid, req.params.stockId);

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_STAFF);

  const existing = await queryOne(
    `SELECT id FROM pharmacy_stock WHERE id = $1 AND pharmacy_id = $2`, [stockId, pharmacyId]);
  if (!existing) throw notFound('Stock item not found');

  const isAdmin = await hasPharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_ADMIN);
  if (!isAdmin) {
    const approval = await queryOne(
      `INSERT INTO pending_approvals (pharmacy_id, requester_id, action_type, table_name, target_id, payload)
       VALUES ($1, $2, 'DELETE', 'pharmacy_stock', $3, '{}'::jsonb) RETURNING *`,
      [pharmacyId, req.user.id, stockId],
    );
    return res.status(202).json({ pending: true, approval });
  }

  await queryOne(`DELETE FROM pharmacy_stock WHERE id = $1 AND pharmacy_id = $2 RETURNING id`,
    [stockId, pharmacyId]);
  logAudit({ eventType: 'stock_deleted', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: pharmacyId, stock_id: stockId } });

  res.status(204).end();
}));

/**
 * Bulk upsert, used by the spreadsheet import and the POS sync agent.
 *
 * One transaction: a partial import that leaves half a price list applied
 * is worse than one that fails outright and can be retried.
 */
stockRouter.post('/:pharmacyId/bulk', wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const { items } = parse(z.object({ items: z.array(stockBody).min(1).max(2000) }), req.body);

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_ADMIN);

  const written = await transaction(async (client) => {
    let count = 0;
    for (const item of items) {
      await client.query(
        `INSERT INTO pharmacy_stock
           (pharmacy_id, drug_id, drug_name, strength, form, quantity, unit_price, threshold, is_available, expiry_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (pharmacy_id, drug_id, strength, form) DO UPDATE
           SET quantity     = EXCLUDED.quantity,
               unit_price   = EXCLUDED.unit_price,
               threshold    = EXCLUDED.threshold,
               is_available = EXCLUDED.is_available,
               expiry_date  = EXCLUDED.expiry_date,
               drug_name    = EXCLUDED.drug_name`,
        [pharmacyId, item.drug_id ?? null, item.drug_name, item.strength ?? null, item.form ?? null,
         item.quantity, item.unit_price ?? null, item.threshold, item.is_available, item.expiry_date ?? null],
      );
      count += 1;
    }
    await logAudit({ eventType: 'stock_bulk_import', userId: req.user.id, ip: clientIp(req),
      metadata: { pharmacy_id: pharmacyId, count } }, client);
    return count;
  });

  res.json({ imported: written });
}));
