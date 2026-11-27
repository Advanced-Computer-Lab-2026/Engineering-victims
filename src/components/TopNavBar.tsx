import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, User } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import { useUnreadCount } from '../hooks/useUnreadCount';

/**
 * Clean top navigation bar with search, notifications, and user menu.
 * Follows modern dashboard patterns. See decisions/011-modern-dashboard-redesign.md.
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
    <header className="sticky left-0 right-0 top-0 z-30 bg-white/80 backdrop-blur-md lg:left-20">
      <div className="flex h-20 items-center justify-between gap-4 px-6">
        {/* Left side - could add breadcrumbs or page context here */}
        <div className="flex-1" />

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          {/* Greeting */}
          <div className="hidden text-right lg:block">
            <p className="text-body text-gray-900">Hello, <strong className="font-semibold">{user.fullName?.split(' ')[0]}</strong></p>
            <p className="text-caption text-gray-600">Welcome to GUC {user.role}</p>
          </div>

          {/* Notifications */}
          <button
            type="button"
            onClick={handleNotificationsClick}
            aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
            className="relative flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100"
          >
            <Bell className="h-5 w-5" aria-hidden />
            {!!unreadCount && (
              <span className="absolute right-0.5 top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-caption font-bold leading-none text-white shadow-sm">
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
              className="flex h-11 items-center gap-2 rounded-xl bg-gray-100 px-3 text-gray-700 transition-colors hover:bg-gray-200"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-caption font-bold text-white shadow-sm">
                {user.fullName?.charAt(0).toUpperCase() ?? 'U'}
              </div>
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-14 w-64 rounded-2xl border border-gray-200 bg-white shadow-xl">
                <div className="border-b border-gray-100 p-4">
                  <p className="truncate text-body font-semibold text-gray-900">
                    {user.fullName}
                  </p>
                  <p className="truncate text-caption text-gray-600">{user.email}</p>
                  <span className="mt-2 inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-caption font-semibold text-blue-700">
                    {user.role}
                  </span>
                </div>
                <div className="p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/profile');
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-body text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <User className="h-5 w-5" aria-hidden />
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-body text-red-600 transition-colors hover:bg-red-50"
                  >
                    <LogOut className="h-5 w-5" aria-hidden />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopNavBar;
