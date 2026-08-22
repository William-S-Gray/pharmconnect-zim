import express from 'express';
import { z, parse, uuid } from '../lib/validate.js';
import { queryAll, queryOne, transaction } from '../db.js';
import { requireAuth, clientIp } from '../auth/middleware.js';
import { requirePharmacyRole, isSuperAdmin, visiblePharmacyIds, ROLES } from '../lib/authz.js';
import { logAudit } from '../lib/audit.js';
import { sendMail } from '../lib/mailer.js';
import { emailConfigured } from '../env.js';
import { wrap, notFound, badRequest, forbidden, ApiError } from '../lib/errors.js';

/**
 * The caller's own account, the deletion-request workflow, and the offline
 * sync conflict queue — everything scoped to "me" or "my pharmacy" rather
 * than to the admin console.
 */

// ==================================================================
// Own profile
// ==================================================================

export const profileRouter = express.Router();
profileRouter.use(requireAuth);

profileRouter.get('/', wrap(async (req, res) => {
  const profile = await queryOne(
    `SELECT id, email, full_name, avatar_url, global_role, lifecycle_status,
            preferences, created_at
       FROM profiles WHERE id = $1`,
    [req.user.id],
  );
  res.json(profile);
}));

/**
 * Update your own display fields.
 *
 * global_role and lifecycle_status are absent from this schema on purpose,
 * and Zod drops anything not in it. This is the endpoint the gate-1
 * escalation went through in its client-side form — the old code read a
 * role out of user_metadata and wrote it to profiles — so the safe
 * property here is that there is no code path from this handler to that
 * column at all.
 */
profileRouter.patch('/', wrap(async (req, res) => {
  const body = parse(
    z.object({
      full_name: z.string().trim().min(1).max(120).optional(),
      avatar_url: z.string().trim().url().max(500).nullable().optional(),
      // UI preferences only. Nothing authorizes off this column, so an
      // arbitrary object is safe here in a way it would not be elsewhere.
      preferences: z.record(z.any()).optional(),
    }),
    req.body,
  );

  const fields = Object.keys(body);
  if (fields.length === 0) throw badRequest('No changes supplied');

  const setSql = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const row = await queryOne(
    `UPDATE profiles SET ${setSql} WHERE id = $1
     RETURNING id, email, full_name, avatar_url, global_role, preferences`,
    [req.user.id, ...fields.map((f) => body[f])],
  );

  logAudit({ eventType: 'profile_updated', userId: req.user.id, ip: clientIp(req),
    metadata: { fields } });
  res.json(row);
}));

/**
 * Send a test message to the caller's own address.
 *
 * Deliberately hard-wired to the session's email rather than accepting a
 * recipient: an endpoint that mails arbitrary addresses on request is an
 * open relay, and one attached to a trusted domain is a good phishing
 * vector.
 */
profileRouter.post('/test-email', wrap(async (req, res) => {
  if (!emailConfigured) {
    // A clear 503 rather than a success the operator would have to check
    // their inbox to disprove.
    throw new ApiError(503, 'Email delivery is not configured on this server.');
  }

  const sent = await sendMail({
    to: req.user.email,
    subject: 'PharmConnect test email',
    html: `<p>This is a test message from PharmConnect Zim.</p>
           <p>If you received it, security alerts and password resets will reach this address.</p>`,
  });

  if (!sent) throw new ApiError(502, 'The mail server rejected the message. Check the server logs.');

  logAudit({ eventType: 'test_email_sent', userId: req.user.id, ip: clientIp(req) });
  res.json({ ok: true, sent_to: req.user.email });
}));

/**
 * The caller's own login history.
 *
 * Read from login_attempts, not audit_logs. The security page needs a real
 * success flag per attempt, and audit_logs only records things that
 * happened — so deriving "failed" from it meant treating every non-login
 * event as a failure. With four stock edits and a registration on file
 * the page cheerfully reported five failed logins when there had been
 * none.
 *
 * Scoped to the session's own email, which is also what stops this
 * becoming a way to read someone else's history. It was previously
 * calling /api/admin/audit, which 403s for anyone but a super admin.
 */
profileRouter.get('/activity', wrap(async (req, res) => {
  const { limit } = parse(
    z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }), req.query);

  const rows = await queryAll(
    `SELECT id, ip_address, success, attempted_at
       FROM login_attempts
      WHERE LOWER(email) = LOWER($1)
      ORDER BY attempted_at DESC
      LIMIT $2`,
    [req.user.email, limit],
  );
  res.json(rows);
}));

// ==================================================================
// Deletion requests (user asks, admin decides)
// ==================================================================

export const deleteRequestRouter = express.Router();
deleteRequestRouter.use(requireAuth);

