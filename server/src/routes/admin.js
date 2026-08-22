import express from 'express';
import {
  z, parse, uuid, pagination,
  email as emailSchema, password as passwordSchema, displayName } from '../lib/validate.js';
import { queryAll, queryOne, transaction } from '../db.js';
import { requireAuth, requireSuperAdmin, clientIp } from '../auth/middleware.js';
import { revokeAllSessions } from '../auth/session.js';
import { hashPassword } from '../auth/password.js';
import { ROLES } from '../lib/authz.js';
import { logAudit } from '../lib/audit.js';
import { sendAccountCreated, sendPharmacyStatusChanged } from '../lib/emails.js';
import { wrap, notFound, badRequest, conflict } from '../lib/errors.js';

/** Everything here is super-admin only, enforced once at the router. */
export const adminRouter = express.Router();
adminRouter.use(requireAuth, requireSuperAdmin);

// ------------------------------------------------------------------
// Users
// ------------------------------------------------------------------

adminRouter.get('/users', wrap(async (req, res) => {
  const { limit, offset } = parse(pagination, req.query);
  const { search, role } = parse(
    z.object({
      search: z.string().trim().max(120).optional(),
      role: z.enum(['ALL', ROLES.SUPER_ADMIN, ROLES.PHARMACY_ADMIN, ROLES.PHARMACY_STAFF]).default('ALL'),
    }),
    req.query,
  );

  const rows = await queryAll(
    `SELECT p.id, p.email, p.full_name, p.avatar_url, p.global_role,
            p.lifecycle_status, p.created_at,
            u.last_login_at, (u.mfa_confirmed_at IS NOT NULL) AS mfa_enabled,
            COALESCE(
              json_agg(json_build_object('pharmacy_id', m.pharmacy_id, 'name', ph.name, 'role', m.role))
                FILTER (WHERE m.id IS NOT NULL),
              '[]'
            ) AS memberships,
            count(*) OVER () AS total_count
       FROM profiles p
       JOIN app_users u ON u.id = p.id
       LEFT JOIN memberships m ON m.user_id = p.id
       LEFT JOIN pharmacies ph ON ph.id = m.pharmacy_id
      WHERE p.lifecycle_status <> 'DELETED'
        AND ($1::text IS NULL OR p.email ILIKE '%' || $1 || '%' OR p.full_name ILIKE '%' || $1 || '%')
        AND ($2 = 'ALL' OR p.global_role::text = $2)
      GROUP BY p.id, u.last_login_at, u.mfa_confirmed_at
      ORDER BY p.created_at DESC
      LIMIT $3 OFFSET $4`,
    [search ?? null, role, limit, offset],
  );

  res.json({
    items: rows.map(({ total_count, ...r }) => r),
    total: rows[0]?.total_count ?? 0, limit, offset,
  });
}));

/**
 * Provision a staff account directly.
 *
 * Replaces `createStaffUser()`, which built a second, ephemeral Supabase
 * client in the browser purely so that signing up a colleague would not
 * replace the admin's own session — including a no-op Navigator Locks
 * shim to stop the two clients fighting. None of that is needed once
 * account creation is a server call: the admin's session is a cookie this
 * request never touches.
 */
