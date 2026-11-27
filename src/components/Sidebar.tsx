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
          className="fixed inset-0 z-overlay scrim backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        ref={trapRef}
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-modal flex h-dvh w-72 shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-h3 font-bold text-on-primary shadow-elevation-1">
            U
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-body-lg font-bold tracking-tight text-on-surface">USMS Portal</span>
            <p className="truncate text-caption text-on-surface-variant">GUC Scheduling</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-11 w-11 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-4 pt-2">
          {visibleNavItems(role, studentType).map((item) => {
            const Icon = item.icon;
            const label = navLabel(item, role);
            const baseClasses =
              'flex w-full min-h-11 items-center gap-3 rounded-xl px-4 py-2.5 text-body font-medium transition-colors';

            if (item.unavailable) {
              return (
                <span
                  key={item.to}
                  aria-disabled="true"
                  title="Not built yet"
                  className={`${baseClasses} cursor-not-allowed text-on-surface-variant opacity-60`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1 truncate text-left">{label}</span>
                  <span className="rounded-full bg-surface-container px-1.5 py-0.5 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
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
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate text-left">{label}</span>
                    {/* Unread badge on the notifications item, for every role. */}
                    {item.to === '/notifications' && !!unreadCount && (
                      <span className="min-w-[1.3rem] rounded-full bg-primary-container text-center text-caption font-semibold leading-none text-on-primary-container px-1.5 py-0.5">
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
      </aside>
    </>
  );
};

export default Sidebar;
