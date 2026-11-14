import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import { ApiError, apiFetch } from '../../lib/api';
import AlertBanner from '../../components/ui/AlertBanner';
import Card from '../../components/ui/Card';
import CustomButton from '../../components/ui/CustomButton';
import CustomInput from '../../components/ui/CustomInput';
import { usePageTitle } from '../../hooks/usePageTitle';

type Tone = 'error' | 'success' | 'info';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Tone>('info');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  usePageTitle('Forgot password');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading) return;

    if (!email.trim()) {
      setTone('error');
      setMessage('Enter the GUC email on your account.');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      await apiFetch<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setTone('success');
      setMessage('A reset code is on its way. Check your GUC inbox, then continue to set a new password.');
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
          onClick={() => navigate('/')}
          className="mb-4 inline-flex items-center gap-1.5 text-caption text-on-surface-variant transition-colors hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to sign in
        </button>

        <Card tone="raised" className="p-6 md:p-8">
          <div className="mb-6 text-center">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
              <Mail className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="text-h2 font-bold tracking-tight text-on-surface">Reset your password</h1>
            <p className="mt-1 text-body text-on-surface-variant">We will email you a one-time code</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {message && (
              <AlertBanner tone={tone} onDismiss={tone === 'success' ? undefined : () => setMessage('')}>
                {message}
              </AlertBanner>
            )}

            <CustomInput
              label="GUC Email"
              type="email"
              autoComplete="email"
              placeholder="name@student.guc.edu.eg"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <CustomButton
              type="submit"
              fullWidth
              isLoading={isLoading}
              icon={<Send className="h-4 w-4" aria-hidden />}
            >
              Send Reset Code
            </CustomButton>

            {tone === 'success' && (
              <CustomButton
                variant="secondary"
                fullWidth
                onClick={() => navigate('/reset-password', { state: { email: email.trim() } })}
              >
                I have the code
              </CustomButton>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
