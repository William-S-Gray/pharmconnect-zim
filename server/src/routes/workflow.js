import express from 'express';
import { z, parse, uuid, pagination } from '../lib/validate.js';
import { queryAll, queryOne, transaction } from '../db.js';
import { requireAuth, clientIp } from '../auth/middleware.js';
import { publicWriteLimit, codeLookupLimit } from '../lib/rateLimit.js';
import { requirePharmacyRole, ROLES } from '../lib/authz.js';
import { logAudit } from '../lib/audit.js';
import { wrap, notFound, badRequest, conflict, forbidden } from '../lib/errors.js';

/**
 * Patient-facing intake (reservations and drug requests) plus the internal
 * approval queue those and stock edits feed into.
 */

// ==================================================================
// Reservations — created by the public, worked by the pharmacy
// ==================================================================

export const reservationRouter = express.Router();

const reservationSchema = z.object({
  pharmacy_id: uuid,
  drug_id: uuid.nullable().optional(),
  drug_name: z.string().trim().min(1).max(200),
  patient_name: z.string().trim().min(1).max(120),
  patient_phone: z.string().trim().min(6).max(40),
  quantity: z.coerce.number().int().min(1).max(1000).default(1),
  notes: z.string().trim().max(1000).optional(),
  delivery_required: z.coerce.boolean().default(false),
  delivery_address: z.string().trim().max(300).optional(),
});

/**
 * Anonymous booking. No session required — this is how a patient reserves
 * medication before walking to the pharmacy.
 */
reservationRouter.post('/', publicWriteLimit, wrap(async (req, res) => {
  const body = parse(reservationSchema, req.body);

  // Only approved pharmacies can be booked, and the check happens here
  // rather than being implied by whatever the search returned: the client
  // supplies the pharmacy id and nothing stops it supplying another.
  const pharmacy = await queryOne(
    `SELECT id FROM pharmacies
      WHERE id = $1 AND status = 'APPROVED' AND lifecycle_status = 'ACTIVE'`,
    [body.pharmacy_id],
  );
  if (!pharmacy) throw notFound('Pharmacy not found');

  // Capture the price now so a later price change does not silently
  // rewrite what the patient was quoted.
  const stock = await queryOne(
    `SELECT unit_price FROM pharmacy_stock
      WHERE pharmacy_id = $1 AND ($2::uuid IS NULL OR drug_id = $2)
        AND drug_name ILIKE $3
      LIMIT 1`,
    [body.pharmacy_id, body.drug_id ?? null, body.drug_name],
  );

  // reserved_until is not accepted from the request: the hold window is a
  // policy decision and comes from the database's own clock.
  const row = await queryOne(
    `INSERT INTO drug_reservations
       (pharmacy_id, drug_id, drug_name, patient_name, patient_phone, quantity,
        unit_price, notes, delivery_required, delivery_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, reference_code, status, reserved_until, created_at`,
    [body.pharmacy_id, body.drug_id ?? null, body.drug_name, body.patient_name,
     body.patient_phone, body.quantity, stock?.unit_price ?? null, body.notes ?? null,
     body.delivery_required,
     body.delivery_required ? (body.delivery_address ?? null) : null],
  );

  await queryOne(
    `INSERT INTO notifications (pharmacy_id, title, message, type)
     VALUES ($1, $2, $3, 'REQUEST') RETURNING id`,
    [body.pharmacy_id, 'New reservation',
     `${body.patient_name} reserved ${body.quantity} x ${body.drug_name}`],
  );

  res.status(201).json(row);
}));

/** Look up your own booking by its reference code. */
reservationRouter.get('/by-code/:code', codeLookupLimit, wrap(async (req, res) => {
  const code = parse(z.string().trim().regex(/^RX-[A-Z0-9]{8}$/i, 'Invalid reference code'),
    req.params.code);

  const row = await queryOne(
    `SELECT r.reference_code, r.drug_name, r.quantity, r.unit_price, r.status, r.created_at,
            p.name AS pharmacy_name, p.phone AS pharmacy_phone, p.address
       FROM drug_reservations r
       JOIN pharmacies p ON p.id = r.pharmacy_id
      WHERE UPPER(r.reference_code) = UPPER($1)`,
    [code],
  );
  if (!row) throw notFound('No reservation found with that code');
  // patient_name and patient_phone are deliberately not returned: the code
  // is short enough to guess, and this endpoint is unauthenticated.
  res.json(row);
}));

