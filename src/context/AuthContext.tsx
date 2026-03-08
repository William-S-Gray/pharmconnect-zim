import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../lib/api';

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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('pharmtrack_token');
    const storedPharmacy = localStorage.getItem('pharmtrack_pharmacy');
    if (storedToken && storedPharmacy) {
      setToken(storedToken);
      setPharmacy(JSON.parse(storedPharmacy));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
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
      return;
    }

    const response = await api.post('/api/auth/login', { email, password });
    const { token: newToken, pharmacy: newPharmacy } = response.data;
    localStorage.setItem('pharmtrack_token', newToken);
    localStorage.setItem('pharmtrack_pharmacy', JSON.stringify(newPharmacy));
    setToken(newToken);
    setPharmacy(newPharmacy);
  };

  const logout = () => {
    localStorage.removeItem('pharmtrack_token');
    localStorage.removeItem('pharmtrack_pharmacy');
    setToken(null);
    setPharmacy(null);
  };

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
