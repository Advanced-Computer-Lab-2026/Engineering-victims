import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronLeft,
  CircleAlert,
  GraduationCap,
  Hash,
  Hourglass,
  Loader2,
  Mail,
  ScrollText,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { formatDate, formatRelative, pendingRequestFor } from '../lib/studentsService';
import type { StudentDetailResponse } from '../lib/types';
import { useSession } from '../hooks/useSession';
import { usePageTitle } from '../hooks/usePageTitle';
import StudentScheduleHistorySection from '../components/StudentScheduleHistorySection';
import AdvisingOverviewPanel from '../components/AdvisingOverviewPanel';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import StatusPill from '../components/ui/StatusPill';

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

const DetailRow: React.FC<DetailRowProps> = ({ icon, label, children }) => (
  <div className="flex items-start gap-3 py-2.5">
    <span className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden>
      {icon}
    </span>
    <div className="min-w-0 flex-1">
      <dt className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">{label}</dt>
      <dd className="mt-0.5 break-words text-body text-on-surface">{children}</dd>
    </div>
  </div>
);

const STANDING_TONE: Record<string, BadgeTone> = {
  'Good Standing': 'emerald',
  Probation: 'amber',
  Dismissed: 'rose',
};

/**
 * Req 9: one student's full record.
 *
 * This used to be a 512px side drawer, which made the academic history and
 * advising tables unreadable. It is now a route so the record gets the full
 * page width, while the app history controls keep going back reversible.
 */
