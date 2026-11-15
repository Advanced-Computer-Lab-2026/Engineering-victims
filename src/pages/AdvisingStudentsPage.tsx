import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  FilePen,
  GraduationCap,
  ListFilter,
  Loader2,
  RotateCcw,
  ScrollText,
  Search,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';
import StatusPill from '../components/ui/StatusPill';
import { ApiError } from '../lib/api';
import { fetchAdvisingStudents } from '../lib/advisingStudentsService';
import { formatDate, formatRelative } from '../lib/studentsService';
import {
  EMPTY_ADVISING_FILTERS,
  hasActiveAdvisingFilters,
  type AdvisingFilterOptions,
  type AdvisingStudentFilters,
  type AdvisingStudentRow,
  type AdvisingStudentsResponse,
} from '../lib/types';

/** Debounce so typing in the search box does not fire a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

/** Straight value -> label pairs, for filter sets the server lists as strings. */
const toOptions = (values: string[] | undefined) => (values ?? []).map((value) => ({ value, label: value }));

/**
 * Req 50: every Advising Student, for an Advisor.
 * Req 51: searchable by student ID, full name or GUC email.
 * Req 52: filterable by Advisor, major, advising reason, schedule status and
 *         pending-request type — combined with AND, and all clearable at once.
 * Req 53: select a row to open that student's advising details.
 *
 * "My Students" (req 6-9) stays the Advisor's own roster; this page is the
 * school-wide view the workbook asks for, so students assigned to other
 * Advisors appear too, and search covers all of them. The Advisor's own rows
 * are marked "You", and the Advisor filter carries a "My assigned students"
 * choice that narrows the list back down to them.
 */
const AdvisingStudentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<AdvisingStudentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<AdvisingStudentFilters>(EMPTY_ADVISING_FILTERS);
  /**
   * Held separately from `data` so a failed refresh cannot take the filter
   * panel away with it — the options still describe the whole directory, and
   * they are what the user needs to narrow the query and try again.
   */
  const [filterOptions, setFilterOptions] = useState<AdvisingFilterOptions | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const isFirstLoad = useRef(true);
  /**
   * Id of the newest request. Searches and filter changes can overlap, so a
   * response only lands when its id still matches; otherwise a slow "lai" could
   * overwrite a later "laila", or clear the loading flags while the newer
   * request is running.
   */
  const latestRequest = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      // Returning the same object when the value has not changed keeps the
      // debounce from re-triggering the load on mount with an identical query.
      setFilters((current) => (current.search === next ? current : { ...current, search: next }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (isRefresh = false) => {
      const requestId = ++latestRequest.current;
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      try {
        const response = await fetchAdvisingStudents(filters);
        if (requestId === latestRequest.current) {
          setData(response);
          setFilterOptions(response.filterOptions);
        }
      } catch (err) {
        if (requestId === latestRequest.current) {
          // The old rows answer a different query, so they must not stay on
          // screen looking like results for this one.
          setData(null);
          setError((err as ApiError).message);
        }
      } finally {
        if (requestId === latestRequest.current) {
          setIsLoading(false);
          setIsRefreshing(false);
          isFirstLoad.current = false;
        }
      }
    },
    [filters]
  );

  // After the first load, a new search refreshes in place instead of
  // blanking the table behind a spinner on every keystroke. The cleanup
  // retires the in-flight request when the query changes or the page
  // unmounts, so a late response never sets state.
  useEffect(() => {
    load(isFirstLoad.current === false);
    return () => {
      latestRequest.current += 1;
    };
  }, [load]);

  const updateFilter = (key: keyof AdvisingStudentFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const clearFilters = () => {
    setFilters(EMPTY_ADVISING_FILTERS);
    setSearchInput('');
  };

  const students = data?.students ?? [];
  const filtersActive = hasActiveAdvisingFilters(filters) || searchInput.trim() !== '';
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== 'search' && value !== '').length;

  const majorOptions = useMemo(() => toOptions(filterOptions?.majors), [filterOptions]);
  const reasonOptions = useMemo(() => toOptions(filterOptions?.advisingReasons), [filterOptions]);
  const statusOptions = useMemo(() => toOptions(filterOptions?.workflowStatuses), [filterOptions]);
  const requestOptions = useMemo(() => toOptions(filterOptions?.pendingRequestTypes), [filterOptions]);

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
        <div className="mb-4 grid gap-4 md:grid-cols-3">
          <CountTile label="Advising students" value={data.summary.total} icon={<Users className="h-4 w-4 text-primary" aria-hidden />} />
          <CountTile label="Assigned to you" value={data.summary.mine} icon={<UserCheck className="h-4 w-4 text-success" aria-hidden />} />
          <CountTile label="Unassigned" value={data.summary.unassigned} icon={<UserX className="h-4 w-4 text-warning" aria-hidden />} />
        </div>
      )}

      <Card tone="flat" className="mb-4 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
              aria-hidden
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by student ID (64-12345), name or GUC email"
              aria-label="Search advising students"
              className="w-full rounded-lg border border-outline-variant bg-surface-container-low py-2.5 pl-9 pr-3 text-body text-on-surface placeholder:text-on-surface-variant transition-colors hover:border-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
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
                <span className="ml-1 rounded-full bg-primary-container px-1.5 text-caption font-semibold text-on-primary-container">
                  {activeFilterCount + (searchInput.trim() !== '' ? 1 : 0)}
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

        {/* Req 52: the five filters, combinable in any order and clearable together. */}
        {showFilters && filterOptions && (
          <div className="mt-4 grid gap-3 border-t border-outline-variant pt-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Select
              label="Advisor"
              placeholder="All advisors"
              value={filters.assignedAdvisor}
              onChange={(event) => updateFilter('assignedAdvisor', event.target.value)}
              options={filterOptions.advisors}
            />
            <Select
              label="Major"
              placeholder="All majors"
              value={filters.major}
              onChange={(event) => updateFilter('major', event.target.value)}
              options={majorOptions}
            />
            <Select
              label="Advising reason"
              placeholder="All reasons"
              value={filters.advisingReason}
              onChange={(event) => updateFilter('advisingReason', event.target.value)}
              options={[{ value: 'none', label: 'No advising reason' }, ...reasonOptions]}
            />
            <Select
              label="Schedule status"
              placeholder="All statuses"
              value={filters.workflowStatus}
              onChange={(event) => updateFilter('workflowStatus', event.target.value)}
              options={statusOptions}
            />
            <Select
              label="Pending request type"
              placeholder="All request types"
              value={filters.pendingRequestType}
              onChange={(event) => updateFilter('pendingRequestType', event.target.value)}
              options={requestOptions}
            />
          </div>
        )}

        {/* Refers to the query actually in flight, so the count never claims to
            describe a search term the request has not picked up yet. */}
        {data && (hasActiveAdvisingFilters(filters) || filters.search !== '') && (
          <p className="mt-3 text-caption text-on-surface-variant" aria-live="polite">
            Showing {data.summary.matched} of {data.summary.total} advising students
          </p>
        )}
      </Card>

      {isLoading ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading advising students...
        </Card>
      ) : !data ? (
        // The last request failed. Once its banner is dismissed, say so rather
        // than claiming there are no advising students.
        !error && (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="Advising students could not be loaded"
            description="The last request failed, so no results are shown."
            action={{ label: 'Try again', onClick: () => load() }}
          />
        )
      ) : students.length === 0 ? (
        !error &&
        (filtersActive ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="No advising students match these criteria"
            description="Combine fewer filters, change the search term, or clear everything to see the whole list."
            action={{ label: 'Clear all filters', onClick: clearFilters }}
          />
        ) : (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No advising students yet"
            description="Advising students appear here as soon as they exist in the directory."
          />
        ))
      ) : (
        <Card tone="raised" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[82rem] text-left text-body">
              <caption className="sr-only">
                All advising students with their assigned advisor, advising reason, workflow status,
                pending request, blocking step and last update
              </caption>
              <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Student ID</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Major</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Sem.</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Assigned advisor</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Advising reason</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Workflow status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Pending request</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Blocking step</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last update</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {students.map((student) => (
                  <AdvisingStudentTableRow
                    key={student.id}
                    student={student}
                    onOpen={() => navigate(`/students/${student.id}`)}
                  />
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
    <p className="flex items-center gap-2 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
      {icon}
      {label}
    </p>
    <p className="mt-2 text-h2 font-bold text-on-surface">{value}</p>
  </Card>
);

interface RowProps {
  student: AdvisingStudentRow;
  onOpen: () => void;
}

const AdvisingStudentTableRow: React.FC<RowProps> = ({ student, onOpen }) => {
  const navigate = useNavigate();

  return (
    <tr className={`group transition-colors hover:bg-surface-container ${student.isMine ? 'bg-surface-container-low' : ''}`}>
      <td className="px-4 py-3">
        {/* Req 53: selecting the student opens their advising details. */}
        <button
          type="button"
          onClick={onOpen}
          className="text-left font-medium text-on-surface underline-offset-4 hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {student.fullName}
        </button>
        <span className="mt-0.5 flex items-center gap-1 text-caption text-on-surface-variant">
          <GraduationCap className="h-3 w-3" aria-hidden />
          {student.email}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-caption text-on-surface">{student.studentId}</td>
      <td className="px-4 py-3 text-on-surface">{student.major}</td>
      <td className="px-4 py-3 text-on-surface">{student.currentSemester}</td>
      <td className="px-4 py-3 text-on-surface">
        {student.assignedAdvisor ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {student.assignedAdvisor.fullName}
            {student.isMine && <Badge tone="indigo">You</Badge>}
          </span>
        ) : (
          <span className="text-on-surface-variant">Unassigned</span>
        )}
      </td>
      <td className="px-4 py-3 text-caption text-on-surface-variant">
        {student.advisingReason ?? <span className="text-on-surface-variant">None recorded</span>}
      </td>
      <td className="px-4 py-3">
        <StatusPill state={student.isActive ? 'active' : 'inactive'} workflowStatus={student.workflowStatus} />
      </td>
      <td className="px-4 py-3">
        {student.pendingRequest === 'None' ? (
          <span className="text-caption text-on-surface-variant">None</span>
        ) : (
          <Badge tone="amber">{student.pendingRequest}</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-caption text-on-surface-variant">
        {student.blockingStep ?? <span className="text-on-surface-variant">None</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-caption text-on-surface-variant" title={formatDate(student.lastUpdateAt)}>
        {formatRelative(student.lastUpdateAt)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <CustomButton variant="ghost" size="sm" onClick={onOpen}>
          View
        </CustomButton>
        {/* Req 54: Advisors may open any advising student's academic history. */}
        <CustomButton
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/academic-history/${student.id}`)}
          icon={<ScrollText className="h-4 w-4" aria-hidden />}
        >
          History
        </CustomButton>
        {/* Req 31: the student's draft, review-ready or processed schedule. */}
        <CustomButton
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/schedule/${student.id}`)}
          icon={<CalendarDays className="h-4 w-4" aria-hidden />}
        >
          Schedule
        </CustomButton>
        <CustomButton
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/advising-schedules/${student.id}/draft`)}
          icon={<FilePen className="h-4 w-4" aria-hidden />}
        >
          Draft
        </CustomButton>
      </td>
    </tr>
  );
};

export default AdvisingStudentsPage;
