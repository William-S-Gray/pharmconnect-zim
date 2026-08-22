import express from 'express';
import { z, parse, uuid, pagination, email as emailSchema, displayName } from '../lib/validate.js';
import { queryAll, queryOne } from '../db.js';
import { requireAuth, requireSuperAdmin, clientIp } from '../auth/middleware.js';
import { requirePharmacyRole, isSuperAdmin, visiblePharmacyIds, ROLES } from '../lib/authz.js';
import { logAudit } from '../lib/audit.js';
import { sendInvitation, sendPharmacyStatusChanged } from '../lib/emails.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';

export const pharmacyRouter = express.Router();

/**
 * Public directory. Approved and active pharmacies only, and only the
 * fields a patient needs — the admin columns (mcaz_license, plan_tier,
 * lifecycle) are not in the projection at all rather than being stripped
 * later, so a future change to the client cannot start exposing them.
 */
pharmacyRouter.get('/public', wrap(async (req, res) => {
  const { city, limit, offset } = parse(
    pagination.extend({ city: z.string().trim().max(80).optional() }),
    req.query,
  );

  const rows = await queryAll(
    `SELECT id, name, address, city, suburb, phone, whatsapp_number,
            is_open_24h, operating_hours, lat, lng
       FROM pharmacies
      WHERE status = 'APPROVED' AND lifecycle_status = 'ACTIVE'
        AND ($1::text IS NULL OR LOWER(city) = LOWER($1))
      ORDER BY name ASC
      LIMIT $2 OFFSET $3`,
    [city ?? null, limit, offset],
  );
  res.json(rows);
}));

pharmacyRouter.get('/public/:id', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const pharmacy = await queryOne(
    `SELECT id, name, address, city, suburb, phone, whatsapp_number,
            is_open_24h, operating_hours, lat, lng
       FROM pharmacies
      WHERE id = $1 AND status = 'APPROVED' AND lifecycle_status = 'ACTIVE'`,
    [id],
  );
  if (!pharmacy) throw notFound('Pharmacy not found');

  const stock = await queryAll(
    `SELECT id, drug_name, strength, form, unit_price, quantity,
            CASE
              WHEN quantity = 0 OR NOT is_available THEN 'OUT_OF_STOCK'
              WHEN quantity <= threshold            THEN 'LOW_STOCK'
              ELSE 'IN_STOCK'
            END AS stock_status
       FROM pharmacy_stock
      WHERE pharmacy_id = $1 AND is_available
      ORDER BY drug_name ASC
      LIMIT 500`,
    [id],
  );

  res.json({ ...pharmacy, stock });
}));

// Everything below requires a session.
pharmacyRouter.use(requireAuth);

/** Pharmacies the caller can see: theirs, or all of them for a super admin. */
pharmacyRouter.get('/', wrap(async (req, res) => {
  const { limit, offset } = parse(pagination, req.query);
  const { status, search } = parse(
    z.object({
      status: z.enum(['ALL', 'PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED']).default('ALL'),
      search: z.string().trim().max(120).optional(),
    }),
    req.query,
  );

  // null means "no restriction" (super admin); an array scopes the query.
  const scope = await visiblePharmacyIds(req.user);
  if (scope && scope.length === 0) return res.json({ items: [], total: 0, limit, offset });

  const rows = await queryAll(
    `SELECT p.*,
            -- Counted per pharmacy in SQL. The admin page previously
            -- downloaded every pharmacy_stock row in the system just to
            -- tally them by pharmacy_id in the browser.
            (SELECT count(*) FROM pharmacy_stock s WHERE s.pharmacy_id = p.id) AS drug_count,
            count(*) OVER () AS total_count
       FROM pharmacies p
      WHERE lifecycle_status = 'ACTIVE'
        AND ($1::uuid[] IS NULL OR p.id = ANY($1))
        AND ($2 = 'ALL' OR status = $2)
        AND ($3::text IS NULL OR name ILIKE '%' || $3 || '%' OR city ILIKE '%' || $3 || '%')
      ORDER BY created_at DESC
      LIMIT $4 OFFSET $5`,
    [scope, status, search ?? null, limit, offset],
  );

  res.json({
    items: rows.map(({ total_count, ...r }) => r),
    total: rows[0]?.total_count ?? 0,
    limit,
    offset,
  });
}));

