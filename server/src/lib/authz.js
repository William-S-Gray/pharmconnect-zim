import { queryOne, queryAll } from '../db.js';
import { forbidden } from './errors.js';

/**
 * Every authorization rule the application has, in one file.
 *
 * These are ports of the RLS policies as they stood after the gate-1
 * hardening migration, not of the originals. Three of the originals were
 * wrong in ways worth remembering, because the same mistakes are easy to
 * reintroduce here:
 *
 *   - is_super_admin() read the JWT's user_metadata, which the user could
 *     rewrite. Role now comes from profiles on every request. Never accept
 *     a role from the client.
 *   - The pharmacy-admin profile policy never correlated the membership
 *     back to the row being read, so any pharmacy admin could read and
 *     write every profile in the table. Scoping functions here always take
 *     the target row's id and compare it.
 *   - get_user_auth_data() took a caller-supplied user id and ran
 *     SECURITY DEFINER, so it returned anyone's profile. Identity comes
 *     from the session, never from a parameter.
 */

export const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  PHARMACY_ADMIN: 'pharmacy_admin',
  PHARMACY_STAFF: 'pharmacy_staff',
});

export function isSuperAdmin(user) {
  return user?.global_role === ROLES.SUPER_ADMIN && user?.lifecycle_status === 'ACTIVE';
}

/** The caller's membership row for one pharmacy, or null. */
export async function membershipFor(userId, pharmacyId) {
  if (!userId || !pharmacyId) return null;
  return queryOne(
    `SELECT id, role, pharmacy_id FROM memberships WHERE user_id = $1 AND pharmacy_id = $2`,
    [userId, pharmacyId],
  );
}

export async function membershipsOf(userId) {
  return queryAll(
    `SELECT m.id, m.role, m.pharmacy_id, p.name AS pharmacy_name, p.status
       FROM memberships m
       JOIN pharmacies p ON p.id = m.pharmacy_id
      WHERE m.user_id = $1
      ORDER BY m.created_at ASC`,
    [userId],
  );
}

/**
 * True if the caller may act on `pharmacyId` at `minRole`.
 *
 * 'pharmacy_staff' means "any member of this pharmacy"; anything above it
 * requires the admin role on that same pharmacy. Super admins pass
 * everywhere, which mirrors has_pharmacy_role() from the hardening
 * migration.
 */
export async function hasPharmacyRole(user, pharmacyId, minRole = ROLES.PHARMACY_STAFF) {
  if (isSuperAdmin(user)) return true;
  const membership = await membershipFor(user?.id, pharmacyId);
  if (!membership) return false;
  if (minRole === ROLES.PHARMACY_STAFF) return true;
  return membership.role === ROLES.PHARMACY_ADMIN;
}

/** Throwing form, for use directly in route handlers. */
export async function requirePharmacyRole(user, pharmacyId, minRole = ROLES.PHARMACY_STAFF) {
  if (!(await hasPharmacyRole(user, pharmacyId, minRole))) {
    // Deliberately identical whether the pharmacy does not exist or the
    // caller simply is not a member: distinguishing them turns this into
    // an oracle for which pharmacy ids are real.
    throw forbidden('You do not have access to this pharmacy');
  }
}

export function requireSuperAdmin(user) {
  if (!isSuperAdmin(user)) throw forbidden('Super administrator access required');
}

/**
 * Whether `user` may read `targetUserId`'s profile: themselves, any
 * profile if super admin, or a teammate if they administer a pharmacy
 * that person also belongs to.
 *
 * Read-only by design. The replaced policy granted FOR ALL, which let a
 * pharmacy admin rewrite colleagues' rows.
 */
export async function canReadProfile(user, targetUserId) {
  if (!user) return false;
  if (user.id === targetUserId) return true;
  if (isSuperAdmin(user)) return true;

  const shared = await queryOne(
    `SELECT 1
       FROM memberships me
       JOIN memberships them ON them.pharmacy_id = me.pharmacy_id
      WHERE me.user_id   = $1
        AND me.role      = 'pharmacy_admin'
        AND them.user_id = $2
      LIMIT 1`,
    [user.id, targetUserId],
  );
  return Boolean(shared);
}

/**
 * The set of pharmacy ids the caller can see, or null meaning "all of
 * them" for a super admin.
 *
 * Routes use this to scope a list query at the SQL level instead of
 * fetching everything and filtering in JavaScript — the latter is how you
 * end up shipping rows to the client and trimming them in the UI.
 */
export async function visiblePharmacyIds(user) {
  if (isSuperAdmin(user)) return null;
  const rows = await queryAll(`SELECT pharmacy_id FROM memberships WHERE user_id = $1`, [user.id]);
  return rows.map((r) => r.pharmacy_id);
}

/**
 * Stock writes require pharmacy_admin. Staff are deliberately excluded:
 * their edits are routed through pending_approvals, which before the
 * hardening pass was enforced only in the React layer and so was not
 * enforced at all.
 */
export const canWriteStockDirectly = (user, pharmacyId) =>
  hasPharmacyRole(user, pharmacyId, ROLES.PHARMACY_ADMIN);
