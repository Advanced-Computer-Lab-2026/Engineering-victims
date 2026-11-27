import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { usePageTitle } from '../hooks/usePageTitle';
import Sidebar from './Sidebar';
import TopNavBar from './TopNavBar';

const AppLayout: React.FC = () => {
  const { user } = useSession();
  const [navOpen, setNavOpen] = React.useState(false);
  const [navCollapsed, setNavCollapsed] = React.useState(true);
  const [isDesktop, setIsDesktop] = React.useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const workspaceRef = React.useRef<HTMLDivElement>(null);
  const mainRef = React.useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const isFirstRender = React.useRef(true);
  usePageTitle();
  React.useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const resize = () => { setIsDesktop(media.matches); setNavOpen(false); setNavCollapsed(true); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  React.useLayoutEffect(() => {
    workspaceRef.current?.toggleAttribute('inert', navOpen && !isDesktop);
  }, [navOpen, isDesktop]);

  // PageHeader dispatches this rather than prop-drilling through every page.
  React.useEffect(() => {
    const toggle = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) setNavCollapsed((current) => !current);
      else setNavOpen((current) => !current);
    };
    document.addEventListener('toggle-nav', toggle);
    return () => document.removeEventListener('toggle-nav', toggle);
  }, []);

  // A client-side route change keeps focus on the link that was clicked, so a
  // screen reader would stay in the navigation. Move it to the new page
  // instead. The first render is skipped so the initial load keeps its focus.
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className={`app-shell flex h-dvh overflow-hidden bg-surface-container-low font-sans text-on-surface ${navCollapsed ? 'app-shell--collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Sidebar
        role={user?.role ?? null}
        studentType={user?.studentType ?? null}
        open={navOpen}
        collapsed={navCollapsed}
        onExpand={() => setNavCollapsed(false)}
        onCollapse={() => setNavCollapsed(true)}
        onClose={() => { setNavOpen(false); setNavCollapsed(true); }}
      />

      <div ref={workspaceRef} className="app-workspace flex min-h-0 min-w-0 flex-1 flex-col">
        <TopNavBar navExpanded={isDesktop ? !navCollapsed : navOpen} isDesktop={isDesktop} />

        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 focus-visible:outline-none md:p-6 lg:p-8"
        >
          {/* Same spot on every page, the way a browser keeps its own controls. */}
          <React.Suspense
            fallback={
              <div className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant" role="status">
                Loading page...
              </div>
            }
          >
            <Outlet />
          </React.Suspense>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
