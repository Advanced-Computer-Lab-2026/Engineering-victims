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
      <table className="w-full min-w-[48rem] text-left text-body">
        <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
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
        <tbody className="divide-y divide-outline-variant">
          {rows.map((st) => (
            <tr key={st.id} className="transition-colors hover:bg-surface-container">
              <td className="px-4 py-3">
                <div className="font-medium text-on-surface">{st.fullName}</div>
                <div className="font-mono text-caption text-on-surface-variant">{st.studentId}</div>
              </td>
              <td className="px-4 py-3 text-caption text-on-surface">
                <div>{st.major}</div>
                <div className="text-on-surface-variant">
                  Sem {st.currentSemester}
                  {st.studyGroup ? ` · Group ${st.studyGroup}` : ''}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge tone={STATE_TONE[st.stateCategory] ?? 'indigo'} dot>
                  {st.workflowStatus}
                </Badge>
              </td>
              <td className="px-4 py-3 text-caption text-on-surface">
                {st.blockingStep ?? <span className="text-on-surface-variant">None</span>}
              </td>
              <td className="px-4 py-3 text-caption">
                {st.awaitingRequest === 'None' ? (
                  <span className="text-on-surface-variant">None</span>
                ) : (
                  <Badge tone="amber">{st.awaitingRequest}</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-caption text-on-surface">
                {st.assignedAdvisor ? st.assignedAdvisor.fullName : <span className="text-on-surface-variant">Unassigned</span>}
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
        <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
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
              <div className="flex items-center justify-between text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">
                <span>Advising Students</span>
                <GraduationCap className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <p className="mt-2 text-h2 font-bold text-on-surface">{data.summary.advisingStudents}</p>
              <p className="mt-1 text-caption text-on-surface-variant">
                Draft, review, change-request, approval, settlement & processing states
              </p>
            </Card>

            <Card tone="raised" className="p-4">
              <div className="flex items-center justify-between text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">
                <span>Normal Students</span>
                <Users className="h-4 w-4 text-info" aria-hidden />
              </div>
              <p className="mt-2 text-h2 font-bold text-on-surface">{data.summary.normalStudents}</p>
              <p className="mt-1 text-caption text-on-surface-variant">
                Standard group assignments & whole-schedule swaps
              </p>
            </Card>

            <Card tone="raised" className="p-4">
              <div className="flex items-center justify-between text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">
                <span>Group Swaps (Open / Completed)</span>
                <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
              </div>
              <p className="mt-2 text-h2 font-bold text-on-surface">
                {data.summary.openSwaps} / {data.summary.completedSwaps}
              </p>
              <p className="mt-1 text-caption text-on-surface-variant">
                Normal-student group swap activity
              </p>
            </Card>

            <Card tone="raised" className="p-4">
              <div className="flex items-center justify-between text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">
                <span>Requests Awaiting Action</span>
                <Bell className="h-4 w-4 text-warning" aria-hidden />
              </div>
              <p className="mt-2 text-h2 font-bold text-warning">
                {data.summary.awaitingActionCount}
              </p>
              <p className="mt-1 text-caption text-on-surface-variant">
                Across swaps, slot changes, extra hours, plans & exit exams
              </p>
            </Card>
          </div>

          {/* Advising-Student State Breakdown Pills */}
          <Card tone="default" className="p-4">
            <h2 className="mb-3 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
              Advising-Student Workflow State Breakdown
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {(
                ['Draft', 'Review', 'Change-Request', 'Approval', 'Settlement', 'Processing'] as const
              ).map((stage) => (
                <div
                  key={stage}
                  className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-center"
                >
                  <div className="text-h3 font-bold text-on-surface">
                    {data.advisingStateBreakdown[stage]?.length ?? 0}
                  </div>
                  <div className="mt-0.5 text-caption text-on-surface-variant">{stage}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Grouping Mode Switcher */}
          <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant pb-3">
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
                    <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-3.5">
                      <h3 className="text-body font-bold text-on-surface">{type}s</h3>
                      <Badge tone={type === 'Advising Student' ? 'indigo' : 'sky'}>
                        {rows.length} students
                      </Badge>
                    </div>
                    {rows.length === 0 ? (
                      <div className="p-8 text-center text-body text-on-surface-variant">
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
                  <div className="flex items-center justify-between border-b border-outline-variant pb-3">
                    <h3 className="text-body font-bold text-on-surface">{group.requestType}</h3>
                    <Badge tone={group.count > 0 ? 'amber' : 'neutral'}>{group.count}</Badge>
                  </div>

                  {group.items.length === 0 ? (
                    <p className="py-4 text-caption text-on-surface-variant">
                      No requests currently in this category.
                    </p>
                  ) : (
                    <ul className="divide-y divide-outline-variant max-h-72 overflow-y-auto pr-1">
                      {group.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 py-2.5 text-caption"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-on-surface">{item.studentName}</span>
                              <span className="font-mono text-on-surface-variant">({item.studentId})</span>
                            </div>
                            <p className="mt-0.5 truncate text-on-surface-variant">{item.detail}</p>
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
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-low px-5 py-3.5">
                      <div>
                        <h3 className="text-body font-bold text-on-surface">{advisorGroup.advisorName}</h3>
                        {advisorGroup.advisorEmail && (
                          <p className="text-caption text-on-surface-variant">{advisorGroup.advisorEmail}</p>
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
