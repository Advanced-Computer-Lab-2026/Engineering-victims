import React, { useEffect, useLayoutEffect, useRef } from 'react';
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
  collapsed: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ role, studentType = null, open, collapsed, onExpand, onCollapse, onClose }) => {
  const { unreadCount } = useUnreadCount();
  const trapRef = useFocusTrap<HTMLElement>(open);
  const slide = useRef<Animation | null>(null);
  const previousWidth = useRef('80px');

  useLayoutEffect(() => {
    const node = trapRef.current;
    if (!node || !window.matchMedia('(min-width: 1024px)').matches) {
      slide.current?.cancel();
      previousWidth.current = '80px';
      return;
    }
    const style = getComputedStyle(node);
    const target = collapsed ? '80px' : '256px';
    const from = slide.current?.playState === 'running' ? style.width : previousWidth.current;
    slide.current?.cancel();
    previousWidth.current = target;
    if (from === target) return;
    // Explicitly requested slide: WAAPI keeps this local preference separate
    // from the system-wide reduced-motion CSS used by other components.
    slide.current = node.animate([{ width: from }, { width: target }], {
      duration: parseFloat(style.getPropertyValue('--duration-slow')) || 350,
      easing: style.getPropertyValue('--ease-standard').trim() || 'ease-out',
    });
  }, [collapsed, open, trapRef]);

  useEffect(() => () => slide.current?.cancel(), []);

  useEffect(() => {
    if (!open) return;
    // Visibility and the background's inert state must settle before focus.
    const node = trapRef.current;
    const durations = node ? getComputedStyle(node).transitionDuration.split(',').map((value) => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000)) : [0];
    const timer = window.setTimeout(() => node?.querySelector<HTMLButtonElement>('.sidebar-close')?.focus(), Math.max(...durations));
    return () => {
      window.clearTimeout(timer);
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.nav-toggle')?.focus());
    };
  }, [open, trapRef]);

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
      <div className="sidebar-desktop-space" aria-hidden />
      <div className={`nav-scrim ${open ? 'nav-scrim--open' : ''}`} onClick={onClose} aria-hidden />
      <aside
        id="main-navigation"
        ref={trapRef}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label="Main navigation"
        onMouseEnter={() => { if (window.matchMedia('(min-width: 1024px)').matches) onExpand(); }}
        onMouseLeave={() => { if (window.matchMedia('(min-width: 1024px)').matches) onCollapse(); }}
        onFocusCapture={() => { if (window.matchMedia('(min-width: 1024px)').matches) onExpand(); }}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(':hover')) onCollapse(); }}
        onTransitionEnd={(event) => {
          if (open && event.target === event.currentTarget && event.propertyName === 'transform') trapRef.current?.querySelector<HTMLButtonElement>('.sidebar-close')?.focus();
        }}
        className={`app-sidebar ${open ? 'app-sidebar--open' : ''} ${collapsed ? 'app-sidebar--collapsed' : ''}`}
      >
        <div className="sidebar-brand flex items-center gap-3 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
            <span className="text-h2 font-bold text-white">G</span>
          </div>
          <div className="sidebar-label min-w-0 flex-1 overflow-hidden">
            <span className="block truncate text-body-lg font-bold text-on-surface">GUC USMS</span>
            <p className="truncate text-caption text-on-surface-variant">Schedule System</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="sidebar-close ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="sidebar-links flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
          {visibleNavItems(role, studentType).map((item) => {
            const Icon = item.icon;
            const label = navLabel(item, role);

            if (item.unavailable) {
              return (
                <div
                  key={item.to}
                  aria-disabled="true"
                  title="Not built yet"
                  className="sidebar-link relative flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-on-surface-variant opacity-50"
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="sidebar-label truncate text-body">{label}</span>
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
                  `sidebar-link relative flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 transition-colors ${
                    isActive
                      ? 'bg-primary-container text-on-primary-container font-semibold'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                  }`
                }
                aria-label={label}
                title={label}
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    <span className="sidebar-label truncate text-body font-medium">{label}</span>
                    {/* Notification badge */}
                    {item.to === '/notifications' && !!unreadCount && (
                      <span className="sidebar-badge ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-error px-1 text-caption font-bold leading-none text-on-error">
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
