import React, { useEffect, useState } from 'react';
import { CreditCard, GraduationCap, Loader2, Mail, ShieldCheck, UserRound } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import StatusPill from '../components/ui/StatusPill';
import AlertBanner from '../components/ui/AlertBanner';
import { ApiError, apiFetch } from '../lib/api';
import { formatDate } from '../lib/studentsService';
import type { Role } from '../lib/types';

interface ProfileAdvisor {
  fullName: string;
  email: string;
}

/**
 * The student fields come from the Student directory (req 6-10) rather than the
 * login user, so they stay correct after a re-seed rebuilds every login record
 * (`node seed/seed.cjs`).
 */
interface ProfileUser {
  fullName: string;
  email: string;
  role: Role;
  isActive?: boolean;
  createdAt?: string;
  studentId?: string;
  studentType?: 'Normal Student' | 'Advising Student';
  major?: string;
  currentSemester?: number;
  academicStanding?: string;
  workflowStatus?: string;
  assignedAdvisor?: ProfileAdvisor | null;
}

const DetailField: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
    <p className="text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">{label}</p>
    <p className="mt-1 text-body font-medium text-on-surface">{value}</p>
  </div>
);

const ProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<{ user: ProfileUser }>('/api/user/profile')
      .then((response) => {
        if (!cancelled) setProfile(response.user);
      })
      .catch((err: ApiError) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <>
        <PageHeader
          title="My Profile"
          description="Your account and academic information."
          onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        />
        <AlertBanner tone="error">Could not load your profile: {error}</AlertBanner>
      </>
    );
  }

  if (!profile) {
    return (
      <div role="status" className="flex min-h-[50vh] items-center justify-center gap-2 text-body text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading your profile...
      </div>
    );
  }

  const isStudent = profile.role === 'Student';

  return (
    <>
      <PageHeader
        title="My Profile"
        description={
          isStudent
            ? 'Your account and academic information.'
            : 'Your account information and scheduling role.'
        }
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      <div className="max-w-4xl space-y-6">
        <Card tone="raised" className="p-6">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-h2 font-bold text-on-primary shadow-elevation-1">
              {profile.fullName.charAt(0)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-h2 font-bold text-on-surface">{profile.fullName}</h2>
              <p className="text-body font-medium text-primary">{profile.role}</p>
              <p className="flex items-center gap-1.5 truncate text-body text-on-surface-variant">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {profile.email}
              </p>
            </div>
            {profile.isActive !== undefined && (
              <div className="ml-auto">
                <StatusPill
                  state={profile.isActive ? 'active' : 'inactive'}
                  workflowStatus={isStudent ? profile.workflowStatus : null}
                />
              </div>
            )}
          </div>
        </Card>

        {/* FR 4.0: every account sees their own profile details. */}
        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-body font-semibold uppercase tracking-eyebrow text-on-surface-variant">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Account Information
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DetailField label="Full Name" value={profile.fullName} />
            <DetailField
              label="GUC Email"
              value={
                <span className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden />
                  <span className="truncate">{profile.email}</span>
                </span>
              }
            />
            <DetailField label="Role" value={profile.role} />
            <DetailField
              label="Account Status"
              value={profile.isActive === undefined ? 'Unknown' : profile.isActive ? 'Active' : 'Inactive'}
            />
            <DetailField label="Member Since" value={profile.createdAt ? formatDate(profile.createdAt) : 'Unknown'} />
          </div>
        </Card>

        {/* FR 4.0: only student profiles carry the academic fields. */}
        {isStudent && (
          <Card className="p-6">
            <h3 className="mb-4 flex items-center gap-2 text-body font-semibold uppercase tracking-eyebrow text-on-surface-variant">
              <GraduationCap className="h-4 w-4 text-primary" aria-hidden />
              Academic Information
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <DetailField
                label="Student ID"
                value={
                  <span className="flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-on-surface-variant" aria-hidden />
                    {profile.studentId || 'Not set'}
                  </span>
                }
              />
              <DetailField label="Student Type" value={profile.studentType || 'Not set'} />
              <DetailField label="Major" value={profile.major || 'Not set'} />
              <DetailField label="Current Semester" value={profile.currentSemester ?? 'Not set'} />
              <DetailField label="Academic Standing" value={profile.academicStanding || 'Not set'} />
              <DetailField
                label="Assigned Advisor"
                value={
                  profile.assignedAdvisor ? (
                    <span className="flex flex-col">
                      <span className="flex items-center gap-1.5">
                        <UserRound className="h-4 w-4 text-on-surface-variant" aria-hidden />
                        {profile.assignedAdvisor.fullName}
                      </span>
                      <span className="truncate text-caption font-normal text-on-surface-variant">
                        {profile.assignedAdvisor.email}
                      </span>
                    </span>
                  ) : (
                    'None assigned'
                  )
                }
              />
            </div>
          </Card>
        )}
      </div>
    </>
  );
};

export default ProfilePage;
