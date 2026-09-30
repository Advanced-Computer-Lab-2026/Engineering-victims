import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Loader2, RotateCcw, ScrollText, UserCheck, UserX, Users } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import StatusPill from '../components/ui/StatusPill';
import { ApiError } from '../lib/api';
import { fetchAdvisingStudents } from '../lib/advisingStudentsService';
import { formatDate, formatRelative } from '../lib/studentsService';
import type { AdvisingStudentRow, AdvisingStudentsResponse } from '../lib/types';

/**
 * Req 50: every Advising Student, for an Advisor.
 *
 * "My Students" (req 6-9) stays the Advisor's own roster; this page is the
 * school-wide view the workbook asks for, so students assigned to other
 * Advisors appear too. The Advisor's own rows are marked "You".
 */
const AdvisingStudentsPage: React.FC = () => {
  const [data, setData] = useState<AdvisingStudentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      setData(await fetchAdvisingStudents());
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const students = data?.students ?? [];

  return (
    <>
      <PageHeader
        title="All Advising Students"
        description="Every advising student, including those assigned to other advisors, and where each one sits in the workflow."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <CustomButton
            variant="secondary"
            size="sm"
            onClick={() => load(true)}
            isLoading={isRefreshing}
            icon={<RotateCcw className="h-4 w-4" aria-hidden />}
          >
            Refresh
          </CustomButton>
        }
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load advising students" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {data && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <CountTile label="Advising students" value={data.summary.total} icon={<Users className="h-4 w-4 text-indigo-400" aria-hidden />} />
          <CountTile label="Assigned to you" value={data.summary.mine} icon={<UserCheck className="h-4 w-4 text-emerald-400" aria-hidden />} />
          <CountTile label="Unassigned" value={data.summary.unassigned} icon={<UserX className="h-4 w-4 text-amber-400" aria-hidden />} />
        </div>
      )}

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading advising students...
        </Card>
      ) : students.length === 0 ? (
        !error && (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No advising students yet"
            description="Advising students appear here as soon as they exist in the directory."
          />
        )
      ) : (
        <Card tone="raised" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-sm">
              <caption className="sr-only">
                All advising students with their assigned advisor, workflow status, blocking step and last update
              </caption>
              <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Student ID</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Major</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Sem.</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Assigned advisor</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Workflow status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Blocking step</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last update</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {students.map((student) => (
                  <AdvisingStudentTableRow key={student.id} student={student} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
};

const CountTile: React.FC<{ label: string; value: number; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <Card className="p-4">
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
      {icon}
      {label}
    </p>
    <p className="mt-2 text-2xl font-bold text-white">{value}</p>
  </Card>
);

const AdvisingStudentTableRow: React.FC<{ student: AdvisingStudentRow }> = ({ student }) => {
  const navigate = useNavigate();

  return (
    <tr className={`transition-colors hover:bg-slate-800/40 ${student.isMine ? 'bg-indigo-500/5' : ''}`}>
      <td className="px-4 py-3">
        <span className="block font-medium text-slate-100">{student.fullName}</span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
          <GraduationCap className="h-3 w-3" aria-hidden />
          {student.email}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-300">{student.studentId}</td>
      <td className="px-4 py-3 text-slate-300">{student.major}</td>
      <td className="px-4 py-3 text-slate-300">{student.currentSemester}</td>
      <td className="px-4 py-3 text-slate-300">
        {student.assignedAdvisor ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {student.assignedAdvisor.fullName}
            {student.isMine && <Badge tone="indigo">You</Badge>}
          </span>
        ) : (
          <span className="text-slate-500">Unassigned</span>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusPill state={student.isActive ? 'active' : 'inactive'} workflowStatus={student.workflowStatus} />
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">
        {student.blockingStep ?? <span className="text-slate-600">None</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500" title={formatDate(student.lastUpdateAt)}>
        {formatRelative(student.lastUpdateAt)}
      </td>
      <td className="px-4 py-3 text-right">
        {/* Req 54: Advisors may open any advising student's academic history. */}
        <CustomButton
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/academic-history/${student.id}`)}
          icon={<ScrollText className="h-4 w-4" aria-hidden />}
        >
          History
        </CustomButton>
      </td>
    </tr>
  );
};

export default AdvisingStudentsPage;
