import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCcw, Calendar, BookOpen, Users, ArrowRightLeft, Eye } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { fetchStudentSchedule } from '../lib/weeklyScheduleService';
import type { EligibleSwapGroupsResponse, WeeklyScheduleResponse } from '../lib/types';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import CustomButton from '../components/ui/CustomButton';
import AlertBanner from '../components/ui/AlertBanner';
import EmptyState from '../components/ui/EmptyState';

/**
 * Req 34: Normal Student views eligible destination group numbers and their
 * complete weekly schedules for a whole-schedule swap. Shows only groups with
 * the exact same course-code set in the same term.
 */
const EligibleSwapGroupsPage: React.FC = () => {
  const [data, setData] = useState<EligibleSwapGroupsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupSchedule, setGroupSchedule] = useState<WeeklyScheduleResponse | null>(null);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);

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

  const viewGroupSchedule = async (groupNumber: string) => {
    setSelectedGroup(groupNumber);
    setIsLoadingSchedule(true);
    setGroupSchedule(null);
    
    try {
      // This is a temporary approach - in a real implementation, you'd need
      // an endpoint to get a schedule by group number, not by student ID.
      // For now, we'll show a message that viewing schedules requires backend support.
      setGroupSchedule(null);
    } catch (err) {
      console.error('Could not load group schedule:', err);
    } finally {
      setIsLoadingSchedule(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Eligible Swap Groups"
        description="View other study groups with the exact same course set that you can swap your schedule with."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <CustomButton
            variant="secondary"
            size="sm"
            onClick={() => load(true)}
            isLoading={isRefreshing}
            icon={<RefreshCcw className="h-4 w-4" />}
          >
            Refresh
          </CustomButton>
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
                To submit a swap request, you'll use the swap request feature (Requirement 35) which allows you to
                select one or more desired groups. The request will be visible to students in those groups who can
                then complete the swap.
              </AlertBanner>
            </>
          )}

          {/* Schedule Viewer Modal (placeholder) */}
          {selectedGroup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedGroup(null)} />
              <Card tone="raised" className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">Group {selectedGroup} Schedule</h3>
                  <CustomButton variant="ghost" size="sm" onClick={() => setSelectedGroup(null)}>
                    Close
                  </CustomButton>
                </div>

                <AlertBanner tone="info" title="Schedule View">
                  To view the complete weekly schedule for this group, you can use the schedule comparison feature in
                  the swap request workflow. This will show a side-by-side comparison of your current schedule and the
                  destination group's schedule.
                </AlertBanner>

                <div className="mt-4 text-center text-sm text-slate-400">
                  Full schedule viewer will be available in Requirement 35 (Submit Swap Request)
                </div>
              </Card>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
};

export default EligibleSwapGroupsPage;
