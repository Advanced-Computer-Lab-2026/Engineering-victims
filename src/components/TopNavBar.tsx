import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, User } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import { useUnreadCount } from '../hooks/useUnreadCount';

/**
 * Top navigation bar with notifications and user menu.
 * Light background, clean and minimal. See decisions/010-admin-panel-design-system.md.
 */
const TopNavBar: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useSession();
  const { unreadCount } = useUnreadCount();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [userMenuOpen]);

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  const handleNotificationsClick = () => {
    navigate('/notifications');
  };

  if (!user) return null;

  return (
    <header className="sticky left-0 right-0 top-0 z-40 border-b border-gray-200 bg-white shadow-sm lg:left-72">
      <div className="flex h-16 items-center justify-between gap-4 px-6">
        {/* Page title or breadcrumbs could go here */}
        <div className="flex-1" />

        {/* Notifications */}
        <button
          type="button"
          onClick={handleNotificationsClick}
          aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
          className="relative flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <Bell className="h-5 w-5" aria-hidden />
          {!!unreadCount && (
            <span className="absolute right-0.5 top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-caption font-bold leading-none text-black">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* User menu */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
            className="flex h-10 items-center gap-2 rounded-lg px-3 text-gray-700 transition-colors hover:bg-gray-100"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-caption font-bold text-black">
              {user.fullName?.charAt(0).toUpperCase() ?? 'U'}
            </div>
            <span className="hidden text-body font-medium md:inline">
              {user.fullName?.split(' ')[0] ?? 'User'}
            </span>
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-12 w-56 rounded-lg border border-gray-200 bg-white shadow-lg">
              <div className="border-b border-gray-200 p-4">
                <p className="truncate text-body font-semibold text-gray-900">
                  {user.fullName}
                </p>
                <p className="truncate text-caption text-gray-600">{user.email}</p>
                <p className="mt-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary">
                  {user.role}
                </p>
              </div>
              <div className="p-2">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate('/profile');
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-body text-gray-700 transition-colors hover:bg-gray-100"
                >
                  <User className="h-4 w-4" aria-hidden />
                  Profile
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-body text-red-600 transition-colors hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopNavBar;
