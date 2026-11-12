import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Loader2, RotateCcw, ScrollText, Search } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import { ApiError } from '../lib/api';
import {
  getGlobalScheduleHistory,
  type ScheduleActivityAction,
  type ScheduleActivityEntry,
} from '../lib/scheduleActivityService';
import PageHeader from '../components/PageHeader';
import StudentDetailDrawer from '../components/StudentDetailDrawer';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import CustomInput from '../components/ui/CustomInput';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';

/**
 * Req 123, 124, 125:
 * - Req 123: Coordinator / Administrator views the automatically recorded
 *            history of schedule processing and reopening actions across all
 *            advising students (showing student ID, action, schedule version,
 *            staff member's full name, GUC email and role, date and time, and
 *            reopening reason when applicable).
 * - Req 124: Filter the schedule activity history by action type and date range.
 * - Req 125: Search the schedule activity history using a student ID or staff
 *            member's name or GUC email.
 */
const ScheduleActivityHistoryPage: React.FC = () => {
  const { user } = useSession();
  const [logs, setLogs] = useState<ScheduleActivityEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [actionFilter, setActionFilter] = useState<ScheduleActivityAction | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(
    async (refresh = false) => {
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      try {
        const res = await getGlobalScheduleHistory({
          action: actionFilter,
          startDate,
          endDate,
          search,
        });
        setLogs(res.logs ?? []);
        setTotalCount(res.total ?? res.logs?.length ?? 0);
      } catch (err) {
        setError((err as ApiError).message || 'Could not load schedule activity history.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [actionFilter, startDate, endDate, search]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      loadHistory();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadHistory]);

  const hasFilters = Boolean(actionFilter || startDate || endDate || search.trim());

  const clearFilters = () => {
    setActionFilter('');
    setStartDate('');
    setEndDate('');
    setSearch('');
  };

  return (
    <>
      <PageHeader
        title="Schedule Activity History"
        description="Automatically recorded history of advising schedule processing and reopening actions."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <CustomButton
            variant="secondary"
            size="sm"
            onClick={() => loadHistory(true)}
            isLoading={isRefreshing}
            icon={<RotateCcw className="h-4 w-4" aria-hidden />}
          >
            Refresh
          </CustomButton>
        }
      />

      {/* Req 124 & Req 125: Search & Filter Controls */}
      <Card tone="default" className="mb-6 p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CustomInput
            label="Search (Student ID, Staff Name or Email)"
            placeholder="e.g. 64-40078 or advisor@guc.edu.eg"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="h-4 w-4" />}
          />

          <Select
            label="Action Type"
            placeholder="All actions"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as ScheduleActivityAction | '')}
            options={[
              { value: 'Processed', label: 'Processed' },
              { value: 'Reopened', label: 'Reopened' },
            ]}
          />

          <CustomInput
            label="From Date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />

          <CustomInput
            label="To Date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3 text-xs text-slate-400">
          <span>
            Showing <strong className="text-white">{logs.length}</strong> of{' '}
            <strong className="text-white">{totalCount}</strong> recorded actions
          </span>
          {hasFilters && (
            <CustomButton variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </CustomButton>
          )}
        </div>
      </Card>

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load history" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading schedule activity history...
        </Card>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-5 w-5" />}
          title={hasFilters ? 'No activity entries match your filters' : 'No schedule activity recorded yet'}
          description={
            hasFilters
              ? 'Try clearing or widening the action type, date range, or search query.'
              : 'Entries are recorded automatically whenever an advising student’s schedule is processed or reopened.'
          }
          action={hasFilters ? { label: 'Clear filters', onClick: clearFilters } : undefined}
        />
      ) : (
        <Card tone="raised" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student ID</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Schedule Version</th>
                  <th className="px-4 py-3 font-semibold">Staff Member</th>
                  <th className="px-4 py-3 font-semibold">Staff Role</th>
                  <th className="px-4 py-3 font-semibold">Date & Time</th>
                  <th className="px-4 py-3 font-semibold">Reopening Reason</th>
                  <th className="px-4 py-3 text-right font-semibold">Student Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-white">{entry.studentId}</div>
                      {entry.studentName && (
                        <div className="text-xs text-slate-400">{entry.studentName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={entry.action === 'Processed' ? 'emerald' : 'amber'} dot>
                        {entry.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">
                      v{entry.scheduleVersion}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-100">{entry.staffName}</div>
                      <div className="text-xs text-slate-400">{entry.staffEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{entry.staffRole}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">
                      {new Date(entry.occurredAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300 max-w-xs">
                      {entry.reason ? (
                        <span className="text-amber-200">{entry.reason}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.studentObjectId && (
                        <CustomButton
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedStudentId(entry.studentObjectId)}
                          icon={<Eye className="h-4 w-4" aria-hidden />}
                        >
                          Advising Details
                        </CustomButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <StudentDetailDrawer
        studentId={selectedStudentId}
        role={user?.role ?? null}
        onClose={() => setSelectedStudentId(null)}
        onStatusChange={() => loadHistory(true)}
      />
    </>
  );
};

export default ScheduleActivityHistoryPage;