const StudentDetailPage: React.FC = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { user } = useSession();
  const role = user?.role ?? null;

  const [data, setData] = useState<StudentDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [advisors, setAdvisors] = useState<Array<{ id: string; fullName: string; email: string }>>([]);
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('');
  const [isSavingAdvisor, setIsSavingAdvisor] = useState(false);
  const [advisorError, setAdvisorError] = useState<string | null>(null);

  // The record's own name reads better in the tab than the directory label.
  usePageTitle(data?.student.fullName ?? 'Student details');

  const canManage = role === 'Administrator';
  const canAssignAdvisor =
    (role === 'Coordinator' || role === 'Administrator') && data?.student.studentType === 'Advising Student';
  const canViewHistory =
    (role === 'Advisor' || role === 'Coordinator') && data?.student.studentType === 'Advising Student';
  // Req 31: Advisors and Coordinators see Advising Students' schedules; an
  // Administrator has read-only access to every student's.
  const canViewSchedule = role === 'Administrator' || canViewHistory;

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/students');
  };

  useEffect(() => {
    if (!studentId) return;

    let cancelled = false;
    setData(null);
    setError(null);
    setNotice(null);
    setAdvisorError(null);
    setAdvisors([]);

    apiFetch<StudentDetailResponse>(`/api/students/${studentId}`)
      .then((response) => {
        if (!cancelled) {
          setData(response);
          setSelectedAdvisorId(response.student.assignedAdvisor?.id ?? '');
        }
      })
      .catch((err: ApiError) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    if (!canAssignAdvisor) return;

    let cancelled = false;
    apiFetch<{ advisors: Array<{ id: string; fullName: string; email: string }> }>('/api/students/advisors')
      .then((response) => {
        if (!cancelled) setAdvisors(response.advisors);
      })
      .catch(() => {
        if (!cancelled) setAdvisorError('Could not load the advisor list.');
      });

    return () => {
      cancelled = true;
    };
  }, [canAssignAdvisor]);

  const handleToggleStatus = async () => {
    if (!data) return;

    setIsSaving(true);
    setError(null);

    try {
      const nextStatus = !data.student.isActive;
      const response = await apiFetch<{ message: string }>(`/api/students/${data.student.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: nextStatus }),
      });

      setData((current) =>
        current
          ? { ...current, student: { ...current.student, isActive: nextStatus, lastUpdateAt: new Date().toISOString() } }
          : current
      );
      setNotice(response.message);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssignAdvisor = async () => {
    if (!data || !selectedAdvisorId) return;

    setIsSavingAdvisor(true);
    setAdvisorError(null);

    try {
      const response = await apiFetch<{ message: string; student: StudentDetailResponse['student'] }>(
        `/api/students/${data.student.id}/advisor`,
        {
          method: 'PATCH',
          body: JSON.stringify({ advisorId: selectedAdvisorId }),
        }
      );

      setData((current) => (current ? { ...current, student: response.student } : current));
      setSelectedAdvisorId(response.student.assignedAdvisor?.id ?? '');
      setNotice(response.message);
    } catch (err) {
      setAdvisorError((err as ApiError).message);
    } finally {
      setIsSavingAdvisor(false);
    }
  };

  if (!studentId) return null;

  const student = data?.student;
  const isAdvisingStudent = student?.studentType === 'Advising Student';
  const isMyStudent = role === 'Advisor' && student?.assignedAdvisor?.id === user?.id;
  const pendingRequest = student ? pendingRequestFor(student.workflowStatus) : 'None';

  return (
    <>
      <div className="mb-2 -ml-2">
        <CustomButton
          variant="ghost"
          size="sm"
          onClick={goBack}
          icon={<ChevronLeft className="h-4 w-4" aria-hidden />}
        >
          Back
        </CustomButton>
      </div>

      <PageHeader
        title={student?.fullName ?? 'Student details'}
        description={student ? `${student.studentId} · ${student.major}` : 'Loading student record...'}
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          student ? (
            <div className="flex flex-wrap items-center gap-2">
              {canViewSchedule && (
                <CustomButton
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/schedule/${student.id}`)}
                  icon={<CalendarDays className="h-4 w-4" aria-hidden />}
                >
                  Weekly schedule
                </CustomButton>
              )}
              {canViewHistory && (
                <CustomButton
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/academic-history/${student.id}`)}
                  icon={<ScrollText className="h-4 w-4" aria-hidden />}
                >
                  Academic history
                </CustomButton>
              )}
              {isAdvisingStudent && role === 'Advisor' && (
                <CustomButton
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/graduation-plans?studentId=${student.id}`)}
                  icon={<GraduationCap className="h-4 w-4" aria-hidden />}
                >
                  Graduation plan
                </CustomButton>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="space-y-5">
        {error && (
          <AlertBanner tone="error" title="Could not load student details">
            {error}
          </AlertBanner>
        )}

        {notice && (
          <AlertBanner tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </AlertBanner>
        )}

        {!student && !error && (
          <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading student...
          </Card>
        )}

        {student && (
          <>
            <div className="grid gap-5 xl:grid-cols-3">
              <Card tone="raised" className="p-6 xl:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill state={student.isActive ? 'active' : 'inactive'} />
                  <Badge tone={isAdvisingStudent ? 'indigo' : 'sky'}>{student.studentType}</Badge>
                  <Badge tone={STANDING_TONE[student.academicStanding] ?? 'neutral'}>
                    {student.academicStanding}
                  </Badge>
                  {isMyStudent && <Badge tone="indigo">Your student</Badge>}
                </div>

                <h2 className="mt-5 text-h3 font-bold text-on-surface">Academic</h2>
                <dl className="mt-1 grid gap-x-8 md:grid-cols-2">
                  <DetailRow icon={<Mail className="h-4 w-4" />} label="GUC email">
                    {student.email}
                  </DetailRow>
                  <DetailRow icon={<GraduationCap className="h-4 w-4" />} label="Major">
                    {student.major}
                  </DetailRow>
                  <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Current semester">
                    Semester {student.currentSemester}
                  </DetailRow>
                  <DetailRow icon={<UserRound className="h-4 w-4" />} label="Assigned advisor">
                    {student.assignedAdvisor ? (
                      <>
                        <span className="block text-on-surface">{student.assignedAdvisor.fullName}</span>
                        <span className="block text-caption text-on-surface-variant">
                          {student.assignedAdvisor.email}
                        </span>
                      </>
                    ) : (
                      <span className="text-on-surface-variant">Not assigned</span>
                    )}
                  </DetailRow>
                </dl>
              </Card>

              <Card tone="raised" className="p-6">
                <h2 className="flex items-center gap-2 text-h3 font-bold text-on-surface">
                  <Building2 className="h-5 w-5 text-on-surface-variant" aria-hidden />
                  Account
                </h2>
                <p className="mt-2 text-caption leading-relaxed text-on-surface-variant">
                  Deactivating blocks this student from logging in. Their academic, scheduling and audit
                  history is kept.
                </p>
                <div className="mt-5">
                  {canManage ? (
                    <CustomButton
                      variant={student.isActive ? 'danger' : 'primary'}
                      fullWidth
                      isLoading={isSaving}
                      onClick={handleToggleStatus}
                      icon={
                        student.isActive ? (
                          <ShieldAlert className="h-4 w-4" aria-hidden />
                        ) : (
                          <BadgeCheck className="h-4 w-4" aria-hidden />
                        )
                      }
                    >
                      {student.isActive ? 'Deactivate account' : 'Activate account'}
                    </CustomButton>
                  ) : (
                    <p className="text-caption text-on-surface-variant">
                      Only an Administrator can change an account status.
                    </p>
                  )}
                </div>
              </Card>
            </div>

            <div className={canAssignAdvisor ? 'grid gap-5 xl:grid-cols-2' : ''}>
              {canAssignAdvisor && (
                <Card tone="raised" className="p-6">
                  <h2 className="text-h3 font-bold text-on-surface">Advisor assignment</h2>

                  {advisorError && (
                    <div className="mt-3">
                      <AlertBanner tone="error">{advisorError}</AlertBanner>
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">
                        Assigned advisor
                      </span>
                      <select
                        value={selectedAdvisorId}
                        onChange={(event) => setSelectedAdvisorId(event.target.value)}
                        className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-body text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select an advisor</option>
                        {advisors.map((advisor) => (
                          <option key={advisor.id} value={advisor.id}>
                            {advisor.fullName} ({advisor.email})
                          </option>
                        ))}
                      </select>
                    </label>

                    <CustomButton
                      variant="primary"
                      size="md"
                      onClick={handleAssignAdvisor}
                      isLoading={isSavingAdvisor}
                      disabled={!selectedAdvisorId}
                    >
                      Save advisor
                    </CustomButton>
                  </div>
                </Card>
              )}

              <Card tone="raised" className="p-6">
                <h2 className="text-h3 font-bold text-on-surface">Scheduling workflow</h2>
                <dl className="mt-2 divide-y divide-outline-variant">
                  <DetailRow icon={<BadgeCheck className="h-4 w-4" />} label="Workflow status">
                    <Badge tone="indigo" dot>
                      {student.workflowStatus}
                    </Badge>
                  </DetailRow>
                  <DetailRow icon={<Hourglass className="h-4 w-4" />} label="Pending request">
                    {pendingRequest === 'None' ? (
                      <span className="text-on-surface-variant">None</span>
                    ) : (
                      <Badge tone="amber">{pendingRequest}</Badge>
                    )}
                  </DetailRow>
                  <DetailRow icon={<CircleAlert className="h-4 w-4" />} label="Blocking step">
                    {student.blockingStep ?? <span className="text-on-surface-variant">None</span>}
                  </DetailRow>
                  <DetailRow icon={<Hash className="h-4 w-4" />} label="Last updated">
                    {formatRelative(student.lastUpdateAt)}{' '}
                    <span className="text-caption text-on-surface-variant">
                      ({formatDate(student.lastUpdateAt)})
                    </span>
                  </DetailRow>
                </dl>
              </Card>
            </div>

            {/* Req 123: show schedule processing and reopening history. */}
            {isAdvisingStudent && (
              <StudentScheduleHistorySection
                studentObjectId={student.id}
                workflowStatus={student.workflowStatus}
                role={role}
                onWorkflowChanged={() => {
                  apiFetch<StudentDetailResponse>(`/api/students/${student.id}`)
                    .then((response) => {
                      setData(response);
                      setSelectedAdvisorId(response.student.assignedAdvisor?.id ?? '');
                    })
                    .catch((err: ApiError) => setError(err.message));
                }}
              />
            )}

            {/* Req 59: advising reason, allowance and bachelor-project eligibility. */}
            {isAdvisingStudent && <AdvisingOverviewPanel studentId={student.id} />}
          </>
        )}
      </div>
    </>
  );
};

export default StudentDetailPage;