adminRouter.post('/users', wrap(async (req, res) => {
  const body = parse(
    z.object({
      email: emailSchema,
      password: passwordSchema,
      full_name: displayName(120),
      global_role: z.enum([ROLES.SUPER_ADMIN, ROLES.PHARMACY_ADMIN, ROLES.PHARMACY_STAFF])
        .default(ROLES.PHARMACY_STAFF),
      pharmacy_id: uuid.optional(),
      pharmacy_role: z.enum([ROLES.PHARMACY_ADMIN, ROLES.PHARMACY_STAFF])
        .default(ROLES.PHARMACY_STAFF),
    }),
    req.body,
  );

  const existing = await queryOne(
    `SELECT p.id, p.lifecycle_status FROM profiles p WHERE LOWER(p.email) = $1`, [body.email]);
  if (existing) {
    // Distinguish these two: "already exists" sends an admin looking in the
    // user list, where a trashed account will not appear.
    throw conflict(existing.lifecycle_status === 'TRASHED'
      ? `${body.email} is in the trash. Restore or permanently delete them first.`
      : `An active user with the email ${body.email} already exists.`);
  }

  const passwordHash = await hashPassword(body.password);

  const created = await transaction(async (client) => {
    const { rows: [user] } = await client.query(
      `INSERT INTO app_users (email, password_hash, email_verified_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [body.email, passwordHash],
    );
    await client.query(
      `INSERT INTO profiles (id, email, full_name, global_role) VALUES ($1,$2,$3,$4)`,
      [user.id, body.email, body.full_name, body.global_role],
    );
    if (body.pharmacy_id) {
      await client.query(
        `INSERT INTO memberships (user_id, pharmacy_id, role) VALUES ($1,$2,$3)`,
        [user.id, body.pharmacy_id, body.pharmacy_role],
      );
    }
    await logAudit({
      eventType: 'user_provisioned', userId: req.user.id, ip: clientIp(req),
      metadata: { new_user: user.id, email: body.email, global_role: body.global_role,
                  pharmacy_id: body.pharmacy_id ?? null },
    }, client);
    return user;
  });

  // Tells the person their account exists. The password is deliberately
  // not in the email — see the template.
  const pharmacy = body.pharmacy_id
    ? await queryOne(`SELECT name FROM pharmacies WHERE id = $1`, [body.pharmacy_id])
    : null;
  sendAccountCreated({
    to: body.email,
    fullName: body.full_name,
    pharmacyName: pharmacy?.name,
    createdBy: req.user.full_name || req.user.email,
  });

  res.status(201).json({ id: created.id, email: body.email, full_name: body.full_name });
}));

/** Everything currently in the trash, across both soft-deletable tables. */
adminRouter.get('/trash', wrap(async (_req, res) => {
  const [users, pharmacies] = await Promise.all([
    queryAll(
      `SELECT id, email, full_name, trashed_at, 'profiles' AS source
         FROM profiles WHERE lifecycle_status = 'TRASHED'
        ORDER BY trashed_at DESC`),
    queryAll(
      `SELECT id, name, email, trashed_at, 'pharmacies' AS source
         FROM pharmacies WHERE lifecycle_status = 'TRASHED'
        ORDER BY trashed_at DESC`),
  ]);
  res.json({ users, pharmacies });
}));

adminRouter.post('/pharmacies/:id/trash', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const row = await queryOne(
    `UPDATE pharmacies SET lifecycle_status = 'TRASHED', trashed_at = now()
      WHERE id = $1 AND lifecycle_status = 'ACTIVE' RETURNING id, name`,
    [id],
  );
  if (!row) throw notFound('No active pharmacy with that id');
  logAudit({ eventType: 'pharmacy_trashed', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: id } });
  res.json(row);
}));

adminRouter.post('/pharmacies/:id/restore', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const row = await queryOne(
    `UPDATE pharmacies SET lifecycle_status = 'ACTIVE', trashed_at = NULL
      WHERE id = $1 AND lifecycle_status = 'TRASHED' RETURNING id, name`,
    [id],
  );
  if (!row) throw notFound('No trashed pharmacy with that id');
  logAudit({ eventType: 'pharmacy_restored', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: id } });
  res.json(row);
}));

adminRouter.delete('/pharmacies/:id', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const pharmacy = await queryOne(`SELECT lifecycle_status FROM pharmacies WHERE id = $1`, [id]);
  if (!pharmacy) throw notFound('Pharmacy not found');
  if (pharmacy.lifecycle_status !== 'TRASHED') {
    throw conflict('Move the pharmacy to trash before deleting it permanently');
  }
  await queryOne(`DELETE FROM pharmacies WHERE id = $1 RETURNING id`, [id]);
  logAudit({ eventType: 'pharmacy_deleted', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: id } });
  res.status(204).end();
}));

/**
 * The only path that writes profiles.global_role.
 *
 * Ported from admin_set_global_role(). Two rules carried over verbatim,
 * both of which exist to make this endpoint un-abusable rather than merely
 * gated:
 *
 *  - You cannot change your own role. That blocks self-promotion and, just
 *    as importantly, the self-demotion that would leave the system with no
 *    reachable administrator.
 *  - The change is audited in the same transaction that applies it, so
 *    there is no window in which a role moved without a record of who
 *    moved it.
 */
adminRouter.post('/users/:id/role', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { role } = parse(
    z.object({
      role: z.enum([ROLES.SUPER_ADMIN, ROLES.PHARMACY_ADMIN, ROLES.PHARMACY_STAFF]),
    }),
    req.body,
  );

  if (id === req.user.id) throw badRequest('You cannot change your own role');

  const updated = await transaction(async (client) => {
    const { rows: [row] } = await client.query(
      `UPDATE profiles SET global_role = $2 WHERE id = $1
       RETURNING id, email, full_name, global_role`,
      [id, role],
    );
    if (!row) throw notFound('No profile found for that user');

    await logAudit({
      eventType: 'user_mgmt_role_change',
      userId: req.user.id,
      ip: clientIp(req),
      metadata: { target_user: id, new_role: role },
    }, client);

    return row;
  });

  // A demotion should take effect now, not whenever their session expires.
  // Dropping their sessions forces the next request to re-resolve the role.
  if (role !== ROLES.SUPER_ADMIN) await revokeAllSessions(id);

  res.json(updated);
}));

/** Soft-delete: move to trash, recoverable until purged. */
adminRouter.post('/users/:id/trash', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  if (id === req.user.id) throw badRequest('You cannot trash your own account');

  const row = await queryOne(
    `UPDATE profiles
        SET lifecycle_status = 'TRASHED', trashed_at = now()
      WHERE id = $1 AND lifecycle_status = 'ACTIVE'
      RETURNING id, email`,
    [id],
  );
  if (!row) throw notFound('No active user with that id');

  await revokeAllSessions(id);
  logAudit({ eventType: 'user_trashed', userId: req.user.id, ip: clientIp(req),
    metadata: { target_user: id } });

  res.json(row);
}));

adminRouter.post('/users/:id/restore', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const row = await queryOne(
    `UPDATE profiles
        SET lifecycle_status = 'ACTIVE', trashed_at = NULL
      WHERE id = $1 AND lifecycle_status = 'TRASHED'
      RETURNING id, email`,
    [id],
  );
  if (!row) throw notFound('No trashed user with that id');

  logAudit({ eventType: 'user_restored', userId: req.user.id, ip: clientIp(req),
    metadata: { target_user: id } });
  res.json(row);
}));

/**
 * Hard delete. Irreversible, so it refuses unless the row is already in
 * the trash — making "delete" a two-step action that cannot be reached by
 * a single mis-click or a single forged request.
 */
adminRouter.delete('/users/:id', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  if (id === req.user.id) throw badRequest('You cannot delete your own account');

  const profile = await queryOne(`SELECT lifecycle_status FROM profiles WHERE id = $1`, [id]);
  if (!profile) throw notFound('No user with that id');
  if (profile.lifecycle_status !== 'TRASHED') {
    throw conflict('Move the account to trash before deleting it permanently');
  }

  // Cascades through profiles, memberships and sessions via the FKs on
  // app_users. audit_logs.user_id is ON DELETE SET NULL, so the trail of
  // what they did survives the account itself.
  await queryOne(`DELETE FROM app_users WHERE id = $1 RETURNING id`, [id]);

  logAudit({ eventType: 'user_deleted', userId: req.user.id, ip: clientIp(req),
    metadata: { target_user: id } });

  res.status(204).end();
}));

// ------------------------------------------------------------------
// Pharmacy approval and lifecycle
// ------------------------------------------------------------------

/**
 * Create a pharmacy and its first admin together.
 *
 * One transaction. The page this serves inserted the pharmacy, then called
 * createStaffUser separately — so a failure creating the admin left an
 * orphaned pharmacy nobody could sign in to manage.
 */
adminRouter.post('/pharmacies', wrap(async (req, res) => {
  const body = parse(
    z.object({
      name: displayName(160),
      email: emailSchema,
      phone: z.string().trim().max(40).optional(),
      address: z.string().trim().max(300).optional(),
      city: z.string().trim().max(80).default('Harare'),
      suburb: z.string().trim().max(80).optional(),
      mcaz_license: z.string().trim().max(80).optional(),
      status: z.enum(['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED']).default('PENDING'),
      plan_tier: z.enum(['FREE', 'BASIC', 'PRO']).default('FREE'),
      admin: z.object({
        email: emailSchema,
        password: passwordSchema,
        full_name: displayName(120),
      }),
    }),
    req.body,
  );

  const clash = await queryOne(
    `SELECT id FROM app_users WHERE LOWER(email) = $1`, [body.admin.email]);
  if (clash) throw conflict(`An account with the email ${body.admin.email} already exists.`);

  const passwordHash = await hashPassword(body.admin.password);

  const created = await transaction(async (client) => {
    const { rows: [pharmacy] } = await client.query(
      `INSERT INTO pharmacies (name, email, phone, address, city, suburb, mcaz_license, status, plan_tier)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name`,
      [body.name, body.email, body.phone ?? null, body.address ?? null, body.city,
       body.suburb ?? null, body.mcaz_license ?? null, body.status, body.plan_tier],
    );

    const { rows: [user] } = await client.query(
      `INSERT INTO app_users (email, password_hash, email_verified_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [body.admin.email, passwordHash],
    );
    await client.query(
      `INSERT INTO profiles (id, email, full_name, global_role)
       VALUES ($1, $2, $3, 'pharmacy_admin')`,
      [user.id, body.admin.email, body.admin.full_name],
    );
    await client.query(
      `INSERT INTO memberships (user_id, pharmacy_id, role)
       VALUES ($1, $2, 'pharmacy_admin')`,
      [user.id, pharmacy.id],
    );

    await logAudit({ eventType: 'pharmacy_created', userId: req.user.id, ip: clientIp(req),
      metadata: { pharmacy_id: pharmacy.id, admin_user: user.id } }, client);

    return pharmacy;
  });

  sendAccountCreated({
    to: body.admin.email,
    fullName: body.admin.full_name,
    pharmacyName: created.name,
    createdBy: req.user.full_name || req.user.email,
  });

  res.status(201).json(created);
}));

adminRouter.post('/pharmacies/:id/status', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { status } = parse(
    z.object({ status: z.enum(['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED']) }),
    req.body,
  );

  const row = await queryOne(
    `UPDATE pharmacies SET status = $2 WHERE id = $1 RETURNING id, name, status`, [id, status]);
  if (!row) throw notFound('Pharmacy not found');

  // Tell the pharmacy's own staff, not everyone.
  await queryOne(
    `INSERT INTO notifications (pharmacy_id, title, message, type)
     VALUES ($1, 'Pharmacy status updated', $2, 'INFO') RETURNING id`,
    [id, `Your pharmacy is now ${status}`],
  );

  // An in-app notification only reaches someone who signs in. An approval
  // is precisely the thing they are waiting for and not yet signing in to
  // check, so it goes by email too.
  const contact = await queryOne(`SELECT email, name FROM pharmacies WHERE id = $1`, [id]);
  if (contact?.email) {
    sendPharmacyStatusChanged({ to: contact.email, pharmacyName: contact.name, status });
  }

  logAudit({ eventType: 'pharmacy_status_changed', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: id, status } });

  res.json(row);
}));

