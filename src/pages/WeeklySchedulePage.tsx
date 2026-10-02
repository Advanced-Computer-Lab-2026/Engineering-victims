import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, Coffee, Eye, Loader2, MapPin, RotateCcw, UserRound } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import { useSession } from '../hooks/useSession';
import { ApiError } from '../lib/api';
import { fetchMySchedule, fetchStudentSchedule } from '../lib/weeklyScheduleService';
import type { ScheduleSession, ScheduleStage, WeeklyScheduleResponse } from '../lib/types';

/** Lecture, tutorial and lab read apart at a glance, in the grid and the list. */
const TYPE_STYLE: Record<ScheduleSession['slotType'], { tone: BadgeTone; card: string }> = {
  Lecture: { tone: 'indigo', card: 'border-indigo-500/40 bg-indigo-500/10' },
  Tutorial: { tone: 'sky', card: 'border-sky-500/40 bg-sky-500/10' },
  Lab: { tone: 'emerald', card: 'border-emerald-500/40 bg-emerald-500/10' },
};

const STAGE_INFO: Record<ScheduleStage, { tone: BadgeTone; label: string; staffNote: string }> = {
  Draft: {
    tone: 'amber',
    label: 'Incomplete draft',
    staffNote: 'The Advisor is still building this draft, so the student cannot see it yet.',
  },
  'Review-ready': {
    tone: 'sky',
    label: 'Completed draft',
    staffNote: 'This draft is complete and visible to the student.',
  },
  Processed: { tone: 'emerald', label: 'Processed', staffNote: 'This is the final processed schedule.' },
};

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Req 31: a student's current weekly schedule as a weekly calendar.
 *
 * /schedule is the signed-in student's own schedule (the API reads it from the
 * token and applies the visibility rules); /schedule/:studentId is the
 * read-only staff view of a student's schedule.
 */
