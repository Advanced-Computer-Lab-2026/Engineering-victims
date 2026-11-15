import React from 'react';
import { useSession } from '../hooks/useSession';
import CoordinatorGraduationPlansPage from './CoordinatorGraduationPlansPage';
import GraduationPlansPage from './GraduationPlansPage';

/**
 * Req 110: the same `/graduation-plans` destination, with the view the role
 * owns. Advisors build and submit their own plans; Coordinators review all
 * submitted plans. The route guard has already resolved the session.
 */
const GraduationPlansRoute: React.FC = () => {
  const { user } = useSession();
  return user?.role === 'Coordinator' ? <CoordinatorGraduationPlansPage /> : <GraduationPlansPage />;
};

export default GraduationPlansRoute;
