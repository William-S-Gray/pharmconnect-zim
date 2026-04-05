import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { UserRole } from '@/context/AuthContext';

export const createStaffUser = async (
  email: string,
  password: string,
  fullName: string,
  role: UserRole,
  pharmacyId: string
) => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase credentials missing.');
  }

  // Create an ephemeral background client so it doesn't log the admin out
  const bgClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Ensure robust error capturing
  const { data: signUpData, error: signUpError } = await bgClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: fullName,
      },
    },
  });

  if (signUpError) {
    throw signUpError;
  }

  if (!signUpData.user?.id) {
    throw new Error('Failed to create an auth record (no user ID returned).');
  }

  const newUserId = signUpData.user.id;

  // Insert membership for the created user
  const { error: membershipError } = await supabase.from('memberships').insert({
    user_id: newUserId,
    pharmacy_id: pharmacyId,
    role: role,
  });

  if (membershipError) {
    throw new Error('User was created, but failed to assign pharmacy: ' + membershipError.message);
  }

  // Wait a moment for trigger to insert profile before updating, then ensure global role matches
  await new Promise(resolve => setTimeout(resolve, 500));
  
  await supabase.from('profiles').update({
    global_role: role,
    full_name: fullName,
  }).eq('id', newUserId);

  return newUserId;
};
