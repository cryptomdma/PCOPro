import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function RequireNonTech({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role === 'TECH') {
    return <Navigate to="/" replace />;
  }
  return children;
}
