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
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED';
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

    // Check cache first if not forcing refresh
    if (!forceRefresh) {
      const cached = sessionStorage.getItem(AUTH_CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          // If we already have the profile for this user, skip the network request
          if (parsed.profile?.id === userId && parsed.role) {
             return; // State was already set in initial useEffect
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (fetchPromise.current && !forceRefresh) {
      return fetchPromise.current;
    }

    let resolveFetch: () => void;
    fetchPromise.current = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });
    
    try {
      // 1. Try high-performance RPC first
      const { data, error: rpcError } = await supabase.rpc('get_user_auth_data', { p_user_id: userId });
      
      let profileData: UserProfile | null = null;
      let finalRole: UserRole | null = null;
      let finalPharmacy: Pharmacy | null = null;

      if (!rpcError && data) {
        profileData = data.profile;
        if (data.membership) {
          finalPharmacy = data.membership.pharmacy;
          finalRole = data.membership.role;
        } else if (profileData) {
          finalRole = profileData.global_role;
        }
      } else {
        // 2. FALLBACK: Sequential fetch if RPC fails or is missing
        console.warn('RPC failed, falling back to sequential fetch:', rpcError);
        
        const { data: pData, error: pError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        
        if (pError) throw pError;
        profileData = pData as UserProfile;

        const { data: mData } = await supabase
          .from('memberships')
          .select('role, pharmacy_id, pharmacies (*)')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (mData) {
          finalPharmacy = mData.pharmacies as unknown as Pharmacy;
          finalRole = mData.role as UserRole;
        } else if (profileData) {
          finalRole = profileData.global_role as UserRole;
        }
      }

      // Update state
      if (profileData) setProfile(profileData);
      if (finalPharmacy) setPharmacy(finalPharmacy);
      if (finalRole) setRole(finalRole);

      // Update sessionStorage cache
      sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({
        pharmacy: finalPharmacy,
        profile: profileData,
        role: finalRole,
        timestamp: Date.now()
      }));

    } catch (error) {
      console.error('Critical error in fetchFullProfile:', error);
      fetchPromise.current = null; // Allow retrying on error
    } finally {
      if (resolveFetch) resolveFetch();
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

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


