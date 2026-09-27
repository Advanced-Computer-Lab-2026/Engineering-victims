import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomInput from '../../components/ui/CustomInput';
import CustomButton from '../../components/ui/CustomButton';
import { apiUrl } from '../../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return; 
    
    setMessage('');
    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('A reset code has been sent to your email!');
        setTimeout(() => {
          navigate('/reset-password');
        }, 3000);
      } else {
        setMessage(data.message);
        setIsLoading(false);
      }
    } catch (err) {
      setMessage('Server error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="max-w-md w-full bg-slate-900 p-8 rounded-2xl shadow-2xl border border-slate-800">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Reset Password</h1>
          <p className="text-slate-400">Enter your email to receive a reset code</p>
        </div>
        <form onSubmit={handleSubmit}>
          {message && (
            <div className={`mb-6 p-3 text-sm rounded-lg border text-center ${message.includes('sent') ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50' : 'bg-red-900/30 text-red-400 border-red-800/50'}`}>
              {message}
            </div>
          )}
          <CustomInput label="GUC Email" type="email" placeholder="name@student.guc.edu.eg" value={email} onChange={(e: any) => setEmail(e.target.value)} required />
          <CustomButton type="submit" isLoading={isLoading}>
            {isLoading ? 'Sending Code...' : 'Send Reset Code'}
          </CustomButton>
        </form>
      </div>
    </div>
  );
}
