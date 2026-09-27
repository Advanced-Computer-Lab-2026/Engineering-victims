import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogIn, ShieldCheck } from 'lucide-react';
import { ApiError, apiFetch } from '../../lib/api';
import type { SessionUser } from '../../lib/types';
import AlertBanner from '../../components/ui/AlertBanner';
import Card from '../../components/ui/Card';
import CustomButton from '../../components/ui/CustomButton';
import CustomInput from '../../components/ui/CustomInput';

interface LoginResponse {
  token: string;
  user: SessionUser;
}

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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

      // Return the user to wherever the guard interrupted them.
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/' ? from : '/dashboard', { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-gradient flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-950/50">
            U
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in with your GUC credentials</p>
        </div>

        <Card tone="raised" className="p-6 sm:p-8" sheen>
          <form onSubmit={handleLogin} noValidate className="space-y-4">
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
                className="text-xs text-indigo-400 underline-offset-4 transition-colors hover:text-indigo-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                Forgot password?
              </button>
            </div>

            <CustomButton type="submit" fullWidth isLoading={isLoading}>
              Sign In
            </CustomButton>
          </form>
        </Card>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Accounts are created by the Coordinator. There is no sign-up.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
