import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { useUnreadCount } from '../hooks/useUnreadCount';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { navLabel, visibleNavItems } from '../lib/navigation';
import type { Role, StudentType } from '../lib/types';

interface SidebarProps {
  role: Role | null;
  /** Set for students only, so Advising-Student pages can be told apart. */
  studentType?: StudentType | null;
  open: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ role, studentType = null, open, onClose }) => {
  const { unreadCount } = useUnreadCount();
  const trapRef = useFocusTrap<HTMLElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <>
      {/* Scrim only exists on small screens, where the sidebar slides over content. */}
      {open && (
        <div
          className="fixed inset-0 z-overlay bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        ref={trapRef}
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-modal flex h-dvh w-20 shrink-0 flex-col bg-gradient-to-b from-blue-600 to-blue-700 shadow-xl transition-all duration-300 ease-out hover:w-64 lg:sticky lg:top-0 lg:translate-x-0 lg:rounded-r-3xl ${
          open ? 'translate-x-0 w-64 rounded-r-3xl' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <span className="text-h2 font-bold text-white">G</span>
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <span className="block truncate text-body-lg font-bold text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">GUC USMS</span>
            <p className="truncate text-caption text-white/70 opacity-0 transition-opacity duration-300 group-hover:opacity-100">Schedule System</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="group flex min-h-0 flex-1 flex-col space-y-1 overflow-y-auto px-3 pb-4">
          {visibleNavItems(role, studentType).map((item) => {
            const Icon = item.icon;
            const label = navLabel(item, role);

            if (item.unavailable) {
              return (
                <div
                  key={item.to}
                  aria-disabled="true"
                  title="Not built yet"
                  className="relative flex h-12 items-center gap-3 rounded-xl px-3 text-white/40 opacity-50"
                >
                  <Icon className="h-6 w-6 shrink-0" aria-hidden />
                  <span className="truncate text-body opacity-0 transition-opacity duration-300 group-hover:opacity-100">{label}</span>
                  <span className="sr-only">{label} (coming soon)</span>
                </div>
              );
            }

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `relative flex h-12 items-center gap-3 rounded-xl px-3 transition-all duration-200 ${
                    isActive
                      ? 'bg-white text-blue-600 shadow-lg'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`
                }
                title={label}
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-6 w-6 shrink-0" aria-hidden />
                    <span className="truncate text-body font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-100">{label}</span>
                    {/* Notification badge */}
                    {item.to === '/notifications' && !!unreadCount && (
                      <span className="ml-auto flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-caption font-bold leading-none text-white shadow-md">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                    {isActive && <span className="sr-only">(current page)</span>}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
