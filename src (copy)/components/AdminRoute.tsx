import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { FullPageSpinner } from './LoadingSpinner';

export const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isSuperAdmin, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  if (!isSuperAdmin) return <Navigate to="/login" replace />;
  return <>{children}</>;
};
