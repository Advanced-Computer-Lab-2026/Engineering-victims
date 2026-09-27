import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomInput from '../../components/ui/CustomInput';
import CustomButton from '../../components/ui/CustomButton';
import { apiUrl } from '../../lib/api';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      localStorage.setItem('token', data.token);
      navigate('/dashboard');
      
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center app-gradient px-4">
      <div className="max-w-md w-full bg-slate-900 p-8 rounded-2xl shadow-2xl border border-slate-800">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-slate-400">Please enter your GUC credentials</p>
        </div>

        <form onSubmit={handleLogin}>
          {error && (
            <div className="mb-6 p-3 bg-red-900/30 text-red-400 text-sm rounded-lg border border-red-800/50 text-center">
              {error}
            </div>
          )}

          <CustomInput 
            label="GUC Email" 
            type="email" 
            placeholder="name@student.guc.edu.eg" 
            value={email} 
            onChange={(e: any) => setEmail(e.target.value)}
            required 
          />
          
          <div className="relative mb-4">
            <CustomInput 
              label="Password" 
              type="password" 
              placeholder="••••••••" 
              value={password} 
              onChange={(e: any) => setPassword(e.target.value)}
              required 
            />
            <div className="text-right mt-1">
              <button 
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors underline"
              >
                Forgot Password?
              </button>
            </div>
          </div>

          <CustomButton type="submit" isLoading={isLoading}>
            {isLoading ? 'Authenticating...' : 'Sign In'}
          </CustomButton>
        </form>
        
        <p className="mt-6 text-center text-xs text-slate-500">
          University Schedule Management System &copy; 2026
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
