import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { UserRole } from '@/context/AuthContext';

/**
 * Creates a completely isolated Supabase client for background operations
 * (user provisioning) that will NOT interfere with the main user session.
 *
 * Key settings:
 * - persistSession: false  — no localStorage writes
 * - autoRefreshToken: false — won't compete for token refresh
 * - lock: no-op           — CRITICAL: bypasses Navigator Locks API entirely,
 *                           preventing the "lock stolen" error on the main client
 */
const createEphemeralClient = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) throw new Error('Supabase credentials missing.');

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `pharmconnect-bg-${Math.random().toString(36).slice(2)}`,
      // Bypass Navigator Locks entirely — this ephemeral client has no
      // long-lived session to protect, so no locking is needed.
      lock: async (_name: string, _timeout: number, fn: () => Promise<any>) => fn(),
    },
  });
};

export const createStaffUser = async (
  email: string,
  password: string,
  fullName: string,
  role: UserRole,
  pharmacyId?: string
) => {
  const bgClient = createEphemeralClient();

  const { data: signUpData, error: signUpError } = await bgClient.auth.signUp({
    email,
    password,
    options: {
      data: { name: fullName },
    },
  });

  if (signUpError) throw signUpError;

  if (!signUpData.user?.id) {
    throw new Error('Failed to create auth record — no user ID returned.');
  }

  const newUserId = signUpData.user.id;

  // Insert membership linking the new user to the pharmacy (if provided)
  if (pharmacyId) {
    const { error: membershipError } = await supabase.from('memberships').insert({
      user_id: newUserId,
      pharmacy_id: pharmacyId,
      role: role,
    });

    if (membershipError) {
      throw new Error('User was created but pharmacy assignment failed: ' + membershipError.message);
    }
  }

  // Upsert profile row to ensure it exists and has the correct role/name
  await supabase
    .from('profiles')
    .upsert({ 
      id: newUserId, 
      email: email, 
      global_role: role, 
      full_name: fullName 
    }, { onConflict: 'id' });

  return newUserId;
};

/**
 * Sends a Supabase password reset email to the given address.
 * The user clicks the link and lands on /reset-password to set a new password.
 */
export const sendPasswordResetEmail = async (email: string): Promise<void> => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
};
