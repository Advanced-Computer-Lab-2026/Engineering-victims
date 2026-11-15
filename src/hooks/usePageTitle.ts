import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { NAV_ITEMS, navLabel } from '../lib/navigation';
import { useSession } from './useSession';

const PRODUCT = 'USMS Portal';

const titleForPath = (pathname: string, role: Parameters<typeof navLabel>[1]): string => {
  const match = NAV_ITEMS.filter(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`)
  ).sort((a, b) => b.to.length - a.to.length)[0];
  return match ? navLabel(match, role) : '';
};

/** Keeps one descriptive document title per route. */
export const usePageTitle = (title?: string) => {
  const { pathname } = useLocation();
  const { user } = useSession();

  useEffect(() => {
    const label = title ?? (user ? titleForPath(pathname, user.role) : '');
    document.title = label ? `${label} · ${PRODUCT}` : PRODUCT;
  }, [title, pathname, user]);
};
