import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, User, Menu, PanelLeftClose } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import { useUnreadCount } from '../hooks/useUnreadCount';
import HistoryButtons from './HistoryButtons';

/**
 * Clean top navigation bar with search, notifications, and user menu.
 * Follows modern dashboard patterns. See decisions/011-modern-dashboard-redesign.md.
 */
const TopNavBar: React.FC<{ navExpanded: boolean; isDesktop: boolean }> = ({ navExpanded, isDesktop }) => {
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
    <header className="sticky top-0 z-sticky border-b border-outline-variant bg-surface">
      <div className="flex min-h-16 items-center justify-between gap-3 px-4 md:px-6">
        {/* Left side - could add breadcrumbs or page context here */}
        <div className="flex items-center gap-2">
          <button type="button" className="nav-toggle flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={navExpanded ? 'Collapse navigation' : 'Expand navigation'} aria-controls="main-navigation" aria-expanded={navExpanded}
            onClick={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}>
            {navExpanded && isDesktop ? <PanelLeftClose className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
          <HistoryButtons />
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          {/* Greeting */}
          <div className="hidden text-right lg:block">
            <p className="text-body text-on-surface">Hello, <strong className="font-semibold">{user.fullName?.split(' ')[0]}</strong></p>
            <p className="text-caption text-on-surface-variant">Welcome to GUC {user.role}</p>
          </div>

          {/* Notifications */}
          <button
            type="button"
            onClick={handleNotificationsClick}
            aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
            className="relative flex h-11 w-11 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <Bell className="h-5 w-5" aria-hidden />
            {!!unreadCount && (
              <span className="absolute right-0.5 top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-error px-1.5 text-caption font-bold leading-none text-on-error shadow-sm">
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
              aria-label="Account menu"
              className="flex h-11 items-center gap-2 rounded-xl bg-surface-container px-3 text-on-surface transition-colors hover:bg-surface-container-high"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-caption font-bold text-on-primary-container">
                {user.fullName?.charAt(0).toUpperCase() ?? 'U'}
              </div>
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-14 w-64 rounded-2xl border border-outline-variant bg-surface shadow-xl">
                <div className="border-b border-outline-variant p-4">
                  <p className="truncate text-body font-semibold text-on-surface">
                    {user.fullName}
                  </p>
                  <p className="truncate text-caption text-on-surface-variant">{user.email}</p>
                  <span className="mt-2 inline-flex items-center rounded-full bg-primary-container px-2.5 py-1 text-caption font-semibold text-on-primary-container">
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
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-body text-on-surface transition-colors hover:bg-surface-container-low"
                  >
                    <User className="h-5 w-5" aria-hidden />
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-body text-error transition-colors hover:bg-error-container"
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
