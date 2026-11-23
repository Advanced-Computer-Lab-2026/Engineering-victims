import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Eye, Loader2, RotateCcw, ScrollText, Search } from 'lucide-react';
import { ApiError } from '../lib/api';
import {
  exportGlobalScheduleHistory,
  getGlobalScheduleHistory,
  type ScheduleActivityAction,
  type ScheduleActivityEntry,
} from '../lib/scheduleActivityService';
import {
  canExportScheduleHistory,
  type AppliedScheduleHistoryFilters,
} from '../lib/scheduleHistoryQuery';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import CustomInput from '../components/ui/CustomInput';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';

/**
 * Req 123, 124, 125, 126:
 * - Req 123: Coordinator / Administrator views the automatically recorded
 *            history of schedule processing and reopening actions across all
 *            advising students (showing student ID, action, schedule version,
 *            staff member's full name, GUC email and role, date and time, and
 *            reopening reason when applicable).
 * - Req 124: Filter the schedule activity history by action type and date range.
 * - Req 125: Search the schedule activity history using a student ID or staff
 *            member's name or GUC email.
 * - Req 126: Export the displayed history (same filters and search) as CSV.
 */
const ScheduleActivityHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ScheduleActivityEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [actionFilter, setActionFilter] = useState<ScheduleActivityAction | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Req 126: the filters behind the rows on screen, so export matches what is
  // displayed even while a newly typed search is still waiting to load.
  const [appliedFilters, setAppliedFilters] = useState<AppliedScheduleHistoryFilters | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadHistory = useCallback(
    async (refresh = false) => {
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      try {
        const requested: AppliedScheduleHistoryFilters = {
          action: actionFilter,
          startDate,
          endDate,
          search: search.trim(),
        };
        const res = await getGlobalScheduleHistory(requested);
        setLogs(res.logs ?? []);
        setTotalCount(res.total ?? res.logs?.length ?? 0);
        setAppliedFilters(requested);
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

  const appliedHasFilters = Boolean(
    appliedFilters &&
      (appliedFilters.action || appliedFilters.startDate || appliedFilters.endDate || appliedFilters.search)
  );
  const canExport = canExportScheduleHistory({
    applied: appliedFilters,
    rowCount: logs.length,
    isLoading: isLoading || isRefreshing,
    isExporting,
    hasError: Boolean(error),
  });

  const exportHistory = async () => {
    if (!appliedFilters || !canExport) return;
    const count = logs.length;
    setIsExporting(true);
    setExportError(null);
    setExportMessage(null);
    try {
      await exportGlobalScheduleHistory(appliedFilters);
      setExportMessage(
        `Exported ${count} ${appliedHasFilters ? 'matching ' : ''}action${count === 1 ? '' : 's'} as a CSV file.`
      );
    } catch (err) {
      setExportError((err as Error).message || 'Could not export the schedule activity history.');
    } finally {
      setIsExporting(false);
    }
  };

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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-3 text-caption text-on-surface-variant">
          <span>
            Showing <strong className="text-on-surface">{logs.length}</strong> of{' '}
            <strong className="text-on-surface">{totalCount}</strong> recorded actions
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {hasFilters && (
              <CustomButton variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </CustomButton>
            )}
            <CustomButton
              variant="secondary"
              size="sm"
              onClick={() => void exportHistory()}
              disabled={!canExport}
              isLoading={isExporting}
              icon={<Download className="h-4 w-4" aria-hidden />}
            >
              {isExporting ? 'Exporting…' : `Export ${appliedHasFilters ? 'filtered ' : ''}history (CSV)`}
            </CustomButton>
          </div>
        </div>
      </Card>

      {exportMessage && (
        <div className="mb-4">
          <AlertBanner tone="success" title="Export ready" onDismiss={() => setExportMessage(null)}>
            {exportMessage}
          </AlertBanner>
        </div>
      )}

      {exportError && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not export history" onDismiss={() => setExportError(null)}>
            {exportError}
          </AlertBanner>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load history" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
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
            <table className="w-full min-w-[54rem] text-left text-body">
              <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
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
              <tbody className="divide-y divide-outline-variant">
                {logs.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-surface-container">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-on-surface">{entry.studentId}</div>
                      {entry.studentName && (
                        <div className="text-caption text-on-surface-variant">{entry.studentName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={entry.action === 'Processed' ? 'emerald' : 'amber'} dot>
                        {entry.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-caption text-on-surface">
                      v{entry.scheduleVersion}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-on-surface">{entry.staffName}</div>
                      <div className="text-caption text-on-surface-variant">{entry.staffEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{entry.staffRole}</Badge>
                    </td>
                    <td className="px-4 py-3 text-caption text-on-surface">
                      {new Date(entry.occurredAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-caption text-on-surface max-w-xs">
                      {entry.reason ? (
                        <span className="text-warning">{entry.reason}</span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.studentObjectId && (
                        <CustomButton
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/students/${entry.studentObjectId}`)}
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
    </>
  );
};

export default ScheduleActivityHistoryPage;
