import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import Sidebar from './Sidebar';

const AppLayout: React.FC = () => {
  const { user } = useSession();
  const [navOpen, setNavOpen] = useState(false);

  // PageHeader dispatches this rather than prop-drilling through every page.
  React.useEffect(() => {
    const toggle = () => setNavOpen((current) => !current);
    document.addEventListener('toggle-nav', toggle);
    return () => document.removeEventListener('toggle-nav', toggle);
  }, []);

  return (
    <div className="app-gradient flex min-h-screen font-sans text-slate-200">
      <Sidebar role={user?.role ?? null} open={navOpen} onClose={() => setNavOpen(false)} />

      <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