/** Raise a request to delete a pharmacy or a profile. */
deleteRequestRouter.post('/', wrap(async (req, res) => {
  const body = parse(
    z.object({
      target_table: z.enum(['profiles', 'pharmacies']),
      target_id: uuid,
      reason: z.string().trim().min(1).max(1000),
      pharmacy_id: uuid.optional(),
    }),
    req.body,
  );

  // You may only ask to delete your own profile, or a pharmacy you
  // administer. Without this check the endpoint would queue a deletion of
  // anything for anyone, and an admin approving in good faith would carry
  // it out.
  if (body.target_table === 'profiles') {
    if (body.target_id !== req.user.id && !isSuperAdmin(req.user)) {
      throw forbidden('You can only request deletion of your own account');
    }
  } else {
    await requirePharmacyRole(req.user, body.target_id, ROLES.PHARMACY_ADMIN);
  }

  const row = await queryOne(
    `INSERT INTO delete_requests (requester_id, pharmacy_id, target_table, target_id, reason)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.id, body.pharmacy_id ?? (body.target_table === 'pharmacies' ? body.target_id : null),
     body.target_table, body.target_id, body.reason],
  );

  logAudit({ eventType: 'delete_requested', userId: req.user.id, ip: clientIp(req),
    metadata: { target_table: body.target_table, target_id: body.target_id } });

  res.status(201).json(row);
}));

/** Requests the caller can see: their own, or their pharmacy's. */
deleteRequestRouter.get('/', wrap(async (req, res) => {
  const scope = await visiblePharmacyIds(req.user);
  const rows = await queryAll(
    `SELECT dr.*, p.full_name AS requester_name, ph.name AS pharmacy_name
       FROM delete_requests dr
       LEFT JOIN profiles p   ON p.id  = dr.requester_id
       LEFT JOIN pharmacies ph ON ph.id = dr.pharmacy_id
      WHERE dr.requester_id = $1
         OR ($2::uuid[] IS NULL OR dr.pharmacy_id = ANY($2))
      ORDER BY dr.created_at DESC
      LIMIT 200`,
    [req.user.id, scope],
  );
  res.json(rows);
}));

// ==================================================================
// Offline sync conflicts
// ==================================================================

export const syncRouter = express.Router();
syncRouter.use(requireAuth);

/**
 * Record a conflict detected while replaying the offline queue.
 *
 * The client sends both versions and the server stores them for a human to
 * resolve; it does not attempt to merge. Automatic resolution of a stock
 * count is how you silently lose an inventory correction.
 */
syncRouter.post('/conflicts', wrap(async (req, res) => {
  const body = parse(
    z.object({
      pharmacy_id: uuid,
      table_name: z.string().trim().max(80),
      record_id: uuid,
      local_data: z.record(z.any()),
      server_data: z.record(z.any()),
    }),
    req.body,
  );

  await requirePharmacyRole(req.user, body.pharmacy_id, ROLES.PHARMACY_STAFF);

  const row = await queryOne(
    `INSERT INTO sync_conflicts (user_id, pharmacy_id, table_name, record_id, local_data, server_data)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.id, body.pharmacy_id, body.table_name, body.record_id,
     body.local_data, body.server_data],
  );
  res.status(201).json(row);
}));

syncRouter.get('/conflicts/:pharmacyId', wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const { status } = parse(
    z.object({ status: z.enum(['ALL', 'PENDING', 'RESOLVED', 'DISCARDED']).default('PENDING') }),
    req.query,
  );

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_STAFF);

  const rows = await queryAll(
    `SELECT c.*, p.full_name AS user_name
       FROM sync_conflicts c
       LEFT JOIN profiles p ON p.id = c.user_id
      WHERE c.pharmacy_id = $1 AND ($2 = 'ALL' OR c.status = $2)
      ORDER BY c.created_at DESC
      LIMIT 200`,
    [pharmacyId, status],
  );
  res.json(rows);
}));

/**
 * Resolve a conflict by choosing a side.
 *
 * 'local' applies the queued offline version to the row; 'server' discards
 * it. Both the apply and the status change happen in one transaction, so a
 * conflict is never marked resolved without its chosen version landing.
 */
syncRouter.post('/conflicts/:pharmacyId/:id/resolve', wrap(async (req, res) => {
  const pharmacyId = parse(uuid, req.params.pharmacyId);
  const id = parse(uuid, req.params.id);
  const { resolution } = parse(
    z.object({ resolution: z.enum(['local', 'server']) }), req.body);

  await requirePharmacyRole(req.user, pharmacyId, ROLES.PHARMACY_ADMIN);

  const result = await transaction(async (client) => {
    const { rows: [conflict] } = await client.query(
      `SELECT * FROM sync_conflicts WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE`,
      [id, pharmacyId],
    );
    if (!conflict) throw notFound('Conflict not found');
    if (conflict.status !== 'PENDING') throw badRequest('This conflict is already resolved');

    if (resolution === 'local') {
      // Only pharmacy_stock is replayable today. Anything else would be a
      // payload shape this code has not seen, so refuse rather than guess.
      if (conflict.table_name !== 'pharmacy_stock') {
        throw badRequest(`Cannot replay changes to ${conflict.table_name}`);
      }
      const payload = conflict.local_data ?? {};
      const allowed = ['quantity', 'unit_price', 'threshold', 'is_available', 'expiry_date', 'drug_name'];
      const fields = Object.keys(payload).filter((f) => allowed.includes(f));
      if (fields.length > 0) {
        const setSql = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
        await client.query(
          `UPDATE pharmacy_stock SET ${setSql} WHERE id = $1 AND pharmacy_id = $2`,
          [conflict.record_id, pharmacyId, ...fields.map((f) => payload[f])],
        );
      }
    }

    const { rows: [updated] } = await client.query(
      `UPDATE sync_conflicts
          SET status = $2, resolved_by = $3, resolved_at = now()
        WHERE id = $1 RETURNING *`,
      [id, resolution === 'local' ? 'RESOLVED' : 'DISCARDED', req.user.id],
    );

    await logAudit({ eventType: 'sync_conflict_resolved', userId: req.user.id, ip: clientIp(req),
      metadata: { conflict_id: id, resolution } }, client);

    return updated;
  });

  res.json(result);
}));
