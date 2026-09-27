import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import type { Role } from '../lib/types';
import AlertBanner from './ui/AlertBanner';
import Card from './ui/Card';
import CustomButton from './ui/CustomButton';

interface GuardProps {
  children: React.ReactNode;
  /** When set, the user must hold one of these roles. */
  roles?: Role[];
}

const FullPageLoader: React.FC<{ label: string }> = ({ label }) => (
  <div className="app-gradient flex min-h-screen items-center justify-center gap-2 text-sm text-slate-400">
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
    {label}
  </div>
);

/**
 * Route guard. Redirects to login when there is no session, and renders an
 * explanatory screen rather than a redirect when the role is not permitted, so
 * a Coordinator landing on an admin-only URL learns why instead of bouncing.
 */
export const ProtectedRoute: React.FC<GuardProps> = ({ children, roles }) => {
  const { user, isLoading } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  if (isLoading) return <FullPageLoader label="Checking your session..." />;

  if (!user) {
    // Remember where they were headed so login can return them there.
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="app-gradient flex min-h-screen items-center justify-center p-6">
        <Card tone="raised" className="w-full max-w-md p-8 text-center" sheen>
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-400">
            <ShieldAlert className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="text-lg font-bold text-white">You do not have access to this page</h1>
          <p className="mt-2 text-sm text-slate-400">
            This area is limited to {roles.join(' and ')} accounts. You are signed in as{' '}
            <span className="text-slate-200">{user.role}</span>.
          </p>
          <div className="mt-4">
            <AlertBanner tone="info">
              Ask a Coordinator or Administrator if you believe this is wrong.
            </AlertBanner>
          </div>
          {/* In-app destination rather than window.history.back(), so the user
              never depends on their browser history to get out of here. */}
          <CustomButton
            variant="secondary"
            fullWidth
            onClick={() => navigate('/dashboard', { replace: true })}
            className="mt-4"
          >
            Go to my dashboard
          </CustomButton>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
