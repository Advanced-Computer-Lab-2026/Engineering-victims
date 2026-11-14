import React, { useEffect, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CircleAlert,
  GraduationCap,
  Hash,
  Loader2,
  Mail,
  ScrollText,
  ShieldAlert,
  UserRound,
  X,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { formatDate, formatRelative } from '../lib/studentsService';
import type { Role, StudentDetailResponse } from '../lib/types';
import StudentScheduleHistorySection from './StudentScheduleHistorySection';
import AdvisingOverviewPanel from './AdvisingOverviewPanel';
import AlertBanner from './ui/AlertBanner';
import Badge, { type BadgeTone } from './ui/Badge';
import CustomButton from './ui/CustomButton';
import StatusPill from './ui/StatusPill';

interface StudentDetailDrawerProps {
  studentId: string | null;
  role: Role | null;
  onClose: () => void;
  /** Called after a status change so the list can refresh behind the drawer. */
  onStatusChange: () => void;
}

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
 * Req 9: opens one student's details from the list.
 *
 * Rendered as a side panel that slides over the list rather than a separate
 * route, so closing it returns the user exactly where they were. The list state
 * is never unmounted, which is the "navigation is reversible" requirement.
 */
const StudentDetailDrawer: React.FC<StudentDetailDrawerProps> = ({
  studentId,
  role,
  onClose,
  onStatusChange,
}) => {
  const trapRef = useFocusTrap<HTMLElement>(!!studentId);
  const [data, setData] = useState<StudentDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [advisors, setAdvisors] = useState<Array<{ id: string; fullName: string; email: string }>>([]);
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('');
  const [isSavingAdvisor, setIsSavingAdvisor] = useState(false);
  const [advisorError, setAdvisorError] = useState<string | null>(null);

  const canManage = role === 'Administrator';
  const canAssignAdvisor = (role === 'Coordinator' || role === 'Administrator') && data?.student.studentType === 'Advising Student';
  const canViewHistory = (role === 'Advisor' || role === 'Coordinator') && data?.student.studentType === 'Advising Student';
  // Req 31: Advisors and Coordinators see Advising Students' schedules; an
  // Administrator has read-only access to every student's.
  const canViewSchedule = role === 'Administrator' || canViewHistory;
  const navigate = useNavigate();

  const reloadStudent = () => {
    if (!studentId) return;
    apiFetch<StudentDetailResponse>(`/api/students/${studentId}`)
      .then((response) => {
        setData(response);
        setSelectedAdvisorId(response.student.assignedAdvisor?.id ?? '');
      })
      .catch((err: ApiError) => {
        setError(err.message);
      });
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
        if (!cancelled) {
          setAdvisors(response.advisors);
          if (!selectedAdvisorId && data?.student.assignedAdvisor) {
            setSelectedAdvisorId(data.student.assignedAdvisor.id);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setAdvisorError('Could not load the advisor list.');
      });

    return () => {
      cancelled = true;
    };
  }, [canAssignAdvisor, data?.student.assignedAdvisor, selectedAdvisorId]);

  // Escape closes the panel, matching the close button.
  useEffect(() => {
    if (!studentId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [studentId, onClose]);

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
      onStatusChange();
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

      setData((current) =>
        current
          ? { ...current, student: response.student }
          : current
      );
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

  return (
    <div className="fixed inset-0 z-toast flex justify-end">
      <div className="absolute inset-0 scrim backdrop-blur-sm" onClick={onClose} aria-hidden />

      <aside
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Student details"
        className="relative flex h-full w-full max-w-lg flex-col border-l border-outline-variant bg-surface-container-lowest backdrop-blur-xl shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant p-6">
          <div className="min-w-0">
            <h2 className="truncate text-h3 font-bold text-on-surface">{student?.fullName ?? 'Loading...'}</h2>
            {student && <p className="mt-0.5 truncate font-mono text-caption text-on-surface-variant">{student.studentId}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {error && <AlertBanner tone="error" title="Could not load student details">{error}</AlertBanner>}

          {notice && (
            <AlertBanner tone="success" onDismiss={() => setNotice(null)}>
              {notice}
            </AlertBanner>
          )}

          {!student && !error && (
            <div role="status" className="flex items-center justify-center gap-2 py-16 text-body text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading student...
            </div>
          )}

          {student && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill state={student.isActive ? 'active' : 'inactive'} />
                <Badge tone={student.studentType === 'Advising Student' ? 'indigo' : 'sky'}>
                  {student.studentType}
                </Badge>
                <Badge tone={STANDING_TONE[student.academicStanding] ?? 'neutral'}>
                  {student.academicStanding}
                </Badge>
              </div>

              <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
                <h3 className="mb-1 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                  Academic
                </h3>
                <dl className="divide-y divide-outline-variant">
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
                        <span className="block text-caption text-on-surface-variant">{student.assignedAdvisor.email}</span>
                      </>
                    ) : (
                      <span className="text-on-surface-variant">Not assigned</span>
                    )}
                  </DetailRow>
                </dl>
              </section>

              {canAssignAdvisor && (
                <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
                  <h3 className="mb-3 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                    Advisor assignment
                  </h3>

                  {advisorError && <AlertBanner tone="error">{advisorError}</AlertBanner>}

                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">Assigned advisor</span>
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
                      size="sm"
                      onClick={handleAssignAdvisor}
                      isLoading={isSavingAdvisor}
                      disabled={!selectedAdvisorId}
                    >
                      Save advisor
                    </CustomButton>
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
                <h3 className="mb-1 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                  Scheduling workflow
                </h3>
                <dl className="divide-y divide-outline-variant">
                  <DetailRow icon={<BadgeCheck className="h-4 w-4" />} label="Workflow status">
                    <Badge tone="indigo" dot>
                      {student.workflowStatus}
                    </Badge>
                  </DetailRow>
                  <DetailRow icon={<CircleAlert className="h-4 w-4" />} label="Blocking step">
                    {student.blockingStep ?? <span className="text-on-surface-variant">None</span>}
                  </DetailRow>
                  <DetailRow icon={<Hash className="h-4 w-4" />} label="Last updated">
                    {formatRelative(student.lastUpdateAt)}{' '}
                    <span className="text-caption text-on-surface-variant">({formatDate(student.lastUpdateAt)})</span>
                  </DetailRow>
                </dl>
              </section>

              {/* Req 123: Show schedule processing and reopening history in advising details */}
              {student.studentType === 'Advising Student' && (
                <StudentScheduleHistorySection
                  studentObjectId={student.id}
                  workflowStatus={student.workflowStatus}
                  role={role}
                  onWorkflowChanged={() => {
                    reloadStudent();
                    onStatusChange();
                  }}
                />
              )}
              {/* Req 59: advising reason, allowance and bachelor-project eligibility. */}
              {student.studentType === 'Advising Student' && <AdvisingOverviewPanel studentId={student.id} />}

              <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
                <h3 className="mb-2 flex items-center gap-2 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                  <Building2 className="h-3.5 w-3.5" aria-hidden />
                  Account
                </h3>
                <p className="text-caption leading-relaxed text-on-surface-variant">
                  Deactivating blocks this student from logging in. Their academic, scheduling and
                  audit history is kept.
                </p>
              </section>
            </>
          )}
        </div>

        {student && (
          <div className="border-t border-outline-variant p-6">
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
              <p className="text-center text-caption text-on-surface-variant">
                Only an Administrator can change an account status.
              </p>
            )}
            {/* Req 54: the academic history is kept for Advising Students and
                is open to Advisors and Coordinators. */}
            {canViewSchedule && (
              <CustomButton
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => navigate(`/schedule/${student.id}`)}
                icon={<CalendarDays className="h-4 w-4" aria-hidden />}
                className="mt-2"
              >
                View weekly schedule
              </CustomButton>
            )}
            {canViewHistory && (
              <CustomButton
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => navigate(`/academic-history/${student.id}`)}
                icon={<ScrollText className="h-4 w-4" aria-hidden />}
                className="mt-2"
              >
                View academic history
              </CustomButton>
            )}
            <CustomButton variant="ghost" size="sm" fullWidth onClick={onClose} className="mt-2">
              Close
            </CustomButton>
          </div>
        )}
      </aside>
    </div>
  );
};

export default StudentDetailDrawer;
