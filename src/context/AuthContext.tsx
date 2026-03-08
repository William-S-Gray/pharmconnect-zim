import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../lib/api';
import { rateLimiter } from '../lib/rateLimiter';

export interface Pharmacy {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  suburb: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED';
  plan_tier: 'FREE' | 'BASIC' | 'PRO';
}

interface AuthContextType {
  pharmacy: Pharmacy | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isApproved: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Basic validation for stored pharmacy data shape.
 * Prevents tampered localStorage from crashing the app.
 */
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

/**
 * Sanitize a string to prevent XSS in stored data.
 */
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
          // Corrupted data — clear it
          localStorage.removeItem('pharmtrack_token');
          localStorage.removeItem('pharmtrack_pharmacy');
        }
      }
    } catch {
      // JSON parse failed — clear corrupted data
      localStorage.removeItem('pharmtrack_token');
      localStorage.removeItem('pharmtrack_pharmacy');
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Validate input lengths to prevent abuse
    if (email.length > 254 || password.length > 128) {
      throw new Error('Invalid credentials format');
    }

    // Demo mode — bypass backend
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
      // Reset login rate limit on success
      rateLimiter.reset('/api/auth/login');
      return;
    }

    const response = await api.post('/api/auth/login', { email, password });
    const { token: newToken, pharmacy: newPharmacy } = response.data;

    if (!isValidPharmacy(newPharmacy)) {
      throw new Error('Invalid server response');
    }

    const sanitized = sanitizePharmacy(newPharmacy);
    localStorage.setItem('pharmtrack_token', newToken);
    localStorage.setItem('pharmtrack_pharmacy', JSON.stringify(sanitized));
    setToken(newToken);
    setPharmacy(sanitized);
    // Reset login rate limit on success
    rateLimiter.reset('/api/auth/login');
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('pharmtrack_token');
    localStorage.removeItem('pharmtrack_pharmacy');
    setToken(null);
    setPharmacy(null);
    rateLimiter.clearAll();
  }, []);

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