adminRouter.post('/pharmacies/:id/plan', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { plan_tier } = parse(
    z.object({ plan_tier: z.enum(['FREE', 'BASIC', 'PRO']) }), req.body);

  const row = await queryOne(
    `UPDATE pharmacies SET plan_tier = $2 WHERE id = $1 RETURNING id, name, plan_tier`,
    [id, plan_tier]);
  if (!row) throw notFound('Pharmacy not found');

  logAudit({ eventType: 'pharmacy_plan_changed', userId: req.user.id, ip: clientIp(req),
    metadata: { pharmacy_id: id, plan_tier } });
  res.json(row);
}));

// ------------------------------------------------------------------
// Deletion requests (pharmacy asks, admin decides)
// ------------------------------------------------------------------

adminRouter.get('/delete-requests', wrap(async (req, res) => {
  const { status } = parse(
    z.object({ status: z.enum(['ALL', 'PENDING', 'APPROVED', 'DENIED']).default('PENDING') }),
    req.query,
  );
  const rows = await queryAll(
    `SELECT dr.*, p.full_name AS requester_name, ph.name AS pharmacy_name
       FROM delete_requests dr
       LEFT JOIN profiles p ON p.id = dr.requester_id
       LEFT JOIN pharmacies ph ON ph.id = dr.pharmacy_id
      WHERE ($1 = 'ALL' OR dr.status = $1)
      ORDER BY dr.created_at DESC
      LIMIT 200`,
    [status],
  );
  res.json(rows);
}));