pharmacyRouter.get('/:id', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  await requirePharmacyRole(req.user, id, ROLES.PHARMACY_STAFF);

  const pharmacy = await queryOne(`SELECT * FROM pharmacies WHERE id = $1`, [id]);
  if (!pharmacy) throw notFound('Pharmacy not found');
  res.json(pharmacy);
}));

const updatableByAdmin = z.object({
  name: displayName(160).optional(),
  address: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(80).optional(),
  suburb: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  whatsapp_number: z.string().trim().max(40).nullable().optional(),
  email: emailSchema.optional(),
  mcaz_license: z.string().trim().max(80).nullable().optional(),
  is_open_24h: z.coerce.boolean().optional(),
  operating_hours: z.record(z.any()).nullable().optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  alert_phone: z.string().trim().max(40).nullable().optional(),
  default_threshold: z.coerce.number().int().min(0).max(100000).optional(),
  alert_frequency: z.enum(['realtime', 'daily', 'weekly', 'off']).optional(),
  notify_new_device: z.coerce.boolean().optional(),
  notify_new_location: z.coerce.boolean().optional(),
  notify_failed_attempt: z.coerce.boolean().optional(),
  notify_password_change: z.coerce.boolean().optional(),
});

/**
 * Update a pharmacy's own details.
 *
 * `status` and `plan_tier` are absent from the schema above on purpose:
 * approving your own pharmacy or upgrading your own plan are privileged
 * operations and live on the admin router. Anything not in the schema is
 * dropped by Zod rather than passed through.
 */
pharmacyRouter.patch('/:id', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const body = parse(updatableByAdmin, req.body);

  await requirePharmacyRole(req.user, id, ROLES.PHARMACY_ADMIN);

  const fields = Object.keys(body);
  if (fields.length === 0) throw badRequest('No changes supplied');

  const setSql = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const row = await queryOne(
    `UPDATE pharmacies SET ${setSql} WHERE id = $1 RETURNING *`,
    [id, ...fields.map((f) => body[f])],
  );

  logAudit({ eventType: 'pharmacy_updated', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: id, fields } });

  res.json(row);
}));

/**
 * Sidebar badge counts, in one round trip.
 *
 * The layout components previously issued a separate head-count query per
 * badge on a 20-30 second interval — three queries per pharmacy layout,
 * two per admin layout, forever. One query serves all of them.
 */
pharmacyRouter.get('/:id/counts', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  await requirePharmacyRole(req.user, id, ROLES.PHARMACY_STAFF);

  const counts = await queryOne(
    `SELECT
       (SELECT count(*) FROM delete_requests
         WHERE pharmacy_id = $1 AND status = 'PENDING')          AS pending_deletes,
       (SELECT count(*) FROM sync_conflicts
         WHERE pharmacy_id = $1 AND status = 'PENDING')          AS conflicts,
       (SELECT count(*) FROM drug_reservations
         WHERE pharmacy_id = $1 AND status = 'PENDING')          AS reservations,
       (SELECT count(*) FROM pending_approvals
         WHERE pharmacy_id = $1 AND status = 'PENDING')          AS approvals,
       (SELECT count(*) FROM drug_requests
         WHERE pharmacy_id = $1 AND status = 'NEW')              AS requests`,
    [id],
  );
  res.json(counts);
}));

/**
 * Dashboard figures for one pharmacy.
 *
 * Replaces four browser-side queries plus a client-side aggregation: the
 * trending list was computed by pulling the last 30 raw search rows and
 * counting them in JavaScript, which made "top searched" a sample of 30
 * rather than an actual ranking.
 */
