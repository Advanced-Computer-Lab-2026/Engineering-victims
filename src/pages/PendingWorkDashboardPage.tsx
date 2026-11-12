import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Eye,
  GraduationCap,
  Layers,
  Loader2,
  RotateCcw,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import { useSession } from '../hooks/useSession';
import { ApiError } from '../lib/api';
import {
  getPendingWorkDashboard,
  type PendingWorkDashboardResponse,
  type PendingWorkStudent,
} from '../lib/coordinatorDashboardService';
import PageHeader from '../components/PageHeader';
import StudentDetailDrawer from '../components/StudentDetailDrawer';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';

type GroupingMode = 'studentType' | 'requestType' | 'advisor';

const STATE_TONE: Record<string, BadgeTone> = {
  Draft: 'neutral',
  Review: 'sky',
  'Change-Request': 'amber',
  Approval: 'amber',
  Settlement: 'indigo',
  Processing: 'emerald',
  'Schedule Assigned': 'emerald',
  'Swap Request Open': 'indigo',
  'Swap Completed': 'emerald',
  'Swap Withdrawn': 'neutral',
  'Swap Expired': 'rose',
};

/**
 * Req 122: Coordinator views a pending-work dashboard showing every student's
 * workflow status, blocking step and requests awaiting action, grouped by
 * student type, request type and Advisor.
 *
 * Statuses are system-derived from completed actions and cannot be manually
 * overwritten by an Advisor.
 */