adminRouter.post('/delete-requests/:id/decide', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { decision } = parse(
    z.object({ decision: z.enum(['APPROVED', 'DENIED']) }), req.body);

  const result = await transaction(async (client) => {
    const { rows: [dr] } = await client.query(
      `SELECT * FROM delete_requests WHERE id = $1 FOR UPDATE`, [id]);
    if (!dr) throw notFound('Delete request not found');
    if (dr.status !== 'PENDING') throw conflict('This request has already been decided');

    if (decision === 'APPROVED') {
      // Approving moves the target to trash rather than dropping it. The
      // permanent delete stays a separate, deliberate act.
      const table = dr.target_table === 'pharmacies' ? 'pharmacies'
                  : dr.target_table === 'profiles'   ? 'profiles'
                  : null;
      if (!table) throw badRequest(`Unsupported target table: ${dr.target_table}`);

      await client.query(
        `UPDATE ${table} SET lifecycle_status = 'TRASHED', trashed_at = now() WHERE id = $1`,
        [dr.target_id],
      );
    }

    const { rows: [updated] } = await client.query(
      `UPDATE delete_requests
          SET status = $2, reviewer_id = $3, reviewed_at = now()
        WHERE id = $1 RETURNING *`,
      [id, decision, req.user.id],
    );

    await logAudit({ eventType: 'delete_request_decided', userId: req.user.id, ip: clientIp(req),
      metadata: { request_id: id, decision, target_table: dr.target_table, target_id: dr.target_id } },
      client);

    return updated;
  });

  res.json(result);
}));

