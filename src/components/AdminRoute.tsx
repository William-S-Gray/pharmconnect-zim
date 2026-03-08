import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { FullPageSpinner } from './LoadingSpinner';

export const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { pharmacy, isLoading, isAdmin } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  if (!pharmacy) return <Navigate to="/pharmacy/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};