reservationRouter.get('/:pharmacyId', requireAuth, wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const { limit, offset } = parse(pagination, req.query);
  const { status } = parse(
    z.object({
      status: z.enum(['ALL', 'PENDING', 'CONTACTED', 'FULFILLED', 'CANCELLED']).default('ALL'),
    }),
    req.query,
  );

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_STAFF);

  const rows = await queryAll(
    `SELECT *, count(*) OVER () AS total_count
       FROM drug_reservations
      WHERE pharmacy_id = $1 AND ($2 = 'ALL' OR status = $2)
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
    [pharmacyId, status, limit, offset],
  );

  res.json({
    items: rows.map(({ total_count, ...r }) => r),
    total: rows[0]?.total_count ?? 0, limit, offset,
  });
}));

reservationRouter.patch('/:pharmacyId/:id', requireAuth, wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const id = parse(uuid, req.params.id);
  const { status, notes } = parse(
    z.object({
      status: z.enum(['PENDING', 'CONTACTED', 'FULFILLED', 'CANCELLED']).optional(),
      notes: z.string().trim().max(1000).optional(),
    }),
    req.body,
  );

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_STAFF);

  const row = await queryOne(
    `UPDATE drug_reservations
        SET status = COALESCE($3, status), notes = COALESCE($4, notes)
      WHERE id = $1 AND pharmacy_id = $2
      RETURNING *`,
    [id, pharmacyId, status ?? null, notes ?? null],
  );
  if (!row) throw notFound('Reservation not found');

  logAudit({ eventType: 'reservation_updated', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: pharmacyId, reservation_id: id, status } });

  res.json(row);
}));

// ==================================================================
// Drug requests — "do you have this?" enquiries
// ==================================================================

export const requestRouter = express.Router();

requestRouter.post('/', publicWriteLimit, wrap(async (req, res) => {
  const body = parse(
    z.object({
      pharmacy_id: uuid,
      drug_id: uuid.nullable().optional(),
      sender_name: z.string().trim().min(1).max(120),
      sender_contact: z.string().trim().min(6).max(120),
    }),
    req.body,
  );

  const pharmacy = await queryOne(
    `SELECT id FROM pharmacies
      WHERE id = $1 AND status = 'APPROVED' AND lifecycle_status = 'ACTIVE'`,
    [body.pharmacy_id],
  );
  if (!pharmacy) throw notFound('Pharmacy not found');

  const row = await queryOne(
    `INSERT INTO drug_requests (pharmacy_id, drug_id, sender_name, sender_contact)
     VALUES ($1,$2,$3,$4) RETURNING id, status, created_at`,
    [body.pharmacy_id, body.drug_id ?? null, body.sender_name, body.sender_contact],
  );
  res.status(201).json(row);
}));

requestRouter.get('/:pharmacyId', requireAuth, wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const { limit, offset } = parse(pagination, req.query);

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_STAFF);

  const rows = await queryAll(
    `SELECT r.*, d.generic_name, d.common_name, d.strength,
            count(*) OVER () AS total_count
       FROM drug_requests r
       LEFT JOIN drugs d ON d.id = r.drug_id
      WHERE r.pharmacy_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3`,
    [pharmacyId, limit, offset],
  );

  res.json({
    items: rows.map(({ total_count, ...r }) => r),
    total: rows[0]?.total_count ?? 0, limit, offset,
  });
}));

requestRouter.patch('/:pharmacyId/:id', requireAuth, wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const id = parse(uuid, req.params.id);
  const { status } = parse(
    z.object({ status: z.enum(['NEW', 'CONTACTED', 'COMPLETED']) }), req.body);

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_STAFF);

  const row = await queryOne(
    `UPDATE drug_requests SET status = $3 WHERE id = $1 AND pharmacy_id = $2 RETURNING *`,
    [id, pharmacyId, status],
  );
  if (!row) throw notFound('Request not found');
  res.json(row);
}));

// ==================================================================
// Unmet demand — "nobody near me stocks this"
// ==================================================================

export const wantedRouter = express.Router();

/** Anonymous. This is the search dead-end turned into a signal. */
wantedRouter.post('/', publicWriteLimit, wrap(async (req, res) => {
  const body = parse(
    z.object({
      requested_query: z.string().trim().min(1).max(200),
      city: z.string().trim().max(80).optional(),
      contact_info: z.string().trim().max(120).optional(),
      notes: z.string().trim().max(1000).optional(),
    }),
    req.body,
  );

  const row = await queryOne(
    `INSERT INTO drug_wanted_requests (requested_query, city, contact_info, notes)
     VALUES ($1,$2,$3,$4) RETURNING id, status, created_at`,
    [body.requested_query, body.city ?? null, body.contact_info ?? null, body.notes ?? null],
  );
  res.status(201).json(row);
}));

/**
 * Reading unmet demand is super-admin only. It is commercially sensitive —
 * it is precisely the list of what the network cannot supply — and it
 * carries the contact details of members of the public who asked.
 */
wantedRouter.get('/', requireAuth, wrap(async (req, res) => {
  if (req.user.global_role !== 'super_admin') {
    throw forbidden('Super administrator access required');
  }
  const { status, limit, offset } = parse(
    pagination.extend({
      status: z.enum(['ALL', 'PENDING', 'REVIEWED', 'RESTOCKED', 'IGNORED']).default('ALL'),
    }),
    req.query,
  );

  const rows = await queryAll(
    `SELECT *, count(*) OVER () AS total_count
       FROM drug_wanted_requests
      WHERE ($1 = 'ALL' OR status = $1)
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    [status, limit, offset],
  );
  res.json({
    items: rows.map(({ total_count, ...r }) => r),
    total: rows[0]?.total_count ?? 0, limit, offset,
  });
}));