const WeeklySchedulePage: React.FC = () => {
  const { studentId } = useParams<{ studentId?: string }>();
  const { user } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState<WeeklyScheduleResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isOwn = !studentId;

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);
      try {
        setData(studentId ? await fetchStudentSchedule(studentId) : await fetchMySchedule());
      } catch (err) {
        setError(err as ApiError);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [studentId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Every distinct time block in this schedule becomes a calendar row.
  const timeBlocks = useMemo(() => {
    const blocks = new Map<string, { start: string; end: string }>();
    (data?.sessions ?? []).forEach((session) =>
      blocks.set(`${session.startTime}-${session.endTime}`, { start: session.startTime, end: session.endTime })
    );
    return [...blocks.values()].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  }, [data]);

  const backTo = user?.role === 'Advisor' ? '/advising-students' : '/students';
  const student = data?.student;
  const stage = data?.stage ? STAGE_INFO[data.stage] : null;

  return (
    <>
      <PageHeader
        title={isOwn ? 'My Schedule' : student ? `${student.fullName}'s Schedule` : 'Weekly Schedule'}
        description={
          data?.term
            ? `Weekly schedule for ${data.term.label}: lectures, tutorials and labs with their times and rooms.`
            : 'Lectures, tutorials and labs with their times and rooms.'
        }
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <div className="flex gap-2">
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
              onClick={() => load(true)}
              isLoading={isRefreshing}
              icon={<RotateCcw className="h-4 w-4" aria-hidden />}
            >
              Refresh
            </CustomButton>
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <AlertBanner
            tone={error.status === 403 ? 'info' : 'error'}
            title={error.status === 403 ? 'This schedule is not available to you' : 'Could not load the schedule'}
          >
            {error.message}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading schedule...
        </Card>
      ) : data && student ? (
        <div className="space-y-6">
          <Card tone="raised" className="p-5" sheen>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-white">{student.fullName}</h2>
                <p className="font-mono text-xs text-slate-500">
                  {student.studentId} · {student.major} · Semester {student.currentSemester}
                  {student.studyGroup ? ` · Group ${student.studyGroup}` : ''}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Badge tone={student.studentType === 'Advising Student' ? 'indigo' : 'sky'}>{student.studentType}</Badge>
                {data.term && <Badge tone="neutral">{data.term.label}</Badge>}
                {stage && (
                  <Badge tone={stage.tone} dot>
                    {stage.label}
                  </Badge>
                )}
              </div>
            </div>
            {!isOwn && stage && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                <Eye className="h-3.5 w-3.5" aria-hidden />
                {stage.staffNote} Read-only view.
              </p>
            )}
          </Card>

          {!data.visible ? (
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title={isOwn ? 'Your schedule is not available yet' : 'No schedule to show'}
              description={data.hiddenReason ?? undefined}
            />
          ) : data.sessions.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title="No sessions this term"
              description="The schedule has no lectures, tutorials or labs registered for this term."
            />
          ) : (
            <>
              <Card tone="raised" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[56rem] table-fixed border-collapse text-left text-sm">
                    <caption className="sr-only">Weekly calendar for {data.term?.label}</caption>
                    <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th scope="col" className="w-28 px-3 py-3 font-semibold">
                          Time
                        </th>
                        {data.days.map((day) => {
                          const isOff = data.daysOff.includes(day);
                          return (
                            <th key={day} scope="col" className="px-2 py-3 font-semibold">
                              <span className="block">{day}</span>
                              {isOff && (
                                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] normal-case text-amber-300">
                                  <Coffee className="h-3 w-3" aria-hidden />
                                  Day off
                                </span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {timeBlocks.map((block) => (
                        <tr key={block.start + block.end} className="align-top">
                          <th scope="row" className="whitespace-nowrap px-3 py-3 font-mono text-xs font-medium text-slate-400">
                            {block.start}
                            <span className="block text-slate-600">{block.end}</span>
                          </th>
                          {data.days.map((day) => {
                            const here = data.sessions.filter(
                              (session) =>
                                session.dayOfWeek === day &&
                                session.startTime === block.start &&
                                session.endTime === block.end
                            );
                            return (
                              <td
                                key={day}
                                className={`px-1.5 py-1.5 ${data.daysOff.includes(day) ? 'bg-slate-950/40' : ''}`}
                              >
                                {here.map((session) => (
                                  <SessionCard key={session.id} session={session} />
                                ))}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {data.daysOff.length > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-slate-400">
                  <Coffee className="h-4 w-4 text-amber-400" aria-hidden />
                  Days off: <span className="font-medium text-slate-200">{data.daysOff.join(', ')}</span>
                </p>
              )}

              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">All sessions</h2>
                <Card tone="raised" className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[48rem] text-left text-sm">
                      <caption className="sr-only">Every session in this schedule</caption>
                      <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                          <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Day</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Time</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Room</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Instructor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {data.sessions.map((session) => (
                          <tr key={session.id} className="hover:bg-slate-800/40">
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-slate-300">{session.courseCode}</span>
                              <span className="block text-slate-200">{session.courseName}</span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge tone={TYPE_STYLE[session.slotType].tone}>
                                {session.slotType} · G{session.groupNumber}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-slate-300">{session.dayOfWeek}</td>
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">
                              {session.startTime}–{session.endTime}
                            </td>
                            <td className="px-4 py-3 text-slate-300">{session.room}</td>
                            <td className="px-4 py-3 text-slate-400">{session.instructor ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </section>
            </>
          )}
        </div>
      ) : null}
    </>
  );
};

const SessionCard: React.FC<{ session: ScheduleSession }> = ({ session }) => (
  <div className={`mb-1 rounded-lg border p-2 last:mb-0 ${TYPE_STYLE[session.slotType].card}`}>
    <p className="flex items-center justify-between gap-1">
      <span className="whitespace-nowrap font-mono text-xs font-semibold text-white">{session.courseCode}</span>
      <span className="truncate text-[10px] uppercase tracking-wide text-slate-400">{session.slotType}</span>
    </p>
    <p className="mt-0.5 truncate text-xs text-slate-300" title={session.courseName}>
      {session.courseName}
    </p>
    <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
      {session.room} · G{session.groupNumber}
    </p>
    <p className="flex items-center gap-1 text-[11px] text-slate-400">
      <Clock className="h-3 w-3 shrink-0" aria-hidden />
      {session.startTime}–{session.endTime}
    </p>
    {session.instructor && (
      <p className="flex items-center gap-1 truncate text-[11px] text-slate-500">
        <UserRound className="h-3 w-3 shrink-0" aria-hidden />
        {session.instructor}
      </p>
    )}
  </div>
);

export default WeeklySchedulePage;
