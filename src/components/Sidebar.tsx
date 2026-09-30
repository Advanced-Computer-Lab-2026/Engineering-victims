import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, BookOpen, CalendarDays, Contact, LayoutDashboard, Layers, LogOut, Users, UserCog, X } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import { useUnreadCount } from '../hooks/useUnreadCount';
import CustomButton from './ui/CustomButton';
import type { Role } from '../lib/types';

interface SidebarProps {
  role: Role | null;
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Roles allowed to see the item. Omit to show it to everyone. */
  roles?: Role[];
  /** Per-role overrides for `label`, e.g. "Students" is "My Students" for an Advisor. */
  labels?: Partial<Record<Role, string>>;
  /**
   * Marks a destination that is not built yet. It stays visible but inert, so
   * the nav does not grow dead links that bounce the user to the login page.
   */
  unavailable?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    to: '/students',
    label: 'Students',
    // An Advisor is shown their own assigned students, not the whole school.
    labels: { Advisor: 'My Students' },
    icon: Users,
    roles: ['Coordinator', 'Administrator', 'Advisor'],
  },
  // Matches the /advisors route guard, so the item is not hidden from a role
  // that is allowed to open the page.
  { to: '/advisors', label: 'Advisors', icon: UserCog, roles: ['Coordinator', 'Administrator'] },
  { to: '/terms', label: 'Academic Terms', icon: CalendarDays, roles: ['Administrator'] },
  { to: '/courses', label: 'Course Catalogue', icon: BookOpen, roles: ['Administrator'] },
  // The route existed with no nav entry, so the offerings seeded for each term
  // were only reachable by typing the URL.
  { to: '/offerings', label: 'Course Offerings', icon: Layers, roles: ['Administrator'] },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/schedule', label: 'My Schedule', icon: CalendarDays, unavailable: true },
  { to: '/profile', label: 'My Profile', icon: Contact },
];

const Sidebar: React.FC<SidebarProps> = ({ role, open, onClose }) => {
  const navigate = useNavigate();
  const { logout } = useSession();
  const { unreadCount } = useUnreadCount();

  const handleLogout = () => {
    // Clearing the shared session also collapses the role-gated nav items, so
    // signing out lands on login with no stale state behind it.
    logout();
    navigate('/', { replace: true });
  };

  return (
    <>
      {/* Scrim only exists on small screens, where the sidebar slides over content. */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 shrink-0 border-r border-slate-800/80 bg-slate-950/85 backdrop-blur-md flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-lg font-bold text-white shadow-lg shadow-indigo-950/50">
            U
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold tracking-tight text-white">USMS Portal</h1>
            <p className="truncate text-xs text-slate-500">GUC Scheduling</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 pb-4">
          {NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role))).map((item) => {
            const Icon = item.icon;
            const label = (role && item.labels?.[role]) || item.label;
            const baseClasses =
              'flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all';

            if (item.unavailable) {
              return (
                <span
                  key={item.to}
                  aria-disabled="true"
                  title="Not built yet"
                  className={`${baseClasses} cursor-not-allowed text-slate-600`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1 truncate text-left">{label}</span>
                  <span className="rounded-full bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Soon
                  </span>
                </span>
              );
            }

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `${baseClasses} ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/40'
                      : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate text-left">{label}</span>
                    {/* Unread badge on the notifications item, for every role. */}
                    {item.to === '/notifications' && !!unreadCount && (
                      <span className="min-w-[1.3rem] rounded-full bg-indigo-500 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                    {isActive && <span className="sr-only">(current page)</span>}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-slate-800/80 p-4">
          <CustomButton
            variant="ghost"
            size="sm"
            fullWidth
            onClick={handleLogout}
            icon={<LogOut className="h-4 w-4" aria-hidden />}
            className="justify-start hover:bg-rose-950/40 hover:text-rose-300"
          >
            Sign Out
          </CustomButton>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
