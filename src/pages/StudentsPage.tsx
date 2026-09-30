import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  ListFilter,
  Loader2,
  RotateCcw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { fetchStudents, formatRelative } from '../lib/studentsService';
import { useSession } from '../hooks/useSession';
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  type FilterOptions,
  type StudentFilters,
  type StudentSummary,
  type StudentsResponse,
} from '../lib/types';
import StudentDetailDrawer from '../components/StudentDetailDrawer';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';
import StatusPill from '../components/ui/StatusPill';

const PAGE_SIZE = 25;
/** Debounce so typing in the search box does not fire a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

const StudentsPage: React.FC = () => {
  const { user } = useSession();
  const role = user?.role ?? null;
  const [filters, setFilters] = useState<StudentFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StudentsResponse | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const isFirstLoad = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => ({ ...current, search: searchInput }));
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      try {
        const response = await fetchStudents(filters, page, PAGE_SIZE);
        setData(response);
        setFilterOptions(response.filterOptions);
      } catch (err) {
        setError((err as ApiError).message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        isFirstLoad.current = false;
      }
    },
    [filters, page]
  );

  useEffect(() => {
    load(isFirstLoad.current === false);
  }, [load]);

  const updateFilter = (key: keyof StudentFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchInput('');
    setPage(1);
  };

  const students = data?.students ?? [];
  const pagination = data?.pagination;
  const filtersActive = hasActiveFilters(filters) || searchInput !== '';

  const workflowStatusOptions = useMemo(() => {
    if (!filterOptions) return [];
    // Offer the union so one list serves both student types, which is what a
    // Coordinator scanning across the whole school actually needs.
    const all = new Set([
      ...filterOptions.workflowStatuses['Normal Student'],
      ...filterOptions.workflowStatuses['Advising Student'],
    ]);
    return [...all].map((status) => ({ value: status, label: status }));
  }, [filterOptions]);

  return (
    <>
      <PageHeader
        title={role === 'Advisor' ? 'My Students' : 'Students'}
        description={
          role === 'Advisor'
            ? 'The students assigned to you and where they sit in the scheduling workflow.'
            : 'Every GUC student and where they sit in the scheduling workflow.'
        }
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
          <AlertBanner tone="error" title="Could not load students" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      <Card tone="flat" className="mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by student ID, name or GUC email"
              aria-label="Search students"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/70 py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 transition-colors hover:border-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            />
          </div>

          <div className="flex gap-2">
            <CustomButton
              variant={showFilters ? 'primary' : 'secondary'}
              size="md"
              onClick={() => setShowFilters((current) => !current)}
              icon={<ListFilter className="h-4 w-4" aria-hidden />}
              aria-expanded={showFilters}
            >
              Filters
              {filtersActive && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px] font-semibold">
                  {Object.values(filters).filter(Boolean).length}
                </span>
              )}
            </CustomButton>
            {filtersActive && (
              <CustomButton variant="ghost" size="md" onClick={clearFilters} icon={<X className="h-4 w-4" aria-hidden />}>
                Clear
              </CustomButton>
            )}
          </div>
        </div>

        {showFilters && filterOptions && (
          <div className="mt-4 grid gap-3 border-t border-slate-800/70 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Student type"
              placeholder="All types"
              value={filters.studentType}
              onChange={(event) => updateFilter('studentType', event.target.value)}
              options={filterOptions.studentTypes.map((value) => ({ value, label: value }))}
            />
            {/* Every row on an Advisor's screen is already theirs, so the
                advisor filter is meaningless for them (and the API returns no
                options for it) — the control is dropped rather than shown
                empty. */}
            {role !== 'Advisor' && (
              <Select
                label="Assigned advisor"
                placeholder="All advisors"
                value={filters.assignedAdvisor}
                onChange={(event) => updateFilter('assignedAdvisor', event.target.value)}
                options={[
                  { value: 'none', label: 'Unassigned' },
                  ...filterOptions.advisors,
                ]}
              />
            )}
            <Select
              label="Major"
              placeholder="All majors"
              value={filters.major}
              onChange={(event) => updateFilter('major', event.target.value)}
              options={filterOptions.majors.map((value) => ({ value, label: value }))}
            />
            <Select
              label="Semester"
              placeholder="All semesters"
              value={filters.currentSemester}
              onChange={(event) => updateFilter('currentSemester', event.target.value)}
              options={filterOptions.currentSemesters.map((value) => ({ value: String(value), label: `Semester ${value}` }))}
            />
            <Select
              label="Academic standing"
              placeholder="All standings"
              value={filters.academicStanding}
              onChange={(event) => updateFilter('academicStanding', event.target.value)}
              options={filterOptions.academicStandings.map((value) => ({ value, label: value }))}
            />
            <Select
              label="Workflow status"
              placeholder="All statuses"
              value={filters.workflowStatus}
              onChange={(event) => updateFilter('workflowStatus', event.target.value)}
              options={workflowStatusOptions}
            />
            <Select
              label="Blocking step"
              placeholder="All steps"
              value={filters.blockingStep}
              onChange={(event) => updateFilter('blockingStep', event.target.value)}
              options={filterOptions.blockingSteps.map((value) => ({ value, label: value }))}
            />
            <Select
              label="Account status"
              placeholder="All accounts"
              value={filters.isActive}
              onChange={(event) => updateFilter('isActive', event.target.value)}
              options={filterOptions.accountStatuses}
            />
          </div>
        )}
      </Card>

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading students...
        </Card>
      ) : students.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={filtersActive ? 'No students match these criteria' : 'No students yet'}
          description={
            filtersActive
              ? 'Try a different search term, or clear the filters to see everyone.'
              : 'Students will appear here once they are added to the system.'
          }
          action={filtersActive ? { label: 'Clear all filters', onClick: clearFilters } : undefined}
        />
      ) : (
        <>
          <Card tone="raised" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] text-left text-sm">
                <caption className="sr-only">
                  GUC students and their scheduling workflow status
                </caption>
                <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Student ID</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Major</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Sem.</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Advisor</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Blocking step</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Updated</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {students.map((student) => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      onSelect={() => setSelectedId(student.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {pagination && pagination.totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-400"
            >
              <p>
                Showing{' '}
                <span className="font-medium text-slate-200">
                  {(pagination.page - 1) * pagination.limit + 1}-
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </span>{' '}
                of <span className="font-medium text-slate-200">{pagination.total}</span>
              </p>
              <div className="flex gap-2">
                <CustomButton
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  icon={<ChevronLeft className="h-4 w-4" aria-hidden />}
                >
                  Previous
                </CustomButton>
                <CustomButton
                  variant="secondary"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </CustomButton>
              </div>
            </nav>
          )}
        </>
      )}

      <StudentDetailDrawer
        studentId={selectedId}
        role={role}
        onClose={() => setSelectedId(null)}
        onStatusChange={() => load(true)}
      />
    </>
  );
};

