import React from 'react';
import { useNavigate } from 'react-router-dom';

function DashboardPage() {
  const navigate = useNavigate();
  const user = {
    fullName: 'Samy Elgedaily',
    role: 'Student',
    email: 'samy.elgedaily@student.guc.edu.eg'
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-200 font-sans">
      <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shadow-xl">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">U</div>
            <h1 className="text-xl font-bold tracking-tight text-white">USMS Portal</h1>
          </div>
          <nav className="space-y-1">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-600 text-white font-medium transition-all shadow-lg shadow-indigo-500/20">
              <span>🏠</span> Dashboard
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
              <span>📅</span> My Schedule
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
              <span>👤</span> My Profile
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
              <span>🔔</span> Notifications
            </button>
          </nav>
        </div>
        <div className="mt-auto p-6 border-t border-slate-800">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-red-900/20 hover:text-red-400 transition-all">
            <span>🚪</span> Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-10 overflow-y-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h2 className="text-4xl font-extrabold text-white tracking-tight">Welcome back, {user.fullName.split(' ')[0]}!</h2>
            <p className="text-slate-400 mt-2 text-lg">Here is what's happening with your academic schedule today.</p>
          </div>
          <div className="flex items-center gap-4 bg-slate-900 p-2 pr-6 rounded-full border border-slate-800">
            <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center font-bold text-white">
              {user.fullName.charAt(0)}
            </div>
            <span className="text-sm font-medium text-slate-300">{user.role}</span>
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl hover:border-indigo-500 transition-all cursor-pointer group relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-600/10 rounded-full blur-2xl group-hover:bg-indigo-600/20 transition-all"></div>
            <div className="w-14 h-14 bg-indigo-600/20 text-indigo-400 rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">📅</div>
            <h3 className="text-xl font-bold text-white mb-2">Weekly Schedule</h3>
            <p className="text-slate-400 leading-relaxed">Access your current timetable and check for any slot changes.</p>
          </div>
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl hover:border-emerald-500 transition-all cursor-pointer group relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-600/10 rounded-full blur-2xl group-hover:bg-emerald-600/20 transition-all"></div>
            <div className="w-14 h-14 bg-emerald-600/20 text-emerald-400 rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">👤</div>
            <h3 className="text-xl font-bold text-white mb-2">Academic Profile</h3>
            <p className="text-slate-400 leading-relaxed">Review your GPA, credits, and current academic standing.</p>
          </div>
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl hover:border-amber-500 transition-all cursor-pointer group relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-600/10 rounded-full blur-2xl group-hover:bg-amber-600/20 transition-all"></div>
            <div className="w-14 h-14 bg-amber-600/20 text-amber-400 rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">🔔</div>
            <h3 className="text-xl font-bold text-white mb-2">Recent Alerts</h3>
            <p className="text-slate-400 leading-relaxed">Stay updated with notifications from your advisor.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default DashboardPage;