pharmacyRouter.get('/:id/dashboard', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  await requirePharmacyRole(req.user, id, ROLES.PHARMACY_STAFF);

  // One round trip. This was five sequential ones — the pharmacy lookup,
  // then a Promise.all of three, then the month's search count — which at
  // Neon's ~275ms latency put well over a second in front of the dashboard.
  const data = await queryOne(
    `WITH ph AS (
       SELECT city, plan_tier FROM pharmacies WHERE id = $1
     )
     SELECT (SELECT plan_tier FROM ph) AS plan_tier,
            (SELECT count(*) FROM pharmacy_stock WHERE pharmacy_id = $1) AS total,
            (SELECT count(*) FROM pharmacy_stock
              WHERE pharmacy_id = $1
                AND (quantity <= threshold OR NOT is_available))          AS low_stock,
            (SELECT count(*) FROM drug_searches
              WHERE city = (SELECT city FROM ph)
                AND created_at > date_trunc('month', now()))              AS searches_this_month,
            COALESCE((
              SELECT json_agg(a) FROM (
                SELECT drug_name AS common_name, strength, quantity, threshold
                  FROM pharmacy_stock
                 WHERE pharmacy_id = $1
                   AND (quantity <= threshold OR NOT is_available)
                 ORDER BY quantity ASC
                 LIMIT 5
              ) a
            ), '[]'::json) AS recent_alerts,
            COALESCE((
              SELECT json_agg(t) FROM (
                -- Ranked across the whole month in SQL. The version this
                -- replaces pulled the last 30 raw rows and counted them in
                -- the browser, so "top searched" was a sample of 30.
                SELECT LOWER(query) AS common_name, count(*) AS search_count
                  FROM drug_searches
                 WHERE city = (SELECT city FROM ph)
                   AND created_at > now() - INTERVAL '30 days'
                 GROUP BY LOWER(query)
                 ORDER BY search_count DESC
                 LIMIT 5
              ) t
            ), '[]'::json) AS top_searched_drugs
       FROM ph`,
    [id],
  );

  if (!data) throw notFound('Pharmacy not found');

  res.json({
    searches_this_month: data.searches_this_month,
    stock: { total: data.total, low_stock: data.low_stock },
    plan_tier: data.plan_tier,
    top_searched_drugs: data.top_searched_drugs,
    recent_alerts: data.recent_alerts,
  });
}));

/** Team roster. Read for any member; a manageable list for admins. */
pharmacyRouter.get('/:id/staff', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  await requirePharmacyRole(req.user, id, ROLES.PHARMACY_STAFF);

  const rows = await queryAll(
    `SELECT p.id, p.email, p.full_name, p.avatar_url, m.role, m.created_at AS joined_at
       FROM memberships m
       JOIN profiles p ON p.id = m.user_id
      WHERE m.pharmacy_id = $1 AND p.lifecycle_status = 'ACTIVE'
      ORDER BY m.created_at ASC`,
    [id],
  );
  res.json(rows);
}));

/** Invite a colleague. Creates an invitation the signup flow consumes. */
pharmacyRouter.post('/:id/invitations', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const body = parse(
    z.object({
      email: emailSchema,
      role: z.enum([ROLES.PHARMACY_ADMIN, ROLES.PHARMACY_STAFF]).default(ROLES.PHARMACY_STAFF),
    }),
    req.body,
  );

  await requirePharmacyRole(req.user, id, ROLES.PHARMACY_ADMIN);

  // Re-inviting refreshes the expiry rather than erroring on the unique
  // constraint — resending an invite is a normal thing to want.
  const invite = await queryOne(
    `INSERT INTO invitations (email, pharmacy_id, role, invited_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (email, pharmacy_id) DO UPDATE
       SET role = EXCLUDED.role, status = 'PENDING',
           expires_at = now() + INTERVAL '14 days', invited_by = EXCLUDED.invited_by
     RETURNING *`,
    [body.email, id, body.role, req.user.id],
  );

  logAudit({ eventType: 'staff_invited', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: id, email: body.email, role: body.role } });

  // The invitation row existed before but nothing ever told the invitee,
  // so an invite only worked if someone separately mentioned it to them.
  const pharmacy = await queryOne(`SELECT name FROM pharmacies WHERE id = $1`, [id]);
  sendInvitation({
    to: body.email,
    pharmacyName: pharmacy?.name ?? 'a pharmacy',
    role: body.role,
    invitedBy: req.user.full_name || req.user.email,
  });

  res.status(201).json(invite);
}));

/** Remove a colleague from the pharmacy. */
pharmacyRouter.delete('/:id/staff/:userId', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const userId = parse(uuid, req.params.userId);

  await requirePharmacyRole(req.user, id, ROLES.PHARMACY_ADMIN);

  // Removing yourself can strand a pharmacy with no administrator, so it
  // is refused outright; a super admin can still do it from the admin API.
  if (userId === req.user.id && !isSuperAdmin(req.user)) {
    throw badRequest('You cannot remove yourself from your own pharmacy');
  }

  const removed = await queryOne(
    `DELETE FROM memberships WHERE pharmacy_id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
  if (!removed) throw notFound('That person is not a member of this pharmacy');

  logAudit({ eventType: 'staff_removed', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: id, removed_user: userId } });

  res.status(204).end();
}));
