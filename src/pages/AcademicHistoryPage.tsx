import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookCheck,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  GraduationCap,
  ListTodo,
  Loader2,
  ShieldAlert,
  Sigma,
  UserRound,
} from 'lucide-react';
import MandatoryRemovalRequestDialog from '../components/MandatoryRemovalRequestDialog';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import { useSession } from '../hooks/useSession';
import { ApiError } from '../lib/api';
import {
  downloadAcademicHistoryPdf,
  fetchMandatoryCandidates,
  fetchMyAcademicHistory,
  fetchStudentAcademicHistory,
} from '../lib/academicHistoryService';
import { fetchStudentRemovalRequests } from '../lib/mandatoryRemovalService';
import type {
  AcademicHistoryResponse,
  CompletedCourse,
  MandatoryCandidate,
  MandatoryCandidatesResponse,
  MandatoryRemovalRequestSummary,
  RemainingCourse,
  StudentRemovalRequestsResponse,
} from '../lib/types';

/** GUC scale: 0.7 is the best grade, 5.0 a fail, so the tone follows the letter. */
const gradeTone = (grade: string): BadgeTone => {
  if (grade === 'F') return 'rose';
  if (grade.startsWith('A')) return 'emerald';
  if (grade.startsWith('B')) return 'sky';
  if (grade.startsWith('C')) return 'amber';
  return 'rose';
};

const STANDING_TONE: Record<string, BadgeTone> = {
  'Good Standing': 'emerald',
  Probation: 'amber',
  Dismissed: 'rose',
};

/** "2025/2026 Spring" sorts after "2025/2026 Winter" within the same year. */
const termOrder = (term: string): number => {
  const [years, season] = term.split(' ');
  return Number(years.split('/')[0]) * 10 + (season === 'Spring' ? 5 : season === 'Summer' ? 7 : 0);
};

/**
 * Req 54: a student's academic history, in three parts: completed courses with
 * grades, current courses and remaining courses.
 *
 * One page serves two routes. /academic-history is the signed-in Advising
 * Student's own record (the API reads it from the token), and
 * /academic-history/:studentId is how an Advisor or Coordinator opens any
 * Advising Student's record.
 */
