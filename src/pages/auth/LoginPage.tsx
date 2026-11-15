import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, ShieldCheck } from 'lucide-react';
import { ApiError, apiFetch } from '../../lib/api';
import type { SessionUser } from '../../lib/types';
import AlertBanner from '../../components/ui/AlertBanner';
import Card from '../../components/ui/Card';
import CustomButton from '../../components/ui/CustomButton';
import CustomInput from '../../components/ui/CustomInput';
import { usePageTitle } from '../../hooks/usePageTitle';
import { consumeSessionNotice } from '../../hooks/useSession';

interface LoginResponse {
  token: string;
  user: SessionUser;
}

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notice] = useState<string | null>(() => consumeSessionNotice());
  const navigate = useNavigate();
  usePageTitle('Sign in');

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading) return;

    setError(null);

    // Catch obvious mistakes before a round trip, so the user is not told
    // "invalid credentials" for a typo in the domain.
    if (!email.trim() || !password) {
      setError('Enter both your GUC email and password.');
      return;
    }
    if (!/@(student\.)?guc\.edu\.eg$/.test(email.trim().toLowerCase())) {
      setError('Use your GUC email address. It ends in @guc.edu.eg or @student.guc.edu.eg.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      // Tells any already-mounted useSession consumers to re-read, so a
      // role-gated route does not render before the session is known.
      window.dispatchEvent(new Event('auth-changed'));

      // Always land on the dashboard. The guard may remember the page a dead
      // session interrupted, and that page can be one this role cannot open —
      // a predictable landing page avoids both surprises and the role screen.
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-surface flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-h2 font-bold text-on-primary shadow-elevation-1">
            U
          </div>
          <h1 className="text-h2 font-bold tracking-tight text-on-surface">Welcome back</h1>
          <p className="mt-1 text-body text-on-surface-variant">Sign in with your GUC credentials</p>
        </div>

        <Card tone="raised" className="p-6 md:p-8">
          <form onSubmit={handleLogin} noValidate className="space-y-4">
            {notice && <AlertBanner tone="info">{notice}</AlertBanner>}

            {error && (
              <AlertBanner tone="error" onDismiss={() => setError(null)}>
                {error}
              </AlertBanner>
            )}

            <CustomInput
              label="GUC Email"
              type="email"
              autoComplete="email"
              placeholder="name@student.guc.edu.eg"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              icon={<LogIn className="h-4 w-4" aria-hidden />}
              required
            />

            <CustomInput
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-caption text-primary underline-offset-4 transition-colors hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Forgot password?
              </button>
            </div>

            <CustomButton type="submit" fullWidth isLoading={isLoading}>
              Sign In
            </CustomButton>
          </form>
        </Card>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-caption text-on-surface-variant">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Accounts are created by the Coordinator. There is no sign-up.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
