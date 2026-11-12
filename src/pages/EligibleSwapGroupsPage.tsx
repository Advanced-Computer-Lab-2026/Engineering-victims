import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCcw, Calendar, BookOpen, Users, ArrowRightLeft, Eye, Clock, MapPin, UserRound, Coffee } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { fetchSwapGroupSchedule } from '../lib/weeklyScheduleService';
import type { EligibleSwapGroupsResponse, ScheduleSession, SwapGroupScheduleResponse } from '../lib/types';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import CustomButton from '../components/ui/CustomButton';
import AlertBanner from '../components/ui/AlertBanner';
import EmptyState from '../components/ui/EmptyState';

/** Lecture, tutorial and lab read apart at a glance, matching Req 31's grid. */
const TYPE_STYLE: Record<ScheduleSession['slotType'], { tone: BadgeTone; card: string }> = {
  Lecture: { tone: 'indigo', card: 'border-indigo-500/40 bg-indigo-500/10' },
  Tutorial: { tone: 'sky', card: 'border-sky-500/40 bg-sky-500/10' },
  Lab: { tone: 'emerald', card: 'border-emerald-500/40 bg-emerald-500/10' },
};

/**
 * Req 34: Normal Student views eligible destination group numbers and their
 * complete weekly schedules for a whole-schedule swap. Shows only groups with
 * the exact same course-code set in the same term.
 */
const EligibleSwapGroupsPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<EligibleSwapGroupsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupSchedule, setGroupSchedule] = useState<SwapGroupScheduleResponse | null>(null);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<ApiError | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch<EligibleSwapGroupsResponse>('/api/students/eligible-swap-groups');
      setData(response);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Opens the destination group's complete week. The API re-checks eligibility
   * against this student's own course set, so a group that is no longer a valid
   * destination comes back as an error banner instead of a schedule.
   */
  const viewGroupSchedule = async (groupNumber: string) => {
    if (selectedGroup === groupNumber && groupSchedule) return;

    setSelectedGroup(groupNumber);
    setIsLoadingSchedule(true);
    setScheduleError(null);
    setGroupSchedule(null);

    try {
      setGroupSchedule(await fetchSwapGroupSchedule(groupNumber));
    } catch (err) {
      setScheduleError(err as ApiError);
    } finally {
      setIsLoadingSchedule(false);
    }
  };

  const closeSchedule = () => {
    setSelectedGroup(null);
    setGroupSchedule(null);
    setScheduleError(null);
  };

  return (
    <>
      <PageHeader
        title="Eligible Swap Groups"
        description="View other study groups with the exact same course set that you can swap your schedule with."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <CustomButton
              variant="primary"
              size="sm"
              onClick={() => navigate('/swaps')}
              icon={<ArrowRightLeft className="h-4 w-4" />}
            >
              Manage Swap Requests
            </CustomButton>
            <CustomButton
              variant="secondary"
              size="sm"
              onClick={() => load(true)}
              isLoading={isRefreshing}
              icon={<RefreshCcw className="h-4 w-4" />}
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
            title={error.status === 403 ? 'Not available' : 'Could not load eligible groups'}
          >
            {error.message}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading eligible swap groups...
        </Card>
      ) : data ? (
        <div className="space-y-6">
          {/* My Current Group Info */}
          <Card tone="raised" className="p-5 bg-indigo-500/10 border-indigo-500/30" sheen>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                  <Users className="h-5 w-5 text-indigo-400" />
                  My Current Group
                </h3>
                <p className="mt-1 text-sm text-slate-300">
                  You are currently in <span className="font-mono font-bold text-indigo-300">Group {data.myGroup}</span>
                  {data.term && (
                    <span className="text-slate-400">
                      {' '}· {data.term.academicYear} {data.term.season}
                    </span>
                  )}
                </p>
              </div>
              <div className="rounded-lg bg-indigo-500/20 px-4 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Courses</p>
                <p className="text-2xl font-bold text-indigo-300">{data.myCourses.length}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {data.myCourses.map((code) => (
                <Badge key={code} tone="indigo">
                  {code}
                </Badge>
              ))}
            </div>
          </Card>

          {/* Info Banner */}
          <AlertBanner tone="info" title="Schedule Swap Eligibility">
            Only groups with the <strong>exact same course set</strong> are shown below. No additional or missing
            courses allowed. Select a group to view its complete schedule before submitting a swap request.
          </AlertBanner>

          {/* Eligible Groups */}
          {data.eligibleGroups.length === 0 ? (
            <EmptyState
              icon={<ArrowRightLeft className="h-5 w-5" />}
              title="No eligible groups found"
              description={data.message}
            />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                  Eligible Groups ({data.eligibleGroups.length})
                </h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.eligibleGroups.map((group) => (
                  <Card
                    key={group.studyGroup}
                    tone="raised"
                    className="p-4 transition-all hover:border-indigo-500/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-mono text-xl font-bold text-white">Group {group.studyGroup}</h3>
                          <Badge tone="neutral" icon={<Users className="h-3 w-3" />}>
                            {group.major}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">Semester {group.semester}</p>

                        <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3.5 w-3.5" />
                            {group.courseCodes.length} courses
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {group.slotCount} slots
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1">
                          {group.courseCodes.map((code) => (
                            <Badge key={code} tone="sky" className="text-[10px]">
                              {code}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-800">
                      <CustomButton
                        variant="secondary"
                        size="sm"
                        onClick={() => viewGroupSchedule(group.studyGroup)}
                        icon={<Eye className="h-4 w-4" />}
                        className="w-full"
                      >
                        View Schedule
                      </CustomButton>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Note about submitting swap requests */}
              <AlertBanner tone="neutral" title="Next Steps">
                Open <strong>View Schedule</strong> on any group above to see its complete lecture, tutorial and lab
                timetable, or open <strong>Manage Swap Requests</strong> to submit a whole-schedule swap request,
                complete an open peer swap, or withdraw your active request.
              </AlertBanner>
            </>
          )}

          {/* Schedule viewer: the destination group's complete week */}
          {selectedGroup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeSchedule} />
              <Card tone="raised" className="relative z-10 m-4 max-h-[90vh] w-full max-w-4xl overflow-y-auto p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">Group {selectedGroup} Schedule</h3>
                    {groupSchedule && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        {groupSchedule.major} · Semester {groupSchedule.semester}
                        {groupSchedule.term && ` · ${groupSchedule.term.academicYear} ${groupSchedule.term.season}`}
                        {' · '}
                        {groupSchedule.sessions.length} sessions
                      </p>
                    )}
                  </div>
                  <CustomButton variant="ghost" size="sm" onClick={closeSchedule}>
                    Close
                  </CustomButton>
                </div>

                {scheduleError && (
                  <div className="mb-4">
                    <AlertBanner tone={scheduleError.status === 403 ? 'info' : 'error'} title="Could not load this schedule">
                      {scheduleError.message}
                    </AlertBanner>
                  </div>
                )}

                {isLoadingSchedule ? (
                  <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading Group {selectedGroup}'s schedule...
                  </div>
                ) : groupSchedule ? (
                  groupSchedule.sessions.length === 0 ? (
                    <EmptyState
                      icon={<Calendar className="h-5 w-5" />}
                      title="No sessions registered"
                      description="This group has no lectures, tutorials or labs registered for the term."
                    />
                  ) : (
                    <>
                      <div className="mb-4 flex flex-wrap gap-1">
                        {groupSchedule.courseCodes.map((code) => (
                          <Badge key={code} tone="sky" className="text-[10px]">
                            {code}
                          </Badge>
                        ))}
                      </div>

                      <AlertBanner tone="info" title="Exact course set">
                        This group runs exactly the same courses as your own schedule, which is what makes it a valid
                        swap destination.
                      </AlertBanner>

                      <div className="mt-4 space-y-5">
                        {groupSchedule.days.map((day) => {
                          const daySessions = groupSchedule.sessions.filter(
                            (session) => session.dayOfWeek === day
                          );
                          const isDayOff = groupSchedule.daysOff.includes(day);

                          return (
                            <div key={day}>
                              <div className="mb-2 flex items-center gap-2">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{day}</h4>
                                {isDayOff && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                                    <Coffee className="h-3 w-3" aria-hidden />
                                    Day off
                                  </span>
                                )}
                              </div>

                              {daySessions.length === 0 ? (
                                <p className="text-xs text-slate-500">No classes</p>
                              ) : (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {daySessions.map((session) => (
                                    <div
                                      key={session.id}
                                      className={`rounded-lg border p-3 ${TYPE_STYLE[session.slotType].card}`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-sm font-semibold text-white">
                                          {session.courseCode}
                                        </span>
                                        <Badge tone={TYPE_STYLE[session.slotType].tone}>
                                          {session.slotType} · G{session.groupNumber}
                                        </Badge>
                                      </div>
                                      <p className="mt-0.5 truncate text-xs text-slate-300" title={session.courseName}>
                                        {session.courseName}
                                      </p>
                                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                                        <span className="flex items-center gap-1">
                                          <Clock className="h-3 w-3" aria-hidden />
                                          {session.startTime}–{session.endTime}
                                        </span>
                                        <span className="flex items-center gap-1">
                                          <MapPin className="h-3 w-3" aria-hidden />
                                          {session.room}
                                        </span>
                                        {session.instructor && (
                                          <span className="flex items-center gap-1">
                                            <UserRound className="h-3 w-3" aria-hidden />
                                            {session.instructor}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )
                ) : null}
              </Card>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
};

export default EligibleSwapGroupsPage;
