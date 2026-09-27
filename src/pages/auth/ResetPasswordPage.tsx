import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomInput from '../../components/ui/CustomInput';
import CustomButton from '../../components/ui/CustomButton';
import { apiUrl } from '../../lib/api';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return; 
    
    setMessage('');
    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Password updated successfully! Redirecting...');
        setTimeout(() => navigate('/'), 2000);
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
    <div className="min-h-screen flex items-center justify-center app-gradient px-4">
      <div className="max-w-md w-full bg-slate-900 p-8 rounded-2xl shadow-2xl border border-slate-800">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Set New Password</h1>
          <p className="text-slate-400">Enter your code and new password</p>
        </div>
        <form onSubmit={handleSubmit}>
          {message && (
            <div className={`mb-6 p-3 text-sm rounded-lg border text-center ${message.includes('successfully') ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50' : 'bg-red-900/30 text-red-400 border-red-800/50'}`}>
              {message}
            </div>
          )}
          <CustomInput label="GUC Email" type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} required />
          <CustomInput label="Reset Code (OTP)" type="text" placeholder="123456" value={otp} onChange={(e: any) => setOtp(e.target.value)} required />
          <CustomInput label="New Password" type="password" placeholder="••••••••" value={newPassword} onChange={(e: any) => setNewPassword(e.target.value)} required />
          <CustomButton type="submit" isLoading={isLoading}>
            {isLoading ? 'Updating...' : 'Update Password'}
          </CustomButton>
        </form>
      </div>
    </div>
  );
}
