import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { toast } from 'sonner';

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

  const fetchFullProfile = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured) return;
    
    try {
      // 1. Fetch Global Profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (profileError) throw profileError;
      setProfile(profileData as UserProfile);
      
      // 2. Fetch Membership & Pharmacy
      const { data: membershipData, error: memberError } = await supabase
        .from('memberships')
        .select(`
          role,
          pharmacy_id,
          pharmacies (*)
        `)
        .eq('user_id', userId)
        .maybeSingle();

      if (memberError) console.error('Membership fetch error:', memberError);
      
      if (membershipData) {
        setPharmacy(membershipData.pharmacies as unknown as Pharmacy);
        // If they have a pharmacy role, it overrides global_role for UI purposes if needed
        // but usually we rely on the specific table they are in.
        setRole(membershipData.role as UserRole);
      } else {
        setRole(profileData.global_role as UserRole);
      }

    } catch (error) {
      console.error('Error fetching full profile:', error);
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

    if (showMessage) {
      toast.info('You have been logged out.');
      setTimeout(() => {
        window.location.href = '/pharmacy/login';
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
      if (session) {
        setUser(session.user);
        await fetchFullProfile(session.user.id);
      } else {
        setUser(null);
        setPharmacy(null);
        setProfile(null);
        setRole(null);
      }
      setLoading(false);
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


