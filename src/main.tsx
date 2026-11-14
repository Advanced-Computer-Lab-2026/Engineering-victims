import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/RouteGuards';
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import StudentsPage from './pages/StudentsPage';
import AcademicTermsPage from './pages/AcademicTermsPage';
import AdvisorsPage from './pages/AdvisorsPage';
import CourseCataloguePage from './pages/CourseCataloguePage';
import CourseOfferingsPage from './pages/CourseOfferingsPage';
import CoordinatorQueuePage from './pages/CoordinatorQueuePage';
import PendingWorkDashboardPage from './pages/PendingWorkDashboardPage';
import ScheduleActivityHistoryPage from './pages/ScheduleActivityHistoryPage';
import ScheduleTemplatesPage from './pages/ScheduleTemplatesPage';
import WalletPage from './pages/WalletPage';
import AdvisingStudentsPage from './pages/AdvisingStudentsPage';
import AcademicHistoryPage from './pages/AcademicHistoryPage';
import TranscriptPage from './pages/TranscriptPage';
import WeeklySchedulePage from './pages/WeeklySchedulePage';
import AdvisingScheduleDraftPage from './pages/AdvisingScheduleDraftPage';
import SchedulingPreferencesPage from './pages/SchedulingPreferencesPage';
import MyRegisteredCoursesPage from './pages/MyRegisteredCoursesPage';
import EligibleSwapGroupsPage from './pages/EligibleSwapGroupsPage';
import ScheduleSwapsPage from './pages/ScheduleSwapsPage';
import MySlotChangeRequestsPage from './pages/MySlotChangeRequestsPage';
import SlotChangeRequestsReviewPage from './pages/SlotChangeRequestsReviewPage';
import GraduationPlansRoute from './pages/GraduationPlansRoute';
import GraduationPlanBuilderPage from './pages/GraduationPlanBuilderPage';
import MyGraduationPlanPage from './pages/MyGraduationPlanPage';
import ExitExamRequestsPage from './pages/ExitExamRequestsPage';
import SemesterStandingsPage from './pages/SemesterStandingsPage';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
