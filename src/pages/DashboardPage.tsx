import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, Contact, UserX, Users } from 'lucide-react';
import { ApiError, apiFetch } from '../lib/api';
import { useSession } from '../hooks/useSession';
import { useUnreadCount } from '../hooks/useUnreadCount';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';

interface StatsResponse {
  total: number;
  active: number;
  inactive: number;
  advising: number;
  normal: number;
  waitingOnStudent: number;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useSession();
  const { unreadCount } = useUnreadCount();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManageStudents = user?.role === 'Coordinator' || user?.role === 'Administrator';

  useEffect(() => {
    if (!canManageStudents) return;

    let cancelled = false;
    apiFetch<{ stats: StatsResponse }>('/api/students/stats')
      .then((response) => {
        if (!cancelled) setStats(response.stats);
      })
      .catch((err: ApiError) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [canManageStudents]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={user ? `${user.role} | ${user.email}` : undefined}
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      {error && (
        <Card className="p-4 text-sm text-rose-300">
          Could not load dashboard data: {error}
        </Card>
      )}

      {canManageStudents && stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total students"
            value={stats.total}
            detail={`${stats.active} active, ${stats.inactive} inactive`}
            icon={<Users className="h-5 w-5" aria-hidden />}
            tone="indigo"
          />
          <StatCard
            label="Advising students"
            value={stats.advising}
            detail={`${stats.normal} normal students`}
            icon={<Contact className="h-5 w-5" aria-hidden />}
            tone="sky"
          />
          <StatCard
            label="Waiting on student"
            value={stats.waitingOnStudent}
            detail="Review or slot-change pending"
            icon={<Bell className="h-5 w-5" aria-hidden />}
            tone="amber"
            onClick={() => navigate('/coordinator/queue')}
          />
          <StatCard
            label="Inactive accounts"
            value={stats.inactive}
            detail="Cannot log in"
            icon={<UserX className="h-5 w-5" aria-hidden />}
            tone="rose"
          />
        </div>
      )}

      <Card tone="raised" className="mt-6 p-6" sheen>
        <h2 className="text-lg font-bold text-white">Getting started</h2>
        <p className="mt-1 text-sm text-slate-400">
          Pick a destination from the sidebar. Your access depends on your role.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {canManageStudents && (
            <li>
              <button
                type="button"
                onClick={() => navigate('/students')}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-left transition-colors hover:border-indigo-500 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Users className="h-4 w-4 text-indigo-400" aria-hidden />
                  Students
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  Search, filter and review the scheduling workflow for every student.
                </span>
              </button>
            </li>
          )}
          <li>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-left transition-colors hover:border-emerald-500 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <Contact className="h-4 w-4 text-emerald-400" aria-hidden />
                My Profile
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                Review your student ID, major, standing and assigned advisor.
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-left transition-colors hover:border-sky-500 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <Bell className="h-4 w-4 text-sky-400" aria-hidden />
                Notifications
                {!!unreadCount && (
                  <span className="ml-auto rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                {unreadCount
                  ? `${unreadCount} unread — open it to mark them as read.`
                  : 'Review updates and mark them as read.'}
              </span>
            </button>
          </li>
          <li>
            {/* Req 31 now serves /schedule, so students get a live shortcut;
                staff open a student's schedule from the student lists. */}
            {user?.role === 'Student' ? (
              <button
                type="button"
                onClick={() => navigate('/schedule')}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-left transition-colors hover:border-sky-500 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <CalendarDays className="h-4 w-4 text-sky-400" aria-hidden />
                  My Schedule
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  View your weekly timetable for the current term.
                </span>
              </button>
            ) : (
              <div
                aria-disabled="true"
                className="w-full cursor-not-allowed rounded-xl border border-slate-800/80 bg-slate-900/30 p-4"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  My Schedule
                </span>
                <span className="mt-1 block text-xs text-slate-600">
                  Staff open a student's schedule from the Students list.
                </span>
              </div>
            )}
          </li>
        </ul>
      </Card>
    </>
  );
};

interface StatCardProps {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  tone: 'indigo' | 'sky' | 'amber' | 'rose';
  onClick?: () => void;
}

const TONE_CLASSES: Record<StatCardProps['tone'], string> = {
  indigo: 'bg-indigo-500/15 text-indigo-400',
  sky: 'bg-sky-500/15 text-sky-400',
  amber: 'bg-amber-500/15 text-amber-400',
  rose: 'bg-rose-500/15 text-rose-400',
};

const StatCard: React.FC<StatCardProps> = ({ label, value, detail, icon, tone, onClick }) => {
  const isClickable = !!onClick;

  return (
    <Card className={`p-5 transition-all ${isClickable ? 'cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5' : ''}`} onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-white">{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
          {icon}
        </span>
      </div>
    </Card>
  );
};

export default DashboardPage;