const PendingWorkDashboardPage: React.FC = () => {
  const { user } = useSession();
  const [data, setData] = useState<PendingWorkDashboardResponse | null>(null);
  const [grouping, setGrouping] = useState<GroupingMode>('studentType');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const response = await getPendingWorkDashboard();
      setData(response);
    } catch (err) {
      setError((err as ApiError).message || 'Could not load pending-work dashboard.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const renderStudentTable = (rows: PendingWorkStudent[]) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-semibold">Student</th>
            <th className="px-4 py-3 font-semibold">Cohort</th>
            <th className="px-4 py-3 font-semibold">Workflow Status (System-Derived)</th>
            <th className="px-4 py-3 font-semibold">Blocking Step</th>
            <th className="px-4 py-3 font-semibold">Awaiting Request</th>
            <th className="px-4 py-3 font-semibold">Assigned Advisor</th>
            <th className="px-4 py-3 text-right font-semibold">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {rows.map((st) => (
            <tr key={st.id} className="transition-colors hover:bg-slate-800/40">
              <td className="px-4 py-3">
                <div className="font-medium text-white">{st.fullName}</div>
                <div className="font-mono text-xs text-slate-400">{st.studentId}</div>
              </td>
              <td className="px-4 py-3 text-xs text-slate-300">
                <div>{st.major}</div>
                <div className="text-slate-500">
                  Sem {st.currentSemester}
                  {st.studyGroup ? ` · Group ${st.studyGroup}` : ''}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge tone={STATE_TONE[st.stateCategory] ?? 'indigo'} dot>
                  {st.workflowStatus}
                </Badge>
              </td>
              <td className="px-4 py-3 text-xs text-slate-300">
                {st.blockingStep ?? <span className="text-slate-500">None</span>}
              </td>
              <td className="px-4 py-3 text-xs">
                {st.awaitingRequest === 'None' ? (
                  <span className="text-slate-500">None</span>
                ) : (
                  <Badge tone="amber">{st.awaitingRequest}</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-slate-300">
                {st.assignedAdvisor ? st.assignedAdvisor.fullName : <span className="text-slate-500">Unassigned</span>}
              </td>
              <td className="px-4 py-3 text-right">
                <CustomButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStudentId(st.id)}
                  icon={<Eye className="h-4 w-4" aria-hidden />}
                >
                  Open
                </CustomButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Pending-Work Dashboard"
        description="Every student’s system-derived workflow status, blocking step, and requests awaiting action, grouped by student type, request type, and Advisor."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <CustomButton
            variant="secondary"
            size="sm"
            onClick={() => loadDashboard(true)}
            isLoading={isRefreshing}
            icon={<RotateCcw className="h-4 w-4" aria-hidden />}
          >
            Refresh
          </CustomButton>
        }
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load dashboard" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading pending-work dashboard...
        </Card>
      ) : data ? (
        <div className="space-y-6">
          <AlertBanner tone="info" title="System-Derived Workflow Statuses">
            All workflow statuses and blocking steps are automatically calculated from completed
            workflow actions and cannot be manually overwritten by an Advisor.
          </AlertBanner>

          {/* Summary KPI Tiles */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card tone="raised" className="p-4">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
                <span>Advising Students</span>
                <GraduationCap className="h-4 w-4 text-indigo-400" aria-hidden />
              </div>
              <p className="mt-2 text-2xl font-bold text-white">{data.summary.advisingStudents}</p>
              <p className="mt-1 text-xs text-slate-400">
                Draft, review, change-request, approval, settlement & processing states
              </p>
            </Card>

            <Card tone="raised" className="p-4">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
                <span>Normal Students</span>
                <Users className="h-4 w-4 text-sky-400" aria-hidden />
              </div>
              <p className="mt-2 text-2xl font-bold text-white">{data.summary.normalStudents}</p>
              <p className="mt-1 text-xs text-slate-400">
                Standard group assignments & whole-schedule swaps
              </p>
            </Card>

            <Card tone="raised" className="p-4">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
                <span>Group Swaps (Open / Completed)</span>
                <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
              </div>
              <p className="mt-2 text-2xl font-bold text-white">
                {data.summary.openSwaps} / {data.summary.completedSwaps}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Normal-student group swap activity
              </p>
            </Card>

            <Card tone="raised" className="p-4">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
                <span>Requests Awaiting Action</span>
                <Bell className="h-4 w-4 text-amber-400" aria-hidden />
              </div>
              <p className="mt-2 text-2xl font-bold text-amber-300">
                {data.summary.awaitingActionCount}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Across swaps, slot changes, extra hours, plans & exit exams
              </p>
            </Card>
          </div>

          {/* Advising-Student State Breakdown Pills */}
          <Card tone="default" className="p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Advising-Student Workflow State Breakdown
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {(
                ['Draft', 'Review', 'Change-Request', 'Approval', 'Settlement', 'Processing'] as const
              ).map((stage) => (
                <div
                  key={stage}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center"
                >
                  <div className="text-lg font-bold text-white">
                    {data.advisingStateBreakdown[stage]?.length ?? 0}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">{stage}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Grouping Mode Switcher */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
            <CustomButton
              variant={grouping === 'studentType' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setGrouping('studentType')}
              icon={<Users className="h-4 w-4" aria-hidden />}
            >
              Grouped by Student Type
            </CustomButton>
            <CustomButton
              variant={grouping === 'requestType' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setGrouping('requestType')}
              icon={<Layers className="h-4 w-4" aria-hidden />}
            >
              Grouped by Request Type
            </CustomButton>
            <CustomButton
              variant={grouping === 'advisor' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setGrouping('advisor')}
              icon={<UserCog className="h-4 w-4" aria-hidden />}
            >
              Grouped by Advisor
            </CustomButton>
          </div>

          {/* 1. Grouped by Student Type */}
          {grouping === 'studentType' && (
            <div className="space-y-6">
              {(['Advising Student', 'Normal Student'] as const).map((type) => {
                const rows = data.byStudentType[type] ?? [];
                return (
                  <Card key={type} tone="raised" className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-5 py-3.5">
                      <h3 className="text-sm font-bold text-white">{type}s</h3>
                      <Badge tone={type === 'Advising Student' ? 'indigo' : 'sky'}>
                        {rows.length} students
                      </Badge>
                    </div>
                    {rows.length === 0 ? (
                      <div className="p-8 text-center text-sm text-slate-500">
                        No students in this group.
                      </div>
                    ) : (
                      renderStudentTable(rows)
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* 2. Grouped by Request Type */}
          {grouping === 'requestType' && (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.byRequestType.map((group) => (
                <Card key={group.requestType} tone="raised" className="p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-bold text-white">{group.requestType}</h3>
                    <Badge tone={group.count > 0 ? 'amber' : 'neutral'}>{group.count}</Badge>
                  </div>

                  {group.items.length === 0 ? (
                    <p className="py-4 text-xs text-slate-500">
                      No requests currently in this category.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-800/70 max-h-72 overflow-y-auto pr-1">
                      {group.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 py-2.5 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">{item.studentName}</span>
                              <span className="font-mono text-slate-400">({item.studentId})</span>
                            </div>
                            <p className="mt-0.5 truncate text-slate-400">{item.detail}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge tone={item.status === 'Completed' ? 'emerald' : 'indigo'}>
                              {item.status}
                            </Badge>
                            {item.studentObjectId && (
                              <CustomButton
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedStudentId(item.studentObjectId)}
                              >
                                Inspect
                              </CustomButton>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* 3. Grouped by Advisor */}
          {grouping === 'advisor' && (
            <div className="space-y-5">
              {data.byAdvisor.length === 0 ? (
                <EmptyState
                  title="No advising rosters found"
                  description="Advising students grouped by their assigned Advisor will appear here."
                />
              ) : (
                data.byAdvisor.map((advisorGroup) => (
                  <Card
                    key={advisorGroup.advisorId ?? 'unassigned'}
                    tone="raised"
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-5 py-3.5">
                      <div>
                        <h3 className="text-sm font-bold text-white">{advisorGroup.advisorName}</h3>
                        {advisorGroup.advisorEmail && (
                          <p className="text-xs text-slate-400">{advisorGroup.advisorEmail}</p>
                        )}
                      </div>
                      <Badge tone="indigo">{advisorGroup.students.length} assigned students</Badge>
                    </div>
                    {renderStudentTable(advisorGroup.students)}
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      ) : null}

      <StudentDetailDrawer
        studentId={selectedStudentId}
        role={user?.role ?? null}
        onClose={() => setSelectedStudentId(null)}
        onStatusChange={() => loadDashboard(true)}
      />
    </>
  );
};

export default PendingWorkDashboardPage;
