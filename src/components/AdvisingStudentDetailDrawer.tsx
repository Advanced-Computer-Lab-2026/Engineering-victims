import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  CalendarDays,
  CircleAlert,
  ClipboardList,
  GraduationCap,
  Hash,
  Hourglass,
  Loader2,
  Mail,
  ScrollText,
  UserRound,
  X,
} from 'lucide-react';
import { fetchAdvisingStudent } from '../lib/advisingStudentsService';
import { ApiError } from '../lib/api';
import { formatDate, formatRelative } from '../lib/studentsService';
import type { AdvisingStudentRow } from '../lib/types';
import StudentScheduleHistorySection from './StudentScheduleHistorySection';
import AdvisingOverviewPanel from './AdvisingOverviewPanel';
import AlertBanner from './ui/AlertBanner';
import Badge, { type BadgeTone } from './ui/Badge';
import CustomButton from './ui/CustomButton';
import StatusPill from './ui/StatusPill';

interface AdvisingStudentDetailDrawerProps {
  studentId: string | null;
  onClose: () => void;
}

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

const DetailRow: React.FC<DetailRowProps> = ({ icon, label, children }) => (
  <div className="flex items-start gap-3 py-2.5">
    <span className="mt-0.5 shrink-0 text-slate-500" aria-hidden>
      {icon}
    </span>
    <div className="min-w-0 flex-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-200">{children}</dd>
    </div>
  </div>
);

const STANDING_TONE: Record<string, BadgeTone> = {
  'Good Standing': 'emerald',
  Probation: 'amber',
  Dismissed: 'rose',
};

/**
 * Req 53: an Advisor opens the advising details of a student picked out of the
 * search or filter results.
 *
 * Rendered as a panel over the list rather than as a route, so closing it puts
 * the Advisor back on the same results, with the same filters, where they
 * were — the list is never unmounted, which is the reversible-navigation
 * requirement.
 *
 * Only information the remaining requirements open to an Advisor is shown:
 * the profile fields from req 4, the advising reason, schedule status and
 * blocking step from req 59, and doors into the academic history (req 54) and
 * the weekly schedule (req 31).
 */
const AdvisingStudentDetailDrawer: React.FC<AdvisingStudentDetailDrawerProps> = ({ studentId, onClose }) => {
  const [student, setStudent] = useState<AdvisingStudentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const reloadStudent = () => {
    if (!studentId) return;
    fetchAdvisingStudent(studentId)
      .then((response) => setStudent(response.student))
      .catch((err: ApiError) => setError(err.message));
  };

  useEffect(() => {
    if (!studentId) return;

    let cancelled = false;
    setStudent(null);
    setError(null);
    setIsLoading(true);

    fetchAdvisingStudent(studentId)
      .then((response) => {
        if (!cancelled) setStudent(response.student);
      })
      .catch((err: ApiError) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // Escape closes the panel, matching the close button.
  useEffect(() => {
    if (!studentId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [studentId, onClose]);

  if (!studentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Advising details"
        className="relative flex h-full w-full max-w-lg flex-col border-l border-slate-800 bg-slate-950/95 backdrop-blur-xl shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Advising details</p>
            <h2 className="mt-1 truncate text-lg font-bold text-white">{student?.fullName ?? 'Loading...'}</h2>
            {student && <p className="mt-0.5 truncate font-mono text-xs text-slate-500">{student.studentId}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close advising details"
            className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {error && <AlertBanner tone="error" title="Could not open advising details">{error}</AlertBanner>}

          {isLoading && !student && !error && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading advising details...
            </div>
          )}

          {student && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill state={student.isActive ? 'active' : 'inactive'} workflowStatus={student.workflowStatus} />
                <Badge tone={STANDING_TONE[student.academicStanding] ?? 'neutral'}>
                  {student.academicStanding}
                </Badge>
                {student.isMine && <Badge tone="indigo">Your student</Badge>}
              </div>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Student</h3>
                <dl className="divide-y divide-slate-800/70">
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
                        <span className="block text-slate-200">{student.assignedAdvisor.fullName}</span>
                        <span className="block text-xs text-slate-500">{student.assignedAdvisor.email}</span>
                      </>
                    ) : (
                      <span className="text-slate-500">Not assigned</span>
                    )}
                  </DetailRow>
                </dl>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Advising</h3>
                <dl className="divide-y divide-slate-800/70">
                  <DetailRow icon={<ClipboardList className="h-4 w-4" />} label="Advising reason">
                    {student.advisingReason ?? <span className="text-slate-500">Not recorded</span>}
                  </DetailRow>
                  <DetailRow icon={<BadgeCheck className="h-4 w-4" />} label="Schedule status">
                    <Badge tone="indigo" dot>
                      {student.workflowStatus}
                    </Badge>
                  </DetailRow>
                  <DetailRow icon={<Hourglass className="h-4 w-4" />} label="Pending request">
                    {student.pendingRequest === 'None' ? (
                      <span className="text-slate-500">None</span>
                    ) : (
                      <Badge tone="amber">{student.pendingRequest}</Badge>
                    )}
                  </DetailRow>
                  <DetailRow icon={<CircleAlert className="h-4 w-4" />} label="Blocking step">
                    {student.blockingStep ?? <span className="text-slate-500">None</span>}
                  </DetailRow>
                  <DetailRow icon={<Hash className="h-4 w-4" />} label="Last update">
                    {formatRelative(student.lastUpdateAt)}{' '}
                    <span className="text-xs text-slate-500">({formatDate(student.lastUpdateAt)})</span>
                  </DetailRow>
                </dl>
              </section>

              {/* Req 123: Schedule processing and reopening history */}
              <StudentScheduleHistorySection
                studentObjectId={student.id}
                workflowStatus={student.workflowStatus}
                role="Advisor"
                onWorkflowChanged={reloadStudent}
              />
              {/* Req 59: system-calculated allowance and bachelor-project eligibility. */}
              <AdvisingOverviewPanel studentId={student.id} showReason={false} />
            </>
          )}
        </div>

        {student && (
          <div className="border-t border-slate-800 p-6">
            {/* Req 54: academic history, open to Advisors for any advising student. */}
            <CustomButton
              variant="secondary"
              fullWidth
              onClick={() => navigate(`/academic-history/${student.id}`)}
              icon={<ScrollText className="h-4 w-4" aria-hidden />}
            >
              View academic history
            </CustomButton>
            {/* Req 31: the draft, review-ready or processed weekly schedule. */}
            <CustomButton
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => navigate(`/graduation-plans?studentId=${student.id}`)}
              icon={<GraduationCap className="h-4 w-4" aria-hidden />}
              className="mt-2"
            >
              Graduation plan
            </CustomButton>
            <CustomButton
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => navigate(`/advising-schedules/${student.id}/draft`)}
              icon={<CalendarDays className="h-4 w-4" aria-hidden />}
              className="mt-2"
            >
              Create or edit draft schedule
            </CustomButton>
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
            <CustomButton variant="ghost" size="sm" fullWidth onClick={onClose} className="mt-2">
              Back to results
            </CustomButton>
          </div>
        )}
      </aside>
    </div>
  );
};

export default AdvisingStudentDetailDrawer;
