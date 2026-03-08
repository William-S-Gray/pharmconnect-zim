import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../lib/api';
import { rateLimiter } from '../lib/rateLimiter';
import { refreshCsrfToken, clearCsrfToken } from '../lib/csrfToken';
import { sessionTimeout } from '../lib/sessionTimeout';
import { toast } from 'sonner';

export type UserRole = 'pharmacy' | 'admin';

export interface Pharmacy {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  suburb: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED';
  plan_tier: 'FREE' | 'BASIC' | 'PRO';
  role?: UserRole;
}

interface AuthContextType {
  pharmacy: Pharmacy | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isApproved: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** 30 minutes inactivity timeout */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function isValidPharmacy(data: unknown): data is Pharmacy {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.email === 'string' &&
    typeof obj.status === 'string' &&
    ['PENDING', 'APPROVED', 'SUSPENDED'].includes(obj.status as string) &&
    typeof obj.plan_tier === 'string' &&
    ['FREE', 'BASIC', 'PRO'].includes(obj.plan_tier as string)
  );
}

function sanitizeString(str: string): string {
  return str.replace(/[<>"'&]/g, '');
}

function sanitizePharmacy(p: Pharmacy): Pharmacy {
  return {
    ...p,
    id: sanitizeString(p.id),
    name: sanitizeString(p.name),
    email: sanitizeString(p.email),
    phone: sanitizeString(p.phone),
    city: sanitizeString(p.city),
    suburb: sanitizeString(p.suburb),
  };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);

  // Logout handler (stable reference for session timeout)
  const performLogout = useCallback((showMessage = false) => {
    localStorage.removeItem('pharmtrack_token');
    localStorage.removeItem('pharmtrack_pharmacy');
    localStorage.removeItem('pharmtrack_last_activity');
    setToken(null);
    setPharmacy(null);
    rateLimiter.clearAll();
    clearCsrfToken();
    sessionTimeout.stop();

    if (showMessage) {
      toast.info('You have been logged out due to inactivity.');
      // Small delay to let toast show before redirect
      setTimeout(() => {
        window.location.href = '/pharmacy/login';
      }, 1500);
    }
  }, []);

  // Start session timeout when user is authenticated
  const startSessionMonitoring = useCallback(() => {
    sessionTimeout.start(
      () => performLogout(true), // Auto-logout on timeout
      {
        timeoutMs: SESSION_TIMEOUT_MS,
        onWarning: () => {
          toast.warning('Your session will expire in 2 minutes due to inactivity.', {
            duration: 10000,
            action: {
              label: 'Stay logged in',
              onClick: () => sessionTimeout.recordActivity(),
            },
          });
        },
      }
    );
  }, [performLogout]);

  // Restore session with validation
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('pharmtrack_token');
      const storedPharmacy = localStorage.getItem('pharmtrack_pharmacy');
      if (storedToken && storedPharmacy) {
        const parsed = JSON.parse(storedPharmacy);
        if (isValidPharmacy(parsed)) {
          setToken(storedToken);
          setPharmacy(sanitizePharmacy(parsed));
        } else {
          localStorage.removeItem('pharmtrack_token');
          localStorage.removeItem('pharmtrack_pharmacy');
        }
      }
    } catch {
      localStorage.removeItem('pharmtrack_token');
      localStorage.removeItem('pharmtrack_pharmacy');
    }
    setLoading(false);
  }, []);

  // Monitor session timeout whenever auth state changes
  useEffect(() => {
    if (pharmacy && token) {
      startSessionMonitoring();
    } else {
      sessionTimeout.stop();
    }
    return () => sessionTimeout.stop();
  }, [pharmacy, token, startSessionMonitoring]);

  const login = useCallback(async (email: string, password: string) => {
    if (email.length > 254 || password.length > 128) {
      throw new Error('Invalid credentials format');
    }

    // Demo mode
    if (email === 'demo@pharmtrack.co.zw' && password === 'demo1234') {
      const demoPharmacy: Pharmacy = {
        id: 'demo-001',
        name: 'HealthPlus Pharmacy',
        email: 'demo@pharmtrack.co.zw',
        phone: '0771 234 567',
        city: 'Harare',
        suburb: 'Avondale',
        status: 'APPROVED',
        plan_tier: 'PRO',
      };
      const demoToken = 'demo-token-pharmtrack';
      localStorage.setItem('pharmtrack_token', demoToken);
      localStorage.setItem('pharmtrack_pharmacy', JSON.stringify(demoPharmacy));
      setToken(demoToken);
      setPharmacy(demoPharmacy);
      rateLimiter.reset('/api/auth/login');
      refreshCsrfToken();
      return;
    }

    const response = await api.post('/api/auth/login', { email, password });
    const { token: newToken, pharmacy: newPharmacy } = response.data;

    if (!isValidPharmacy(newPharmacy)) {
      throw new Error('Invalid server response');
    }

    const sanitized = sanitizePharmacy(newPharmacy);

    // If server uses httpOnly cookies, store marker instead of raw token
    const authMode = response.headers['x-auth-mode'];
    if (authMode === 'cookie') {
      localStorage.setItem('pharmtrack_token', 'httponly');
    } else {
      localStorage.setItem('pharmtrack_token', newToken);
    }

    localStorage.setItem('pharmtrack_pharmacy', JSON.stringify(sanitized));
    setToken(authMode === 'cookie' ? 'httponly' : newToken);
    setPharmacy(sanitized);
    rateLimiter.reset('/api/auth/login');
    refreshCsrfToken();
  }, []);

  const logout = useCallback(() => {
    // Tell server to clear httpOnly cookie
    api.post('/api/auth/logout').catch(() => {});
    performLogout(false);
  }, [performLogout]);

  return (
    <AuthContext.Provider value={{
      pharmacy, token, isLoading,
      login, logout,
      isApproved: pharmacy?.status === 'APPROVED',
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
