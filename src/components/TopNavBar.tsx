import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, User } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import { useUnreadCount } from '../hooks/useUnreadCount';

interface TopNavBarProps {
  onToggleSidebar: () => void;
}

/**
 * Top navigation bar with GUC branding, notifications, and user menu.
 * Fixed at top of viewport. See decisions/009-top-navigation-bar.md.
 */
const TopNavBar: React.FC<TopNavBarProps> = ({ onToggleSidebar }) => {
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

  return (
    <header className="fixed left-0 right-0 top-0 z-50 h-16 border-b border-outline-variant bg-surface-container-lowest shadow-sm">
      <div className="flex h-full items-center gap-4 px-4">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Open navigation"
          className="flex h-10 w-10 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        {/* Logo + wordmark */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-h3 font-bold text-on-primary shadow-sm">
            G
          </div>
          <div className="hidden sm:block">
            <span className="block text-body-lg font-bold leading-tight text-on-surface">
              GUC USMS
            </span>
            <span className="block text-caption leading-tight text-on-surface-variant">
              Schedule Management
            </span>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Notifications */}
        {user && (
          <button
            type="button"
            onClick={handleNotificationsClick}
            aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
            className="relative flex h-10 w-10 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <Bell className="h-5 w-5" aria-hidden />
            {!!unreadCount && (
              <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-error px-1 text-caption font-semibold leading-none text-on-error">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        )}

        {/* User menu */}
        {user && (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
              className="flex h-10 items-center gap-2 rounded-md px-3 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-caption font-semibold text-on-primary-container">
                {user.fullName?.charAt(0).toUpperCase() ?? 'U'}
              </div>
              <span className="hidden text-body font-medium md:inline">
                {user.fullName?.split(' ')[0] ?? 'User'}
              </span>
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-12 w-56 rounded-lg border border-outline-variant bg-surface-container-low shadow-lg">
                <div className="border-b border-outline-variant p-4">
                  <p className="truncate text-body font-semibold text-on-surface">
                    {user.fullName}
                  </p>
                  <p className="truncate text-caption text-on-surface-variant">{user.email}</p>
                  <p className="mt-1 text-caption font-medium text-primary">{user.role}</p>
                </div>
                <div className="p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/profile');
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-body text-on-surface transition-colors hover:bg-surface-container"
                  >
                    <User className="h-4 w-4" aria-hidden />
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-body text-error transition-colors hover:bg-error-container"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default TopNavBar;
