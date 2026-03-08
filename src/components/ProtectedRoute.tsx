import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FullPageSpinner } from './LoadingSpinner';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { pharmacy, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  if (!pharmacy) return <Navigate to="/pharmacy/login" replace />;
  return <>{children}</>;
};
