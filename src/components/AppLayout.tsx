import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { usePageTitle } from '../hooks/usePageTitle';
import HistoryButtons from './HistoryButtons';
import Sidebar from './Sidebar';
import TopNavBar from './TopNavBar';

const AppLayout: React.FC = () => {
  const { user } = useSession();
  const [navOpen, setNavOpen] = React.useState(false);
  const mainRef = React.useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const isFirstRender = React.useRef(true);
  usePageTitle();

  // PageHeader dispatches this rather than prop-drilling through every page.
  React.useEffect(() => {
    const toggle = () => setNavOpen((current) => !current);
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
    <div className="flex h-dvh overflow-hidden bg-gray-50 font-sans text-on-surface">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Sidebar
        role={user?.role ?? null}
        studentType={user?.studentType ?? null}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopNavBar />

        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 focus-visible:outline-none md:p-6 lg:p-8"
        >
          {/* Same spot on every page, the way a browser keeps its own controls. */}
          <div className="-ml-1.5 mb-3">
            <HistoryButtons />
          </div>
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
