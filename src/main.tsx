import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
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
import CoursesPage from './pages/CoursesPage';
import CourseOfferingsPage from './pages/CourseOfferingsPage';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Req 6-10 are a Coordinator and Administrator area. */}
        <Route
          element={
            <ProtectedRoute roles={['Coordinator', 'Administrator']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/advisors" element={<AdvisorsPage />} />
        </Route>

        <Route
          element={
            <ProtectedRoute roles={['Administrator']}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/terms" element={<AcademicTermsPage />} />
          <Route path="/courses" element={<CoursesPage />} />
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
  </React.StrictMode>,
);