interface StudentRowProps {
  student: StudentSummary;
  onSelect: () => void;
}

const StudentRow: React.FC<StudentRowProps> = ({ student, onSelect }) => (
  <tr className="group transition-colors hover:bg-slate-800/40">
    <td className="px-4 py-3">
      <button
        type="button"
        onClick={onSelect}
        className="text-left font-medium text-slate-100 underline-offset-4 hover:text-indigo-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        {student.fullName}
      </button>
      <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
        <GraduationCap className="h-3 w-3" aria-hidden />
        {student.email}
      </span>
    </td>
    <td className="px-4 py-3 font-mono text-xs text-slate-300">{student.studentId}</td>
    <td className="px-4 py-3">
      <Badge tone={student.studentType === 'Advising Student' ? 'indigo' : 'sky'}>
        {student.studentType.replace(' Student', '')}
      </Badge>
    </td>
    <td className="px-4 py-3 text-slate-300">{student.major}</td>
    <td className="px-4 py-3 text-slate-300">{student.currentSemester}</td>
    <td className="px-4 py-3 text-slate-300">
      {student.assignedAdvisor ? (
        student.assignedAdvisor.fullName
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
    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
      {formatRelative(student.lastUpdateAt)}
    </td>
    <td className="px-4 py-3 text-right">
      <CustomButton variant="ghost" size="sm" onClick={onSelect}>
        View
      </CustomButton>
    </td>
  </tr>
);

export default StudentsPage;