const AcademicHistoryPage: React.FC = () => {
  const { studentId } = useParams<{ studentId?: string }>();
  const { user } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState<AcademicHistoryResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<ApiError | null>(null);
  const [candidates, setCandidates] = useState<MandatoryCandidatesResponse['candidates'] | null>(null);
  const [candidatesError, setCandidatesError] = useState<ApiError | null>(null);
  // Req 64: the removal requests behind the mandatory list, and the form state.
  const [removals, setRemovals] = useState<StudentRemovalRequestsResponse | null>(null);
  const [removalTarget, setRemovalTarget] = useState<MandatoryCandidate | null>(null);
  const [removalNotice, setRemovalNotice] = useState<string | null>(null);

  const isOwn = !studentId;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(studentId ? await fetchStudentAcademicHistory(studentId) : await fetchMyAcademicHistory());
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Req 61: staff only. Loaded on its own so a failure here never hides the
  // history itself, and never requested on a student's own page.
  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setCandidates(null);
    setCandidatesError(null);
    fetchMandatoryCandidates(studentId)
      .then((response) => !cancelled && setCandidates(response.candidates))
      .catch((err) => !cancelled && setCandidatesError(err as ApiError));
    // Req 64: optional context. If it fails the list still shows, just
    // without request statuses or the request button.
    setRemovals(null);
    setRemovalNotice(null);
    fetchStudentRemovalRequests(studentId)
      .then((response) => !cancelled && setRemovals(response))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // An in-app way back to the list the staff member came from, so they never
  // depend on the browser's back button.
  const backTo = user?.role === 'Advisor' ? '/advising-students' : '/students';

  const completedByTerm = useMemo(() => {
    const groups = new Map<string, CompletedCourse[]>();
    (data?.completed ?? []).forEach((row) => {
      groups.set(row.term, [...(groups.get(row.term) ?? []), row]);
    });
    return [...groups.entries()].sort(([a], [b]) => termOrder(b) - termOrder(a));
  }, [data]);

  const student = data?.student;

  // Req 64: the newest request per course; the API returns newest first.
  const latestRemoval = useMemo(() => {
    const byCourse = new Map<string, MandatoryRemovalRequestSummary>();
    (removals?.requests ?? []).forEach((request) => {
      if (request.course && !byCourse.has(request.course.id)) byCourse.set(request.course.id, request);
    });
    return byCourse;
  }, [removals]);

  const handleRemovalSubmitted = (request: MandatoryRemovalRequestSummary, message: string) => {
    setRemovals((current) => (current ? { ...current, requests: [request, ...current.requests] } : current));
    setRemovalTarget(null);
    setRemovalNotice(message);
  };

  // Req 56: the displayed history as a PDF, under the same access rules.
  const handleDownload = async () => {
    if (!student) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadAcademicHistoryPdf(`academic-history-${student.studentId}.pdf`, studentId);
    } catch (err) {
      setDownloadError(err as ApiError);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <PageHeader
        title={isOwn ? 'My Academic History' : student ? `${student.fullName}'s Academic History` : 'Academic History'}
        description="Completed courses with grades, current courses and the courses still remaining."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          (!isOwn || student) && (
            <div className="flex flex-wrap gap-2">
              {!isOwn && (
                <CustomButton
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(backTo)}
                  icon={<ArrowLeft className="h-4 w-4" aria-hidden />}
                >
                  Back to students
                </CustomButton>
              )}
              {/* Req 55: the same student's transcript, year by year. */}
              {student && (
                <CustomButton
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(studentId ? `/transcript/${studentId}` : '/transcript')}
                  icon={<FileText className="h-4 w-4" aria-hidden />}
                >
                  View transcript
                </CustomButton>
              )}
              {student && (
                <CustomButton
                  size="sm"
                  onClick={handleDownload}
                  isLoading={isDownloading}
                  icon={<Download className="h-4 w-4" aria-hidden />}
                >
                  Download PDF
                </CustomButton>
              )}
            </div>
          )
        }
      />

      {error && (
        <div className="mb-4">
          <AlertBanner
            tone={error.status === 403 ? 'info' : 'error'}
            title={error.status === 403 ? 'No academic history on this account' : 'Could not load the academic history'}
          >
            {error.message}
          </AlertBanner>
        </div>
      )}

      {downloadError && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not download the PDF" onDismiss={() => setDownloadError(null)}>
            {downloadError.message}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading academic history...
        </Card>
      ) : data && student ? (
        <div className="space-y-6">
          <Card tone="raised" className="p-6" sheen>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-white">{student.fullName}</h2>
                <p className="font-mono text-xs text-slate-500">
                  {student.studentId} · {student.email}
                </p>
              </div>
              <Badge tone={STANDING_TONE[student.academicStanding] ?? 'neutral'} className="ml-auto">
                {student.academicStanding}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Fact icon={<UserRound className="h-4 w-4" />} label="Advisor">
                {student.assignedAdvisor ? student.assignedAdvisor.fullName : <span className="text-slate-500">Not assigned</span>}
              </Fact>
              <Fact icon={<GraduationCap className="h-4 w-4" />} label="Major">
                {student.major}
              </Fact>
              <Fact icon={<Sigma className="h-4 w-4" />} label="GPA">
                {data.summary.gpa !== null ? data.summary.gpa.toFixed(2) : <span className="text-slate-500">No grades yet</span>}
              </Fact>
              <Fact icon={<BookCheck className="h-4 w-4" />} label="Completed hours">
                {data.summary.completedHours}
              </Fact>
              <Fact icon={<CalendarDays className="h-4 w-4" />} label="Current semester">
                Semester {student.currentSemester}
              </Fact>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              GPA uses the GUC scale, where 0.7 is the best grade and 5.0 is a fail.
            </p>
          </Card>

          {!isOwn && (
            <Section
              icon={<ShieldAlert className="h-4 w-4 text-rose-400" aria-hidden />}
              title="Mandatory-course candidates"
              count={candidates?.length ?? 0}
              note="Failed and unattended courses are mandatory unless an approved removal applies"
            >
              {candidatesError ? (
                <AlertBanner tone="error" title="Could not load the mandatory-course candidates">
                  {candidatesError.message}
                </AlertBanner>
              ) : !candidates ? (
                <Card className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading mandatory-course candidates...
                </Card>
              ) : candidates.length === 0 ? (
                <EmptyState
                  icon={<ShieldAlert className="h-5 w-5" />}
                  title="No mandatory-course candidates"
                  description="This student has no failed or unattended courses."
                />
              ) : (
                <>
                {removalNotice && (
                  <div className="mb-3">
                    <AlertBanner tone="success" title="Removal request sent" onDismiss={() => setRemovalNotice(null)}>
                      {removalNotice}
                    </AlertBanner>
                  </div>
                )}
                <Card tone="raised" className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[48rem] text-left text-sm">
                      <caption className="sr-only">Failed and unattended courses that are mandatory-course candidates</caption>
                      <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                          <th scope="col" className="px-4 py-3 font-semibold">Code</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Reason</th>
                          <th scope="col" className="px-4 py-3 font-semibold">When</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                          <th scope="col" className="px-4 py-3 text-right font-semibold">Removal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {candidates.map((candidate) => (
                          <CandidateRow
                            key={candidate.course.id}
                            candidate={candidate}
                            removal={latestRemoval.get(candidate.course.id)}
                            onRequestRemoval={removals?.canRequest ? () => setRemovalTarget(candidate) : undefined}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                {removals && !removals.canRequest && user?.role === 'Advisor' && (
                  <p className="mt-2 text-xs text-slate-500">
                    Only this student's assigned Advisor can request a mandatory-course removal.
                  </p>
                )}
                </>
              )}
            </Section>
          )}

          <Section
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />}
            title="Completed courses"
            count={data.completed.length}
          >
            {completedByTerm.length === 0 ? (
              <EmptyState
                icon={<BookCheck className="h-5 w-5" />}
                title="No completed courses yet"
                description="Graded courses appear here once the student finishes their first term."
              />
            ) : (
              <div className="space-y-4">
                {completedByTerm.map(([term, rows]) => (
                  <Card key={term} tone="raised" className="overflow-hidden">
                    <p className="border-b border-slate-800 bg-slate-900/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {term} · Semester {rows[0].semester}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[36rem] text-left text-sm">
                        <caption className="sr-only">Completed courses in {term}</caption>
                        <thead className="text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th scope="col" className="px-4 py-2 font-semibold">Code</th>
                            <th scope="col" className="px-4 py-2 font-semibold">Course</th>
                            <th scope="col" className="px-4 py-2 text-right font-semibold">Credit hrs</th>
                            <th scope="col" className="px-4 py-2 text-right font-semibold">Grade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {rows.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-800/40">
                              <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-slate-300">{row.course.code}</td>
                              <td className="px-4 py-2 text-slate-200">{row.course.name}</td>
                              <td className="px-4 py-2 text-right text-slate-300">{row.course.creditHours}</td>
                              <td className="px-4 py-2 text-right">
                                <Badge tone={gradeTone(row.grade)}>
                                  {row.grade} · {row.gradePoints.toFixed(1)}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Section>

          <Section
            icon={<Clock className="h-4 w-4 text-sky-400" aria-hidden />}
            title="Current courses"
            count={data.current.length}
            note={data.current[0] ? `${data.current[0].term} · ${data.summary.currentHours} credit hours` : undefined}
          >
            {data.current.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-5 w-5" />}
                title="No courses in progress"
                description={
                  student.currentSemester === 8
                    ? 'Semester 8 is the bachelor project, so there are no regular courses this term.'
                    : 'No courses are registered for the current term.'
                }
              />
            ) : (
              <Card tone="raised" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <caption className="sr-only">Courses in progress this term</caption>
                    <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">Code</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">Credit hrs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {data.current.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-800/40">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">{row.course.code}</td>
                          <td className="px-4 py-3 text-slate-200">{row.course.name}</td>
                          <td className="px-4 py-3 text-right text-slate-300">{row.course.creditHours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </Section>

          <Section
            icon={<ListTodo className="h-4 w-4 text-amber-400" aria-hidden />}
            title="Remaining courses"
            count={data.remaining.length}
            note={`${data.summary.remainingHours} credit hours · electives are chosen later and not listed`}
          >
            {data.remaining.length === 0 ? (
              <EmptyState
                icon={<ListTodo className="h-5 w-5" />}
                title="Nothing remaining"
                description="Every required course of this major is completed or in progress."
              />
            ) : (
              <Card tone="raised" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[52rem] text-left text-sm">
                    <caption className="sr-only">Remaining courses with credit hours, prerequisites and offering season</caption>
                    <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">Code</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">Credit hrs</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Prerequisites</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Offered in</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">Sem.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {data.remaining.map((course) => (
                        <RemainingRow key={course.id} course={course} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </Section>
        </div>
      ) : null}

      {/* Req 64: the assigned Advisor's removal request form. */}
      {studentId && removalTarget && candidates && removals && (
        <MandatoryRemovalRequestDialog
          studentId={studentId}
          candidate={removalTarget}
          candidates={candidates}
          categories={removals.categories}
          onCancel={() => setRemovalTarget(null)}
          onSubmitted={handleRemovalSubmitted}
        />
      )}
    </>
  );
};

const Fact: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3">
    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
      <span aria-hidden>{icon}</span>
      {label}
    </p>
    <p className="mt-1 text-sm font-medium text-white">{children}</p>
  </div>
);

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  count: number;
  note?: string;
  children: React.ReactNode;
}> = ({ icon, title, count, note, children }) => (
  <section>
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
        {icon}
        {title}
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">{count}</span>
      </h2>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
    {children}
  </section>
);

interface CandidateRowProps {
  candidate: MandatoryCandidate;
  /** Req 64: the newest removal request for this course, if any. */
  removal?: MandatoryRemovalRequestSummary;
  /** Present only for the student's assigned Advisor. */
  onRequestRemoval?: () => void;
}

const CandidateRow: React.FC<CandidateRowProps> = ({ candidate, removal, onRequestRemoval }) => (
  <tr className="hover:bg-slate-800/40">
    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">{candidate.course.code}</td>
    <td className="px-4 py-3 text-slate-200">
      <span className="flex flex-wrap items-center gap-2">
        {candidate.course.name}
        {candidate.inProgress && <Badge tone="sky">Retaking now</Badge>}
      </span>
    </td>
    <td className="px-4 py-3">
      <Badge tone={candidate.reason === 'Failed' ? 'rose' : 'amber'}>{candidate.reason}</Badge>
    </td>
    <td className="px-4 py-3 text-slate-400">
      {candidate.term ? `${candidate.term} · Semester ${candidate.semester}` : `Semester ${candidate.semester} · not taken`}
    </td>
    <td className="px-4 py-3">
      <Badge tone="rose" dot>
        Mandatory
      </Badge>
    </td>
    <td className="px-4 py-3 text-right">
      <span className="flex flex-wrap items-center justify-end gap-2">
        {removal?.status === 'Pending' && <Badge tone="amber">Removal pending</Badge>}
        {removal?.status === 'Rejected' && (
          <span title={removal.responseNote || undefined}>
            <Badge tone="neutral">Removal rejected</Badge>
          </span>
        )}
        {onRequestRemoval && removal?.status !== 'Pending' && (
          <CustomButton variant="secondary" size="sm" onClick={onRequestRemoval}>
            Request removal
          </CustomButton>
        )}
        {!removal && !onRequestRemoval && <span className="text-xs text-slate-600">None</span>}
      </span>
    </td>
  </tr>
);

const RemainingRow: React.FC<{ course: RemainingCourse }> = ({ course }) => (
  <tr className="hover:bg-slate-800/40">
    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">{course.code}</td>
    <td className="px-4 py-3 text-slate-200">
      <span className="flex flex-wrap items-center gap-2">
        {course.name}
        {course.isRetake && <Badge tone="rose">Retake</Badge>}
        {course.courseType === 'Huma' && <Badge tone="neutral">Huma</Badge>}
      </span>
    </td>
    <td className="px-4 py-3 text-right text-slate-300">{course.creditHours}</td>
    <td className="px-4 py-3">
      {course.prerequisites.length === 0 ? (
        <span className="text-xs text-slate-600">None</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {course.prerequisites.map((prerequisite) => (
            <Badge
              key={prerequisite.id}
              tone={prerequisite.passed ? 'emerald' : 'neutral'}
              className="font-mono"
            >
              <span title={`${prerequisite.name}${prerequisite.passed ? ' (passed)' : ' (not passed yet)'}`}>
                {prerequisite.code}
              </span>
            </Badge>
          ))}
        </span>
      )}
    </td>
    <td className="px-4 py-3 text-slate-300">{course.offeringSeasons.join(', ')}</td>
    <td className="px-4 py-3 text-right text-slate-400">{course.recommendedSemester}</td>
  </tr>
);

export default AcademicHistoryPage;
