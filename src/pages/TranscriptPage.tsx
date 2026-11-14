import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Loader2, ScrollText } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';
import { useSession } from '../hooks/useSession';
import { ApiError } from '../lib/api';
import { fetchMyTranscript, fetchStudentTranscript } from '../lib/academicHistoryService';
import type { TranscriptResponse, TranscriptSession } from '../lib/types';

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

/**
 * Req 55: one attended academic year of a student's transcript, session by
 * session (Winter, Spring, Summer, First Makeup, Second Makeup). The API leaves
 * out sessions with no records and puts them in that order.
 *
 * Like the req 54 history page, one page serves two routes: /transcript is the
 * signed-in Advising Student's own (resolved from the token), and
 * /transcript/:studentId is how an Advisor or Coordinator opens any Advising
 * Student's. The year lives in ?year= so a refresh or shared link keeps it.
 */
const TranscriptPage: React.FC = () => {
  const { studentId } = useParams<{ studentId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const year = searchParams.get('year') ?? undefined;
  const { user } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState<TranscriptResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isOwn = !studentId;

  useEffect(() => {
    // Switching years quickly must not let an older answer overwrite a newer one.
    let isCurrent = true;
    setIsLoading(true);
    setError(null);
    (studentId ? fetchStudentTranscript(studentId, year) : fetchMyTranscript(year))
      .then((response) => {
        if (isCurrent) setData(response);
      })
      .catch((err) => {
        if (!isCurrent) return;
        setData(null);
        setError(err as ApiError);
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [studentId, year]);

  const historyPath = studentId ? `/academic-history/${studentId}` : '/academic-history';
  const backTo = user?.role === 'Advisor' ? '/advising-students' : '/students';
  const student = data?.student;

  return (
    <>
      <PageHeader
        title={isOwn ? 'My Transcript' : student ? `${student.fullName}'s Transcript` : 'Transcript'}
        description="Pick an attended academic year to see its Winter, Spring, Summer and makeup results."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
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
            <CustomButton
              variant="secondary"
              size="sm"
              onClick={() => navigate(historyPath)}
              icon={<ScrollText className="h-4 w-4" aria-hidden />}
            >
              Academic history
            </CustomButton>
          </div>
        }
      />

      {error && (
        <div className="mb-4 space-y-3">
          <AlertBanner
            tone={error.status === 403 ? 'info' : 'error'}
            title={error.status === 403 ? 'No transcript on this account' : 'Could not load the transcript'}
          >
            {error.message}
          </AlertBanner>
          {/* A stale or hand-typed ?year= should not strand the user. */}
          {year && (error.status === 400 || error.status === 404) && (
            <CustomButton variant="secondary" size="sm" onClick={() => setSearchParams({})}>
              Show the latest attended year
            </CustomButton>
          )}
        </div>
      )}

      {isLoading && !data ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading transcript...
        </Card>
      ) : data && student ? (
        <div className="space-y-6">
          <Card tone="raised" className="p-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-h3 font-bold text-on-surface">{student.fullName}</h2>
                <p className="font-mono text-caption text-on-surface-variant">
                  {student.studentId} · {student.major}
                </p>
              </div>
              <Badge tone={STANDING_TONE[student.academicStanding] ?? 'neutral'}>{student.academicStanding}</Badge>
              {data.years.length > 0 && (
                <Select
                  label="Academic year"
                  className="ml-auto w-full md:w-56"
                  value={data.academicYear ?? ''}
                  disabled={isLoading}
                  onChange={(event) => setSearchParams({ year: event.target.value })}
                  options={data.years.map((value) => ({ value, label: value }))}
                />
              )}
            </div>
          </Card>

          {data.sessions.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title="No attended academic years yet"
              description="The transcript fills in once the student has courses on record."
            />
          ) : (
            <div className={`space-y-4 transition-opacity ${isLoading ? 'opacity-60' : ''}`} aria-busy={isLoading}>
              {data.sessions.map((session) => (
                <SessionCard key={session.term} session={session} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
};

const SessionCard: React.FC<{ session: TranscriptSession }> = ({ session }) => {
  const hours = session.courses.reduce((sum, row) => sum + row.course.creditHours, 0);

  return (
    <Card tone="raised" className="overflow-hidden">
      <p className="border-b border-outline-variant bg-surface-container-low px-4 py-2 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
        {session.term} · {session.courses.length} {session.courses.length === 1 ? 'course' : 'courses'} · {hours} credit hours
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-body">
          <caption className="sr-only">Results for {session.term}</caption>
          <thead className="text-caption uppercase tracking-eyebrow text-on-surface-variant">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Code</th>
              <th scope="col" className="px-4 py-2 font-semibold">Course</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">Credit hrs</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {session.courses.map((row) => (
              <tr key={row.id} className="hover:bg-surface-container">
                <td className="whitespace-nowrap px-4 py-2 font-mono text-caption text-on-surface">{row.course.code}</td>
                <td className="px-4 py-2 text-on-surface">{row.course.name}</td>
                <td className="px-4 py-2 text-right text-on-surface">{row.course.creditHours}</td>
                <td className="px-4 py-2 text-right">
                  {row.grade !== null && row.gradePoints !== null ? (
                    <Badge tone={gradeTone(row.grade)}>
                      {row.grade} · {row.gradePoints.toFixed(1)}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">In progress</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default TranscriptPage;
