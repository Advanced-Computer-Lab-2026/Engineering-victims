import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { ApiError, apiFetch } from '../../lib/api';
import AlertBanner from '../../components/ui/AlertBanner';
import Card from '../../components/ui/Card';
import CustomButton from '../../components/ui/CustomButton';
import CustomInput from '../../components/ui/CustomInput';
import { usePageTitle } from '../../hooks/usePageTitle';

const ResetPasswordPage: React.FC = () => {
  const location = useLocation();
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'error' | 'success'>('error');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  usePageTitle('Reset password');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading) return;

    // Validate locally so the user is not told the OTP is wrong when the real
    // problem is that the two passwords do not match.
    if (!email.trim() || !otp.trim() || !newPassword) {
      setTone('error');
      setMessage('Fill in your email, the reset code and a new password.');
      return;
    }
    if (newPassword.length < 8) {
      setTone('error');
      setMessage('Use a password of at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setTone('error');
      setMessage('The two passwords do not match.');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const response = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), otp: otp.trim(), newPassword }),
      });

      setTone('success');
      setMessage(response.message || 'Password updated. Taking you to sign in...');
      setTimeout(() => navigate('/', { replace: true }), 2000);
    } catch (err) {
      setTone('error');
      setMessage((err as ApiError).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-surface flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={() => navigate('/forgot-password')}
          className="mb-4 inline-flex items-center gap-1.5 text-caption text-on-surface-variant transition-colors hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </button>

        <Card tone="raised" className="p-6 md:p-8">
          <div className="mb-6 text-center">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
              <KeyRound className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="text-h2 font-bold tracking-tight text-on-surface">Set a new password</h1>
            <p className="mt-1 text-body text-on-surface-variant">Enter the code we emailed you</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {message && (
              <AlertBanner tone={tone} onDismiss={() => setMessage('')}>
                {message}
              </AlertBanner>
            )}

            <CustomInput
              label="GUC Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <CustomInput
              label="Reset Code (OTP)"
              inputMode="numeric"
              placeholder="123456"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              required
            />
            <CustomInput
              label="New Password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            <CustomInput
              label="Confirm Password"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat the new password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              error={confirmPassword && confirmPassword !== newPassword ? 'Passwords do not match' : undefined}
              required
            />

            <CustomButton type="submit" fullWidth isLoading={isLoading}>
              Update Password
            </CustomButton>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
