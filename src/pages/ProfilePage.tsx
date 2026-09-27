import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/');
          return;
        }

        const response = await fetch('http://localhost:5000/api/user/profile', {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) throw new Error('Failed to fetch profile');

        const data = await response.json();
        setUser(data.user);
      } catch (error) {
        console.error('Profile error:', error);
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-200 font-sans">
      {/* Sidebar (Consistent with Dashboard) */}
      <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shadow-xl">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">U</div>
            <h1 className="text-xl font-bold tracking-tight text-white">USMS Portal</h1>
          </div>
          <nav className="space-y-1">
            <button onClick={() => navigate('/dashboard')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
              <span>🏠</span> Dashboard
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-600 text-white font-medium transition-all shadow-lg shadow-indigo-500/20">
              <span>👤</span> My Profile
            </button>
          </nav>
        </div>
        <div className="mt-auto p-6 border-t border-slate-800">
          <button onClick={() => { localStorage.removeItem('token'); navigate('/'); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-red-900/20 hover:text-red-400 transition-all">
            <span>🚪</span> Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-12">
          <h2 className="text-4xl font-extrabold text-white tracking-tight">My Profile</h2>
          <p className="text-slate-400 mt-2">Manage your academic information and account settings.</p>
        </header>

        <div className="max-w-4xl space-y-8">
          {/* Profile Header Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex items-center gap-8 shadow-xl">
            <div className="w-24 h-24 bg-indigo-600 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg shadow-indigo-500/20">
              {user.fullName.charAt(0)}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">{user.fullName}</h3>
              <p className="text-indigo-400 font-medium">{user.role}</p>
              <p className="text-slate-400 text-sm">{user.email}</p>
            </div>
          </div>

          {/* Information Grid — student-only fields (FR 4.0) */}
          {user.role === 'Student' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Student ID</p>
              <p className="text-white text-lg font-medium">{user.studentId || 'N/A'}</p>
            </div>
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Student Type</p>
              <p className="text-white text-lg font-medium">{user.studentType || 'N/A'}</p>
            </div>
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Major</p>
              <p className="text-white text-lg font-medium">{user.major || 'N/A'}</p>
            </div>
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Current Semester</p>
              <p className="text-white text-lg font-medium">{user.currentSemester ?? 'N/A'}</p>
            </div>
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Academic Standing</p>
              <p className="text-white text-lg font-medium">{user.academicStanding || 'Good Standing'}</p>
            </div>
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Schedule Status</p>
              <p className="text-white text-lg font-medium">{user.scheduleStatus || 'N/A'}</p>
            </div>
            {user.assignedAdvisor && (
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
                <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Assigned Advisor</p>
                <p className="text-white text-lg font-medium">{user.assignedAdvisor.fullName}</p>
                <p className="text-slate-400 text-sm">{user.assignedAdvisor.email}</p>
              </div>
            )}
          </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ProfilePage;