wantedRouter.patch('/:id', requireAuth, wrap(async (req, res) => {
  if (req.user.global_role !== 'super_admin') {
    throw forbidden('Super administrator access required');
  }
  const id = parse(uuid, req.params.id);
  const { status, notes } = parse(
    z.object({
      status: z.enum(['PENDING', 'REVIEWED', 'RESTOCKED', 'IGNORED']).optional(),
      notes: z.string().trim().max(1000).optional(),
    }),
    req.body,
  );

  const row = await queryOne(
    `UPDATE drug_wanted_requests
        SET status = COALESCE($2, status), notes = COALESCE($3, notes)
      WHERE id = $1 RETURNING *`,
    [id, status ?? null, notes ?? null],
  );
  if (!row) throw notFound('Request not found');
  res.json(row);
}));

// ==================================================================
// Approval queue — staff-submitted changes awaiting an admin
// ==================================================================

export const approvalRouter = express.Router();
approvalRouter.use(requireAuth);

approvalRouter.get('/:pharmacyId', wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const { status } = parse(
    z.object({ status: z.enum(['ALL', 'PENDING', 'APPROVED', 'REJECTED']).default('PENDING') }),
    req.query,
  );

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_STAFF);

  const rows = await queryAll(
    `SELECT a.*, p.full_name AS requester_name, p.email AS requester_email
       FROM pending_approvals a
       LEFT JOIN profiles p ON p.id = a.requester_id
      WHERE a.pharmacy_id = $1 AND ($2 = 'ALL' OR a.status = $2)
      ORDER BY a.created_at DESC
      LIMIT 200`,
    [pharmacyId, status],
  );
  res.json(rows);
}));

/**
 * Approve a queued change and apply it, atomically.
 *
 * The apply and the status flip share one transaction: if applying the
 * payload fails, the approval must not be left marked APPROVED with
 * nothing to show for it.
 */
