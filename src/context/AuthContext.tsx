import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { AuthPayload, Pharmacy, UserProfile, UserRole } from '@/lib/api';

/**
 * Session state for the app shell.
 *
 * This replaced ~360 lines built around client-side Supabase auth: an RPC
 * fast path with a sequential fallback, a manual profile upsert, invitation
 * auto-linking, avatar syncing, an 8-second race timeout and a promise
 * guard against concurrent fetches. All of it existed because the browser
 * was assembling its own identity from several tables.
 *
 * `GET /api/auth/me` now returns profile, role, pharmacy and memberships in
 * one response, already authorized. Invitation linking happens server-side
 * at registration. There is no token to hold: the session is an httpOnly
 * cookie the browser attaches on its own.
 */

export type { UserRole, Pharmacy, UserProfile };

export interface AuthUser {
  id: string;
  email?: string;
}

interface AuthContextType {
  pharmacy: Pharmacy | null;
  user: AuthUser | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isLoading: boolean;
  login: (email: string, password: string, totp?: string) => Promise<{ mfaRequired: boolean }>;
  logout: () => void;
  refresh: () => Promise<void>;
  isApproved: boolean;
  isSuperAdmin: boolean;
  isPharmacyAdmin: boolean;
  isPharmacyStaff: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setLoading] = useState(true);

  const applyPayload = useCallback((payload: AuthPayload | null) => {
    if (!payload) {
      setUser(null);
      setProfile(null);
      setPharmacy(null);
      setRole(null);
      return;
    }
    setUser({ id: payload.profile.id, email: payload.profile.email });
    setProfile(payload.profile);
    setPharmacy(payload.pharmacy);
    // Taken from the server's response and never derived locally. The role
    // is re-read from the database on every request, so a change or a
    // suspension takes effect immediately rather than at session expiry.
    setRole(payload.role);
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyPayload(await api.auth.me());
    } catch (err) {
      // A network failure must not look like a sign-out, or a brief blip
      // bounces the user to the login page mid-task. Only an explicit null
      // from the server clears the session.
      if (err instanceof ApiError && err.status === 0) {
        console.warn('[auth] server unreachable; keeping current session state');
        return;
      }
      applyPayload(null);
    }
  }, [applyPayload]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  /**
   * Resolves `{ mfaRequired: true }` when the account has TOTP enrolled and
   * no code was supplied — the password was correct, so this is not an
   * error. Callers show the code field and call again with `totp`.
   */
  const login = useCallback(async (email: string, password: string, totp?: string) => {
    const result = await api.auth.login(email, password, totp);

    if ('mfa_required' in result) return { mfaRequired: true };

    applyPayload(result);
    return { mfaRequired: false };
  }, [applyPayload]);

  const logout = useCallback(() => {
    // Clear local state first so the UI responds immediately; the cookie is
    // revoked server-side regardless of whether that request succeeds.
    applyPayload(null);
    api.auth.logout().catch((err) => console.warn('[auth] logout request failed', err));
    toast.info('You have been logged out.');
  }, [applyPayload]);

  return (
    <AuthContext.Provider value={{
      pharmacy, user, profile, role, isLoading,
      login, logout, refresh,
      isApproved: pharmacy?.status === 'APPROVED',
      isSuperAdmin: role === 'super_admin',
      isPharmacyAdmin: role === 'pharmacy_admin',
      isPharmacyStaff: role === 'pharmacy_staff',
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
