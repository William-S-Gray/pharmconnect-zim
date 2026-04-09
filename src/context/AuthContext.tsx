import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { toast } from 'sonner';

const AUTH_CACHE_KEY = 'pharmconnect_auth_cache';

export type UserRole = 'super_admin' | 'pharmacy_admin' | 'pharmacy_staff';

export interface Pharmacy {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  suburb: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';
  plan_tier: 'FREE' | 'BASIC' | 'PRO';
  lat?: number;
  lng?: number;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  global_role: UserRole;
}

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
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
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

  // Initialize from cache for instant UI response
  useEffect(() => {
    const cached = sessionStorage.getItem(AUTH_CACHE_KEY);
    if (cached) {
      try {
        const { pharmacy: cPharmacy, profile: cProfile, role: cRole } = JSON.parse(cached);
        if (cPharmacy) setPharmacy(cPharmacy);
        if (cProfile) setProfile(cProfile);
        if (cRole) setRole(cRole);
      } catch (e) {
        sessionStorage.removeItem(AUTH_CACHE_KEY);
      }
    }
  }, []);

  const fetchPromise = React.useRef<Promise<void> | null>(null);

  const fetchFullProfile = useCallback(async (userId: string, forceRefresh = false) => {
    if (!isSupabaseConfigured) return;

    if (!forceRefresh) {
      const cached = sessionStorage.getItem(AUTH_CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.profile?.id === userId && parsed.role) return;
        } catch (e) { /* ignore */ }
      }
    }

    if (fetchPromise.current && !forceRefresh) {
      return fetchPromise.current;
    }

    let resolveFetch: (() => void) | undefined;
    fetchPromise.current = new Promise<void>((resolve) => { resolveFetch = resolve; });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Profile fetch timed out')), 8000);
    });

    try {
      let profileData: UserProfile | null = null;
      let finalRole: UserRole | null = null;
      let finalPharmacy: Pharmacy | null = null;

      // Wrap the fetch logic in a promise so we can race it against the timeout
      const fetchLogic = async () => {
        // 1. Try RPC first (fast path)
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_auth_data', { p_user_id: userId });

        if (!rpcError && rpcData) {
          profileData = rpcData.profile;
          if (rpcData.membership) {
            finalPharmacy = rpcData.membership.pharmacy;
            finalRole = rpcData.membership.role;
          } else if (profileData) {
            finalRole = profileData.global_role;
          }
        } else {
          // 2. FALLBACK: sequential fetch
          const { data: pData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

          if (pData) {
            profileData = pData as UserProfile;
          } else {
            // Profile row missing — auto-create from session metadata
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (authUser) {
              const isDashboardAdmin = authUser.app_metadata?.role === 'super_admin' || 
                                     authUser.user_metadata?.role === 'super_admin' ||
                                     authUser.email === 'graywilliamwiltino@gmail.com';

              const { data: upserted } = await supabase
                .from('profiles')
                .upsert({
                  id: userId,
                  email: authUser.email ?? '',
                  full_name: authUser.user_metadata?.name ?? authUser.user_metadata?.full_name ?? 'System User',
                  global_role: isDashboardAdmin ? 'super_admin' : 'pharmacy_staff',
                }, { onConflict: 'id' })
                .select()
                .maybeSingle();
              if (upserted) profileData = upserted as UserProfile;
            }
          }

          // Fetch membership
          const { data: mData } = await supabase
            .from('memberships')
            .select('role, pharmacy_id, pharmacies (*)')
            .eq('user_id', userId)
            .maybeSingle();

          if (mData) {
            finalPharmacy = mData.pharmacies as unknown as Pharmacy;
            finalRole = (mData.role as UserRole) || (profileData?.global_role as UserRole);
          } else if (profileData) {
            finalRole = profileData.global_role as UserRole;
          }
        }
      };

      await Promise.race([fetchLogic(), timeoutPromise]);

      if (!finalRole) {
        console.warn('No role determined for user', userId);
        finalRole = 'pharmacy_staff'; // Final fallback to allow login
      }

      if (profileData) setProfile(profileData);
      if (finalPharmacy) setPharmacy(finalPharmacy);
      setRole(finalRole);

      sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({
        pharmacy: finalPharmacy,
        profile: profileData,
        role: finalRole,
        timestamp: Date.now()
      }));

    } catch (error) {
      console.error('Critical error in fetchFullProfile:', error);
    } finally {
      fetchPromise.current = null;
      resolveFetch?.();
    }
  }, []);

  const performLogout = useCallback((showMessage = false) => {
    if (isSupabaseConfigured) {
      supabase.auth.signOut();
    }
    
    setPharmacy(null);
    setUser(null);
    setProfile(null);
    setRole(null);
    sessionStorage.removeItem(AUTH_CACHE_KEY);
    fetchPromise.current = null;

    if (showMessage) {
      toast.info('You have been logged out.');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    }
  }, []);

  // Handle Auth State Changes
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (session) {
          setUser(session.user);
          await fetchFullProfile(session.user.id);
        } else {
          setUser(null);
          setPharmacy(null);
          setProfile(null);
          setRole(null);
        }
      } catch (e) {
        console.error('Auth state change error:', e);
      } finally {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchFullProfile]);

  const login = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase not configured. Please check your .env file.');
    }

    // 1. Check rate limit before attempting login
    try {
      const { data: isAllowed, error: rateLimitError } = await supabase.rpc('check_login_rate_limit', { 
        p_email: email.toLowerCase().trim() 
      });

      if (!rateLimitError && isAllowed === false) {
        throw new Error('Too many login attempts. Please try again in 15 minutes.');
      }
    } catch (e: any) {
      if (e.message.includes('Too many login attempts')) throw e;
      console.warn('Rate limit service unavailable, proceeding with caution:', e);
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // 2. Log the attempt results
    try {
      await supabase.rpc('log_login_attempt', { 
        p_email: email.toLowerCase().trim(), 
        p_success: !error 
      });
    } catch (e) {
      console.warn('Failed to log login attempt:', e);
    }

    if (error) throw error;
    
    if (data.user) {
      setUser(data.user);
      await fetchFullProfile(data.user.id);
    }
  }, [fetchFullProfile]);

  const logout = useCallback(() => {
    performLogout(false);
  }, [performLogout]);

  return (
    <AuthContext.Provider value={{
      pharmacy, user, profile, role, isLoading,
      login, logout,
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