approvalRouter.post('/:pharmacyId/:id/approve', wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const id = parse(uuid, req.params.id);

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_ADMIN);

  const result = await transaction(async (client) => {
    // FOR UPDATE serialises two admins clicking approve at the same
    // moment; without it both would read PENDING and both would apply.
    const { rows: [approval] } = await client.query(
      `SELECT * FROM pending_approvals
        WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE`,
      [id, pharmacyId],
    );
    if (!approval) throw notFound('Approval not found');
    if (approval.status !== 'PENDING') throw conflict('This request has already been reviewed');

    // Only pharmacy_stock changes are queued today. Anything else would
    // mean a payload shape this code has never seen, so refuse rather
    // than guess at how to apply it.
    if (approval.table_name !== 'pharmacy_stock') {
      throw badRequest(`Cannot apply changes to ${approval.table_name}`);
    }

    const payload = approval.payload ?? {};

    if (approval.action_type === 'CREATE') {
      await client.query(
        `INSERT INTO pharmacy_stock
           (pharmacy_id, drug_id, drug_name, strength, form, quantity, unit_price, threshold, is_available, expiry_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [pharmacyId, payload.drug_id ?? null, payload.drug_name, payload.strength ?? null,
         payload.form ?? null, payload.quantity ?? 0, payload.unit_price ?? null,
         payload.threshold ?? 10, payload.is_available ?? true, payload.expiry_date ?? null],
      );
    } else if (approval.action_type === 'UPDATE') {
      const fields = Object.keys(payload);
      if (fields.length > 0) {
        const setSql = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
        await client.query(
          `UPDATE pharmacy_stock SET ${setSql} WHERE id = $1 AND pharmacy_id = $2`,
          [approval.target_id, pharmacyId, ...fields.map((f) => payload[f])],
        );
      }
    } else if (approval.action_type === 'DELETE') {
      await client.query(`DELETE FROM pharmacy_stock WHERE id = $1 AND pharmacy_id = $2`,
        [approval.target_id, pharmacyId]);
    }

    const { rows: [updated] } = await client.query(
      `UPDATE pending_approvals
          SET status = 'APPROVED', reviewer_id = $2, reviewed_at = now()
        WHERE id = $1 RETURNING *`,
      [id, req.user.id],
    );

    await client.query(
      `INSERT INTO notifications (user_id, pharmacy_id, title, message, type)
       VALUES ($1,$2,$3,$4,'APPROVAL')`,
      [approval.requester_id, pharmacyId, 'Change approved',
       `Your ${approval.action_type.toLowerCase()} request was approved`],
    );

    await logAudit({ eventType: 'approval_granted', userId: req.user.id, ip: clientIp(req),
      metadata: { pharmacy_id: pharmacyId, approval_id: id, action: approval.action_type } }, client);

    return updated;
  });

  res.json(result);
}));

approvalRouter.post('/:pharmacyId/:id/reject', wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const id = parse(uuid, req.params.id);
  const { notes } = parse(z.object({ notes: z.string().trim().max(500).optional() }), req.body);

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_ADMIN);

  const row = await queryOne(
    `UPDATE pending_approvals
        SET status = 'REJECTED', reviewer_id = $3, reviewed_at = now(), notes = $4
      WHERE id = $1 AND pharmacy_id = $2 AND status = 'PENDING'
      RETURNING *`,
    [id, pharmacyId, req.user.id, notes ?? null],
  );
  if (!row) throw notFound('No pending approval with that id');

  logAudit({ eventType: 'approval_rejected', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: pharmacyId, approval_id: id } });

  res.json(row);
}));

// ==================================================================
// Notifications
// ==================================================================

export const notificationRouter = express.Router();
notificationRouter.use(requireAuth);

notificationRouter.get('/', wrap(async (req, res) => {
  // Addressed to the caller directly, or to a pharmacy they belong to.
  // The membership subquery is what keeps a pharmacy-wide notice from
  // reaching someone who merely knows the pharmacy id.
  const rows = await queryAll(
    `SELECT n.*
       FROM notifications n
      WHERE NOT n.is_dismissed
        AND (n.user_id = $1
             OR n.pharmacy_id IN (SELECT pharmacy_id FROM memberships WHERE user_id = $1))
      ORDER BY n.created_at DESC
      LIMIT 100`,
    [req.user.id],
  );
  res.json(rows);
}));

notificationRouter.post('/:id/read', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const row = await queryOne(
    `UPDATE notifications SET is_read = true
      WHERE id = $1
        AND (user_id = $2
             OR pharmacy_id IN (SELECT pharmacy_id FROM memberships WHERE user_id = $2))
      RETURNING id`,
    [id, req.user.id],
  );
  if (!row) throw notFound('Notification not found');
  res.status(204).end();
}));

notificationRouter.post('/:id/dismiss', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const row = await queryOne(
    `UPDATE notifications SET is_dismissed = true
      WHERE id = $1
        AND (user_id = $2
             OR pharmacy_id IN (SELECT pharmacy_id FROM memberships WHERE user_id = $2))
      RETURNING id`,
    [id, req.user.id],
  );
  if (!row) throw notFound('Notification not found');
  res.status(204).end();
}));
