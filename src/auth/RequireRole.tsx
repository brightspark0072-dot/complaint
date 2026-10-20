import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { AppRole } from '../lib/types.ts';
import { useAuth } from './AuthContext.tsx';
import { Spinner } from '../components/ui.tsx';

export function homeFor(role: AppRole): string {
  return role === 'admin' ? '/admin' : role === 'handler' ? '/handler' : '/app';
}

/**
 * UX guard only. It hides screens a user should not see; it is NOT a security boundary.
 * Every query and action is independently authorized by PostgreSQL RLS and the RPC functions.
 */
export function RequireRole({ role }: { role: AppRole }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Checking your session…" />;
  if (!session || !profile)
    return (
      <Navigate
        to={role === 'complainant' ? '/sign-in' : '/staff/sign-in'}
        state={{ from: location }}
        replace
      />
    );
  if (profile.role !== role) return <Navigate to={homeFor(profile.role)} replace />;
  return <Outlet />;
}