// ------------------------------------------------------------------
// Audit log and analytics
// ------------------------------------------------------------------

adminRouter.get('/audit', wrap(async (req, res) => {
  const { limit, offset } = parse(pagination, req.query);
  const { event_type, user_id } = parse(
    z.object({
      event_type: z.string().trim().max(80).optional(),
      user_id: uuid.optional(),
    }),
    req.query,
  );

  const rows = await queryAll(
    `SELECT a.*, p.email AS user_email, p.full_name AS user_name,
            count(*) OVER () AS total_count
       FROM audit_logs a
       LEFT JOIN profiles p ON p.id = a.user_id
      WHERE ($1::text IS NULL OR a.event_type = $1)
        AND ($2::uuid IS NULL OR a.user_id = $2)
      ORDER BY a.created_at DESC
      LIMIT $3 OFFSET $4`,
    [event_type ?? null, user_id ?? null, limit, offset],
  );

  res.json({
    items: rows.map(({ total_count, ...r }) => r),
    total: rows[0]?.total_count ?? 0, limit, offset,
  });
}));

/** Sidebar badge counts for the admin console, in one round trip. */
adminRouter.get('/counts', wrap(async (_req, res) => {
  const counts = await queryOne(
    `SELECT
       (SELECT count(*) FROM delete_requests WHERE status = 'PENDING') AS pending_deletes,
       (SELECT count(*) FROM sync_conflicts  WHERE status = 'PENDING') AS conflicts,
       (SELECT count(*) FROM pharmacies      WHERE status = 'PENDING') AS pending_pharmacies,
       (SELECT count(*) FROM drug_wanted_requests WHERE status = 'PENDING') AS wanted`);
  res.json(counts);
}));

