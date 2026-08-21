import { api } from './api';
import type { UserRole } from './api';

/**
 * Administrative user provisioning.
 *
 * The previous implementation built a *second*, ephemeral Supabase client
 * in the browser — with `persistSession: false` and a no-op Navigator Locks
 * shim — purely so that signing a colleague up would not overwrite the
 * admin's own session, and so the two clients would not fight over token
 * refresh. All of that machinery existed to work around doing account
 * creation client-side.
 *
 * It is one server call now. The admin's session is a cookie this request
 * never touches, so there is nothing to isolate.
 */

export const createStaffUser = async (
  email: string,
  password: string,
  fullName: string,
  role: UserRole,
  pharmacyId?: string,
): Promise<string> => {
  const created = await api.admin.createUser({
    email,
    password,
    full_name: fullName,
    // The role this person holds at the pharmacy. `global_role` stays at
    // the default: granting someone super_admin is a separate, deliberate
    // act through the role endpoint, not a side effect of adding staff.
    pharmacy_id: pharmacyId,
    pharmacy_role: role === 'super_admin' ? 'pharmacy_admin' : role,
  });
  return created.id;
};

/**
 * Sends a password reset email.
 *
 * Always resolves, whether or not the address has an account — the server
 * deliberately gives the same answer either way, so this cannot be used to
 * discover which addresses are registered.
 */
export const sendPasswordResetEmail = async (email: string): Promise<void> => {
  await api.auth.forgotPassword(email);
};
