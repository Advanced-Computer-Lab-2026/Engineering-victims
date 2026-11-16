import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/RouteGuards';
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import NotFoundPage from './pages/NotFoundPage';
// Brand first, then system tokens, then the project's Tailwind entry point.
import '../brand.css';
import '../ui-system/tokens.css';
import './index.css';

const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const NotificationsPage = React.lazy(() => import('./pages/NotificationsPage'));
const StudentsPage = React.lazy(() => import('./pages/StudentsPage'));
const StudentDetailPage = React.lazy(() => import('./pages/StudentDetailPage'));
const AcademicTermsPage = React.lazy(() => import('./pages/AcademicTermsPage'));
const AdvisorsPage = React.lazy(() => import('./pages/AdvisorsPage'));
const CourseCataloguePage = React.lazy(() => import('./pages/CourseCataloguePage'));
const CourseOfferingsPage = React.lazy(() => import('./pages/CourseOfferingsPage'));
const CoordinatorQueuePage = React.lazy(() => import('./pages/CoordinatorQueuePage'));
const PendingWorkDashboardPage = React.lazy(() => import('./pages/PendingWorkDashboardPage'));
const ScheduleActivityHistoryPage = React.lazy(() => import('./pages/ScheduleActivityHistoryPage'));
const ScheduleTemplatesPage = React.lazy(() => import('./pages/ScheduleTemplatesPage'));
const WalletPage = React.lazy(() => import('./pages/WalletPage'));
const AdvisingStudentsPage = React.lazy(() => import('./pages/AdvisingStudentsPage'));
const AcademicHistoryPage = React.lazy(() => import('./pages/AcademicHistoryPage'));
const TranscriptPage = React.lazy(() => import('./pages/TranscriptPage'));
const WeeklySchedulePage = React.lazy(() => import('./pages/WeeklySchedulePage'));
const AdvisingScheduleDraftPage = React.lazy(() => import('./pages/AdvisingScheduleDraftPage'));
const CourseAvailabilityPage = React.lazy(() => import('./pages/CourseAvailabilityPage'));
const SchedulingPreferencesPage = React.lazy(() => import('./pages/SchedulingPreferencesPage'));
const MyRegisteredCoursesPage = React.lazy(() => import('./pages/MyRegisteredCoursesPage'));
const EligibleSwapGroupsPage = React.lazy(() => import('./pages/EligibleSwapGroupsPage'));
const ScheduleSwapsPage = React.lazy(() => import('./pages/ScheduleSwapsPage'));
const MySlotChangeRequestsPage = React.lazy(() => import('./pages/MySlotChangeRequestsPage'));
const SlotChangeRequestsReviewPage = React.lazy(() => import('./pages/SlotChangeRequestsReviewPage'));
const GraduationPlansRoute = React.lazy(() => import('./pages/GraduationPlansRoute'));
const GraduationPlanBuilderPage = React.lazy(() => import('./pages/GraduationPlanBuilderPage'));
const MyGraduationPlanPage = React.lazy(() => import('./pages/MyGraduationPlanPage'));
const ExitExamRequestsPage = React.lazy(() => import('./pages/ExitExamRequestsPage'));
const SemesterStandingsPage = React.lazy(() => import('./pages/SemesterStandingsPage'));
const ExtraHoursRequestsPage = React.lazy(() => import('./pages/ExtraHoursRequestsPage'));
const MyExtraHoursRequestsPage = React.lazy(() => import('./pages/MyExtraHoursRequestsPage'));
const InstallmentBillingPage = React.lazy(() => import('./pages/InstallmentBillingPage'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route element={<ProtectedRoute roles={['Student', 'Coordinator', 'Administrator']}><AppLayout /></ProtectedRoute>}>
          <Route path="/billing" element={<InstallmentBillingPage />} />
        </Route>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Req 6-9: the student directory. An Advisor sees the same screens
            but only over their own assigned students, which the API enforces. */}
        <Route
          element={
            <ProtectedRoute roles={['Coordinator', 'Administrator', 'Advisor']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/students" element={<StudentsPage />} />
          {/* Req 9, 53: one student's full record. A route rather than a side
              drawer so the academic history and advising tables fit. */}
          <Route path="/students/:studentId" element={<StudentDetailPage />} />
        </Route>

        {/* Req 50: every advising student, for Advisors only. */}
        <Route
          element={
            <ProtectedRoute roles={['Advisor']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/advising-students" element={<AdvisingStudentsPage />} />
        </Route>

        {/* Req 103-114: Advisors build and submit plans, Coordinators review
            them. The page picks the view for the signed-in role. */}
        <Route
          element={
            <ProtectedRoute roles={['Advisor', 'Coordinator']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/advising-schedules/:studentId/draft" element={<AdvisingScheduleDraftPage />} />
          <Route path="/course-availability" element={<CourseAvailabilityPage />} />
          <Route path="/graduation-plans" element={<GraduationPlansRoute />} />
          <Route path="/graduation-plans/:planId" element={<GraduationPlanBuilderPage />} />
          {/* Req 43: Advisors see their assigned students' slot-change
              requests, Coordinators all of them; the API sets the scope. */}
          <Route path="/slot-change-review" element={<SlotChangeRequestsReviewPage />} />
        </Route>

        {/* Req 11-12, Req 122, Req 123-125: Coordinator & Administrator routes. */}
        <Route
          element={
            <ProtectedRoute roles={['Coordinator', 'Administrator']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/coordinator/pending-work" element={<PendingWorkDashboardPage />} />
          <Route path="/coordinator/queue" element={<CoordinatorQueuePage />} />
          <Route path="/schedule-history" element={<ScheduleActivityHistoryPage />} />
          <Route path="/advisors" element={<AdvisorsPage />} />
          <Route path="/schedule-templates" element={<ScheduleTemplatesPage />} />
          <Route path="/semester-standings" element={<SemesterStandingsPage />} />
        </Route>

        <Route
          element={
            <ProtectedRoute roles={['Coordinator']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/exit-exam-requests" element={<ExitExamRequestsPage />} />
          <Route path="/extra-hours-requests" element={<ExtraHoursRequestsPage />} />
        </Route>

        {/* Req 89: students only. A Normal Student who types the URL is told
            by the API that the wallet is for Advising Students. */}
        <Route
          element={
            <ProtectedRoute roles={['Student']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/my-extra-hours-requests" element={<MyExtraHoursRequestsPage />} />
          {/* Req 114: the accepted graduation plan, when there is one. */}
          <Route path="/my-graduation-plan" element={<MyGraduationPlanPage />} />
          {/* Req 54: an Advising Student's own history. */}
          <Route path="/academic-history" element={<AcademicHistoryPage />} />
          {/* Req 55: an Advising Student's own transcript, one academic year at a time. */}
          <Route path="/transcript" element={<TranscriptPage />} />
          {/* Req 32: registered courses, credits per course and the total —
              for every student, Normal and Advising alike. */}
          <Route path="/my-courses" element={<MyRegisteredCoursesPage />} />
          {/* Req 34: Normal Students can view eligible swap groups with
              exact same course set. */}
          <Route path="/eligible-swap-groups" element={<EligibleSwapGroupsPage />} />
          {/* Req 35-39: Normal Students submit, view, complete, and withdraw whole-schedule swaps. */}
          <Route path="/swaps" element={<ScheduleSwapsPage />} />
          {/* Req 41: an Advising Student's own slot-change requests. The API
              refuses Normal Students and only returns the caller's requests. */}
          <Route path="/slot-change-requests" element={<MySlotChangeRequestsPage />} />
          {/* Req 31: a student's own weekly schedule. */}
          <Route path="/schedule" element={<WeeklySchedulePage />} />
          {/* Req 57: Advising Students' scheduling preferences. */}
          <Route path="/preferences" element={<SchedulingPreferencesPage />} />
        </Route>

        {/* Req 31: staff open a student's schedule read-only; the API limits
            Advisors and Coordinators to Advising Students. */}
        <Route
          element={
            <ProtectedRoute roles={['Advisor', 'Coordinator', 'Administrator']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/schedule/:studentId" element={<WeeklySchedulePage />} />
        </Route>

        {/* Req 54: Advisors and Coordinators open any advising student's history. */}
        <Route
          element={
            <ProtectedRoute roles={['Advisor', 'Coordinator']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/academic-history/:studentId" element={<AcademicHistoryPage />} />
          {/* Req 55: same access as the history, so any advising student's transcript. */}
          <Route path="/transcript/:studentId" element={<TranscriptPage />} />
        </Route>

        <Route
          element={
            <ProtectedRoute roles={['Administrator']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/terms" element={<AcademicTermsPage />} />
          <Route path="/courses" element={<CourseCataloguePage />} />
          <Route path="/offerings" element={<CourseOfferingsPage />} />
        </Route>

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);