/** Counters for the admin overview. One round trip, not eight. */
adminRouter.get('/stats', wrap(async (_req, res) => {
  const stats = await queryOne(`
    SELECT
      (SELECT count(*) FROM pharmacies WHERE lifecycle_status = 'ACTIVE')            AS pharmacies,
      (SELECT count(*) FROM pharmacies WHERE status = 'PENDING')                     AS pharmacies_pending,
      (SELECT count(*) FROM profiles   WHERE lifecycle_status = 'ACTIVE')            AS users,
      (SELECT count(*) FROM drugs)                                                   AS drugs,
      (SELECT count(*) FROM pharmacy_stock)                                          AS stock_items,
      (SELECT count(*) FROM drug_reservations WHERE status = 'PENDING')              AS reservations_pending,
      (SELECT count(*) FROM delete_requests   WHERE status = 'PENDING')              AS delete_requests_pending,
      (SELECT count(*) FROM drug_searches WHERE created_at > now() - INTERVAL '7 days') AS searches_7d
  `);
  res.json(stats);
}));

/** Reservations across every pharmacy, for the system-wide console. */
adminRouter.get('/reservations', wrap(async (req, res) => {
  const { limit, offset } = parse(pagination, req.query);
  const { status, search } = parse(
    z.object({
      status: z.enum(['ALL', 'PENDING', 'CONTACTED', 'FULFILLED', 'CANCELLED']).default('ALL'),
      search: z.string().trim().max(120).optional(),
    }),
    req.query,
  );

  const rows = await queryAll(
    `SELECT r.*,
            json_build_object('name', p.name, 'city', p.city) AS pharmacies,
            count(*) OVER () AS total_count
       FROM drug_reservations r
       JOIN pharmacies p ON p.id = r.pharmacy_id
      WHERE ($1 = 'ALL' OR r.status = $1)
        -- Searching in SQL rather than filtering a full download in the
        -- browser, which is what the page did before.
        AND ($2::text IS NULL
             OR r.reference_code ILIKE '%' || $2 || '%'
             OR r.patient_name   ILIKE '%' || $2 || '%'
             OR r.drug_name      ILIKE '%' || $2 || '%'
             OR p.name           ILIKE '%' || $2 || '%')
      ORDER BY r.created_at DESC
      LIMIT $3 OFFSET $4`,
    [status, search ?? null, limit, offset],
  );

  res.json({
    items: rows.map(({ total_count, ...r }) => r),
    total: rows[0]?.total_count ?? 0, limit, offset,
  });
}));

adminRouter.patch('/reservations/:id', wrap(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { status } = parse(
    z.object({ status: z.enum(['PENDING', 'CONTACTED', 'FULFILLED', 'CANCELLED']) }), req.body);

  const row = await queryOne(
    `UPDATE drug_reservations SET status = $2 WHERE id = $1 RETURNING *`, [id, status]);
  if (!row) throw notFound('Reservation not found');

  logAudit({ eventType: 'reservation_updated', userId: req.user.id, ip: clientIp(req),
    metadata: { reservation_id: id, status } });
  res.json(row);
}));

/**
 * Charts for the analytics console.
 *
 * Optionally scoped to one pharmacy. This replaces roughly six separate
 * browser-side queries plus client-side bucketing of raw rows into days
 * and months — which meant the "daily searches" chart was really a
 * histogram of whatever page of rows happened to be fetched.
 */
