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
import ScheduleTemplatesPage from './pages/ScheduleTemplatesPage';
import WalletPage from './pages/WalletPage';
import AdvisingStudentsPage from './pages/AdvisingStudentsPage';
import AcademicHistoryPage from './pages/AcademicHistoryPage';
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

        {/* Req 11-12: managing the advising roster itself stays staff-only. */}
        <Route
          element={
            <ProtectedRoute roles={['Coordinator', 'Administrator']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* /students lives in the directory guard above, where main widened it
              to Advisors. Only Omars' own route belongs here. */}
          <Route path="/coordinator/queue" element={<CoordinatorQueuePage />} />
          <Route path="/advisors" element={<AdvisorsPage />} />
          <Route path="/schedule-templates" element={<ScheduleTemplatesPage />} />
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
          {/* Req 54: an Advising Student's own history. */}
          <Route path="/academic-history" element={<AcademicHistoryPage />} />
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
