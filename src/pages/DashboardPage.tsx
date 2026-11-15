import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Contact, UserX, Users } from 'lucide-react';
import { ApiError, apiFetch } from '../lib/api';
import { useSession } from '../hooks/useSession';
import { useUnreadCount } from '../hooks/useUnreadCount';
import { navLabel, visibleNavItems } from '../lib/navigation';
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
        <Card className="p-4 text-body text-error">
          Could not load dashboard data: {error}
        </Card>
      )}

      {canManageStudents && stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      <Card tone="raised" className="mt-6 p-6">
        <h2 className="text-h3 font-bold text-on-surface">Getting started</h2>
        <p className="mt-1 text-body text-on-surface-variant">
          Every page in the sidebar is listed here too. Your access depends on your role.
        </p>
        {/* Same source as the sidebar, filtered by the same rules, so the two can
            never disagree about which pages a role may open. The dashboard itself
            is dropped — you are already standing on it. */}
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {visibleNavItems(user?.role ?? null, user?.studentType ?? null)
            .filter((item) => item.to !== '/dashboard')
            .map((item, index) => {
              const Icon = item.icon;
              const tone = TONES[index % TONES.length];

              if (item.unavailable) {
                return (
                  <li key={item.to}>
                    <div
                      aria-disabled="true"
                      className="w-full cursor-not-allowed rounded-xl border border-outline-variant bg-surface-container-low p-4"
                    >
                      <span className="flex items-center gap-2 text-body font-semibold text-on-surface-variant">
                        <Icon className="h-4 w-4" aria-hidden />
                        {navLabel(item, user?.role ?? null)}
                      </span>
                      <span className="mt-1 block text-caption text-on-surface-variant">
                        Not built yet. It stays listed so the navigation does not lie about what exists.
                      </span>
                    </div>
                  </li>
                );
              }

              return (
                <li key={item.to}>
                  <button
                    type="button"
                    onClick={() => navigate(item.to)}
                    className={`w-full rounded-xl border border-outline-variant bg-surface-container-low p-4 text-left transition-colors hover:bg-surface-container focus:outline-none focus-visible:ring-2 ${tone.ring}`}
                  >
                    <span className="flex items-center gap-2 text-body font-semibold text-on-surface">
                      <Icon className={`h-4 w-4 ${tone.icon}`} aria-hidden />
                      {navLabel(item, user?.role ?? null)}
                      {item.to === '/notifications' && !!unreadCount && (
                        <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-caption font-semibold leading-none text-on-primary">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-caption text-on-surface-variant">
                      {item.to === '/notifications' && unreadCount
                        ? `${unreadCount} unread — open it to mark them as read.`
                        : item.description}
                    </span>
                  </button>
                </li>
              );
            })}
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

/**
 * Hover accents for the dashboard tiles, cycled by position rather than carried
 * per nav item — the destination list is shared with the sidebar, which has no
 * colour of its own.
 */
const TONES = [
  { icon: 'text-primary', ring: 'hover:border-primary focus-visible:ring-primary' },
  { icon: 'text-info', ring: 'hover:border-info focus-visible:ring-info' },
  { icon: 'text-success', ring: 'hover:border-success focus-visible:ring-success' },
  { icon: 'text-warning', ring: 'hover:border-warning focus-visible:ring-warning' },
];

const TONE_CLASSES: Record<StatCardProps['tone'], string> = {
  indigo: 'bg-primary-container text-on-primary-container',
  sky: 'bg-info-container text-info',
  amber: 'bg-warning-container text-warning',
  rose: 'bg-error-container text-error',
};

const StatCard: React.FC<StatCardProps> = ({ label, value, detail, icon, tone, onClick }) => {
  const isClickable = !!onClick;

  // A whole-card link is a button for keyboard and screen-reader users, not
  // just a mouse target.
  const activate = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isClickable ? activate : undefined}
      className={`p-5 transition-all ${
        isClickable
          ? 'cursor-pointer hover:border-primary hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">{label}</p>
          <p className="mt-1 text-h1 font-bold tracking-tight text-on-surface">{value}</p>
          <p className="mt-1 truncate text-caption text-on-surface-variant">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
          {icon}
        </span>
      </div>
    </Card>
  );
};

export default DashboardPage;