adminRouter.get('/analytics/overview', wrap(async (req, res) => {
  const { pharmacy_id, days } = parse(
    z.object({
      pharmacy_id: uuid.optional(),
      days: z.coerce.number().int().min(1).max(365).default(30),
    }),
    req.query,
  );
  const window = String(days);

  const [pharmacyCount, inventory, cities, daily, topDrugs, registrations, stockDist] =
    await Promise.all([
      queryOne(`SELECT count(*) AS n FROM pharmacies WHERE lifecycle_status = 'ACTIVE'`),
      queryOne(
        `SELECT count(*) AS n FROM pharmacy_stock
          WHERE ($1::uuid IS NULL OR pharmacy_id = $1)`, [pharmacy_id ?? null]),
      queryAll(
        `SELECT city, count(*) AS count FROM pharmacies
          WHERE lifecycle_status = 'ACTIVE'
          GROUP BY city ORDER BY count DESC LIMIT 20`),
      // Bucketed by the database, with empty days filled in by the join
      // against generate_series so the chart has no gaps.
      queryAll(
        `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                count(s.id) AS searches
           FROM generate_series(
                  date_trunc('day', now()) - (($1 || ' days')::interval),
                  date_trunc('day', now()), '1 day') AS d(day)
           LEFT JOIN drug_searches s
             ON date_trunc('day', s.created_at) = d.day
          GROUP BY d.day ORDER BY d.day`, [window]),
      queryAll(
        `SELECT LOWER(query) AS name, count(*) AS searches
           FROM drug_searches
          WHERE created_at > now() - (($1 || ' days')::interval)
          GROUP BY LOWER(query) ORDER BY searches DESC LIMIT 10`, [window]),
      queryAll(
        `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                count(*) AS pharmacies
           FROM pharmacies
          WHERE created_at > now() - INTERVAL '12 months'
          GROUP BY 1 ORDER BY 1`),
      queryOne(
        `SELECT
           count(*) FILTER (WHERE quantity > threshold AND is_available)  AS in_stock,
           count(*) FILTER (WHERE quantity > 0 AND quantity <= threshold
                            AND is_available)                             AS low_stock,
           count(*) FILTER (WHERE quantity = 0 OR NOT is_available)       AS out_of_stock
          FROM pharmacy_stock
         WHERE ($1::uuid IS NULL OR pharmacy_id = $1)`, [pharmacy_id ?? null]),
    ]);

  res.json({
    pharmacy_count: pharmacyCount.n,
    inventory_count: inventory.n,
    city_breakdown: cities,
    daily_searches: daily,
    top_drugs: topDrugs,
    registration_trend: registrations,
    stock_distribution: stockDist,
  });
}));

/**
 * Wholesale demand intelligence: what people search for and cannot find.
 *
 * The page this serves read a `b2b_demand_heatmap` materialized view that
 * exists only in backend-services/b2b-heatmaps.sql and was never applied,
 * so the query always failed and the page silently rendered four hardcoded
 * mock rows labelled "Live Demand Data".
 */
adminRouter.get('/analytics/demand', wrap(async (req, res) => {
  const { days } = parse(
    z.object({ days: z.coerce.number().int().min(1).max(365).default(7) }), req.query);

  const rows = await queryAll(
    `SELECT date_trunc('hour', created_at)                         AS hour_bucket,
            city,
            LOWER(query)                                           AS drug_search,
            count(*)                                               AS search_volume,
            count(*) FILTER (WHERE result_count = 0)               AS unfulfilled_demand
       FROM drug_searches
      WHERE created_at > now() - (($1 || ' days')::interval)
      GROUP BY 1, 2, 3
     HAVING count(*) FILTER (WHERE result_count = 0) > 0
      ORDER BY unfulfilled_demand DESC
      LIMIT 50`,
    [String(days)],
  );
  res.json(rows);
}));

/** What people searched for and how often results came back empty. */
adminRouter.get('/analytics/searches', wrap(async (req, res) => {
  const { days } = parse(
    z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);

  const [top, unmet] = await Promise.all([
    queryAll(
      `SELECT LOWER(query) AS query, count(*) AS searches, city
         FROM drug_searches
        WHERE created_at > now() - ($1 || ' days')::interval
        GROUP BY LOWER(query), city
        ORDER BY searches DESC
        LIMIT 50`,
      [String(days)],
    ),
    // Zero-result searches are the useful signal here: they are demand the
    // network could not serve, which is what drives stocking decisions.
    queryAll(
      `SELECT LOWER(query) AS query, count(*) AS searches, city
         FROM drug_searches
        WHERE created_at > now() - ($1 || ' days')::interval AND result_count = 0
        GROUP BY LOWER(query), city
        ORDER BY searches DESC
        LIMIT 50`,
      [String(days)],
    ),
  ]);

  res.json({ top, unmet });
}));
