import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ClipboardList, ListFilter, Loader2, RotateCcw, Search, SearchX, X } from 'lucide-react';
import type { ApiError } from '../lib/api';
import type {
  SlotChangeRequestStatus,
  StaffSlotChangeFilterOptions,
  StaffSlotChangeRequestItem,
  StaffSlotChangeRequestList,
} from '../lib/types';
import {
  fetchStaffSlotChangeFilterOptions,
  fetchStaffSlotChangeRequests,
  STAFF_SEARCH_LIMIT,
  UNASSIGNED_ADVISOR,
  type StaffSlotChangeRequestQuery,
} from '../lib/slotChangeRequestsService';
import { formatDate } from '../lib/studentsService';
import { SLOT_TONE, STATUS_TONE, slotLabel } from '../lib/slotChangeDisplay';
import { useSession } from '../hooks/useSession';
import PageHeader from '../components/PageHeader';
import SlotChangeRequestDetailDrawer from '../components/SlotChangeRequestDetailDrawer';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';

const STATUSES: SlotChangeRequestStatus[] = ['Pending', 'Approved', 'Rejected', 'Withdrawn'];

/** Req 45: the filter values; '' means "not filtered". */
interface Filters {
  status: string;
  advisor: string;
  course: string;
  submittedFrom: string;
  submittedTo: string;
}

const NO_FILTERS: Filters = { status: '', advisor: '', course: '', submittedFrom: '', submittedTo: '' };

const isFiltered = (query: StaffSlotChangeRequestQuery) => Object.values(query).some((value) => Boolean(value));

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-900/70 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/60';

/** One short line for the outcome column; the full response lives in the details (req 46). */
const outcomeSummary = (item: StaffSlotChangeRequestItem): React.ReactNode => {
  if (item.status === 'Pending') return <span className="text-slate-500">Awaiting decision</span>;
  if (item.status === 'Withdrawn') {
    return (
      <span className="text-slate-500">
        Withdrawn by student{item.withdrawnAt ? ` · ${formatDate(item.withdrawnAt)}` : ''}
      </span>
    );
  }
  const responder = item.response?.respondedBy;
  return (
    <div className="space-y-0.5">
      {item.status === 'Approved' && item.response?.replacementSlot && (
        <p className="flex items-center gap-1 text-emerald-300">
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          {slotLabel(item.response.replacementSlot)}
        </p>
      )}
      <p className="text-xs text-slate-500">
        {responder ? `${responder.role} · ${responder.name}` : 'Advisor or Coordinator'}
        {item.response?.respondedAt ? ` · ${formatDate(item.response.respondedAt)}` : ''}
      </p>
    </div>
  );
};

/**
 * Req 43: Advisors see slot-change requests from the advising students
 * currently assigned to them; Coordinators see every request. All statuses,
 * newest first. The API decides the scope from the session alone, so this
 * page only reflects it.
 *
 * Req 44: one search box matches a student ID, student name or course code.
 *
 * Req 45: status, Advisor, course and submission-date filters combine with
 * each other and with the search. Everything runs on the server, inside the
 * same scope, so no combination lets an Advisor see another Advisor's
 * students.
 *
 * Req 46: selecting a row (from the plain list, search or filter results)
 * opens its details in a drawer over the list, so closing it returns to the
 * same results with the same search and filters.
 */
const SlotChangeRequestsReviewPage: React.FC = () => {
  const { user } = useSession();
  const [data, setData] = useState<StaffSlotChangeRequestList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [options, setOptions] = useState<StaffSlotChangeFilterOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  /** The search and filters the shown list belongs to, for the summary and no-match messages. */
  const [shownQuery, setShownQuery] = useState<StaffSlotChangeRequestQuery>({});
  /** Req 46: the row whose details are open, or null. */
  const [selected, setSelected] = useState<StaffSlotChangeRequestItem | null>(null);
  // Only the newest request may update the page, so a slow answer to an
  // earlier search or filter can never overwrite the results of a later one.
  const latestRequest = useRef(0);

  // Debounce the search so typing does not fire a request per keystroke.
  // Filters apply immediately: each change is a single deliberate choice.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetchStaffSlotChangeFilterOptions()
      .then(setOptions)
      .catch((err: ApiError) => setOptionsError(err.message || 'Could not load the Advisor and course filters.'));
  }, []);

  const query = useMemo<StaffSlotChangeRequestQuery>(() => ({ search, ...filters }), [search, filters]);

  const load = useCallback(
    async (refresh = false) => {
      const requestId = ++latestRequest.current;
      if (refresh) setIsRefreshing(true);
      else setIsSearching(true);
      setError(null);
      try {
        const result = await fetchStaffSlotChangeRequests(query);
        if (requestId !== latestRequest.current) return;
        setData(result);
        setShownQuery(query);
      } catch (err) {
        if (requestId !== latestRequest.current) return;
        setError((err as ApiError).message || 'Could not load slot-change requests.');
      } finally {
        if (requestId === latestRequest.current) {
          setIsLoading(false);
          setIsRefreshing(false);
          setIsSearching(false);
        }
      }
    },
    [query]
  );

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key: keyof Filters) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((current) => ({ ...current, [key]: event.target.value }));

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
  };

  const clearAll = () => {
    clearSearch();
    setFilters(NO_FILTERS);
  };

  const closeDetails = useCallback(() => setSelected(null), []);
  // The drawer found the request gone or out of scope: refresh the same results.
  const refreshAfterStale = useCallback(() => load(true), [load]);

  const showsAll = data ? data.scope === 'all' : user?.role === 'Coordinator';
  const requests = data?.requests ?? [];
  // Still typing (debounce pending) or waiting on the server.
  const searchPending = isSearching || searchInput.trim() !== search;
  const hasCriteria = Boolean(searchInput.trim()) || isFiltered(filters);
  const shownFiltered = isFiltered(shownQuery);

  const statusOptions = (options?.statuses ?? STATUSES).map((status) => ({ value: status, label: status }));
  const advisorOptions = useMemo(
    () => [
      ...(options?.advisors ?? []).map((advisor) => ({
        value: advisor.id,
        label: showsAll ? advisor.fullName : `${advisor.fullName} (me)`,
      })),
      ...(options?.includesUnassigned ? [{ value: UNASSIGNED_ADVISOR, label: 'Unassigned' }] : []),
    ],
    [options, showsAll]
  );
  const courseOptions = (options?.courses ?? []).map((course) => ({
    value: course.id,
    label: `${course.code} · ${course.name}`,
  }));

  /** A readable summary of the shown criteria, e.g. `"Salma" · Pending · CSEN 501`. */
  const describe = (shown: StaffSlotChangeRequestQuery): string => {
    const parts: string[] = [];
    if (shown.search) parts.push(`"${shown.search}"`);
    if (shown.status) parts.push(shown.status);
    if (shown.advisor) {
      parts.push(
        shown.advisor === UNASSIGNED_ADVISOR
          ? 'Unassigned'
          : options?.advisors.find((advisor) => advisor.id === shown.advisor)?.fullName ?? 'Selected Advisor'
      );
    }
    if (shown.course) parts.push(options?.courses.find((course) => course.id === shown.course)?.code ?? 'Selected course');
    if (shown.submittedFrom && shown.submittedTo) parts.push(`submitted ${shown.submittedFrom} to ${shown.submittedTo}`);
    else if (shown.submittedFrom) parts.push(`submitted from ${shown.submittedFrom}`);
    else if (shown.submittedTo) parts.push(`submitted until ${shown.submittedTo}`);
    return parts.join(' · ');
  };

  return (
    <>
      <PageHeader
        title="Slot-Change Requests"
        description={
          showsAll
            ? 'Every advising-student slot-change request, newest first. Select a request to see its details.'
            : 'Slot-change requests from the advising students assigned to you, newest first. Select a request to see its details.'
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
          <AlertBanner tone="error" title="Could not load requests" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}
      {optionsError && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load the filter choices" onDismiss={() => setOptionsError(null)}>
            {optionsError}
          </AlertBanner>
        </div>
      )}

      <Card tone="raised" className="mb-5 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-300">
            <ListFilter className="h-4 w-4 text-slate-500" aria-hidden />
            <h2 className="text-sm font-semibold">Search and filter</h2>
          </div>
          {hasCriteria && (
            <CustomButton variant="secondary" size="sm" onClick={clearAll} icon={<X className="h-4 w-4" aria-hidden />}>
              Clear all
            </CustomButton>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-6">
            <label
              htmlFor="slot-change-search"
              className="text-xs font-medium uppercase tracking-wide text-slate-400"
            >
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden
              />
              <input
                id="slot-change-search"
                type="search"
                value={searchInput}
                maxLength={STAFF_SEARCH_LIMIT}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Student ID, student name or course code"
                aria-describedby="slot-change-search-hint"
                className={`${inputClass} pl-9 pr-16 [&::-webkit-search-cancel-button]:hidden`}
              />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {searchPending && !isLoading && (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Searching" />
                )}
                {searchInput && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>
            <p id="slot-change-search-hint" className="text-xs text-slate-500">
              Student IDs match exactly, with or without the hyphen (64-30010 or 6430010). Names and course codes
              match partially.
            </p>
          </div>

          <Select
            id="slot-change-status"
            label="Status"
            value={filters.status}
            onChange={setFilter('status')}
            options={statusOptions}
            placeholder="All statuses"
          />

          <Select
            id="slot-change-advisor"
            label="Advisor"
            value={filters.advisor}
            onChange={setFilter('advisor')}
            options={advisorOptions}
            placeholder={showsAll ? 'All Advisors' : 'All my students'}
            disabled={!options}
          />

          <Select
            id="slot-change-course"
            label="Course"
            value={filters.course}
            onChange={setFilter('course')}
            options={courseOptions}
            placeholder={options && courseOptions.length === 0 ? 'No requested courses yet' : 'All courses'}
            disabled={!options || courseOptions.length === 0}
            className="xl:col-span-2"
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="slot-change-from" className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Submitted from
            </label>
            <input
              id="slot-change-from"
              type="date"
              value={filters.submittedFrom}
              max={filters.submittedTo || undefined}
              onChange={setFilter('submittedFrom')}
              className={`${inputClass} px-3`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="slot-change-to" className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Submitted to
            </label>
            <input
              id="slot-change-to"
              type="date"
              value={filters.submittedTo}
              min={filters.submittedFrom || undefined}
              onChange={setFilter('submittedTo')}
              className={`${inputClass} px-3`}
            />
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading slot-change requests...
        </Card>
      ) : requests.length === 0 && shownFiltered ? (
        !error && (
          <EmptyState
            icon={<SearchX className="h-5 w-5" />}
            title={
              shownQuery.search && !isFiltered({ ...shownQuery, search: '' })
                ? `No requests match "${shownQuery.search}"`
                : 'No requests match this search and these filters'
            }
            description={`${describe(shownQuery)}. ${
              showsAll
                ? 'Try fewer filters, a full student ID, part of a student name, or a course code such as CSEN 501.'
                : 'Only requests from the advising students assigned to you are included. Try fewer filters, a full student ID, part of a name, or a course code.'
            }`}
            action={{ label: 'Clear search and filters', onClick: clearAll }}
          />
        )
      ) : requests.length === 0 ? (
        !error && (
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title={showsAll ? 'No slot-change requests yet' : 'No requests from your assigned students'}
            description={
              showsAll
                ? 'Requests appear here once an advising student asks to change a slot in their schedule under review.'
                : 'Requests appear here once one of your assigned advising students asks to change a slot.'
            }
          />
        )
      ) : (
        <Card
          tone="raised"
          className={`overflow-hidden transition-opacity ${isSearching ? 'opacity-60' : ''}`}
          aria-busy={isSearching}
        >
          {shownFiltered && (
            <p className="border-b border-slate-800 px-4 py-2.5 text-xs text-slate-400" aria-live="polite">
              {requests.length} {requests.length === 1 ? 'request matches' : 'requests match'} {describe(shownQuery)}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                  {showsAll && (
                    <th scope="col" className="px-4 py-3 font-semibold">Advisor</th>
                  )}
                  <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Current slot</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Submitted</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {requests.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`cursor-pointer transition-colors hover:bg-slate-800/40 ${
                      selected?.id === item.id ? 'bg-indigo-500/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      {/* Req 46: the keyboard-reachable way to open the details; the row click is a mouse shortcut. */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(item);
                        }}
                        aria-haspopup="dialog"
                        aria-label={`Open request details for ${item.student?.fullName ?? 'a removed student'}, ${
                          item.course?.code ?? 'removed course'
                        } ${item.slotType}`}
                        className="text-left underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      >
                        {item.student ? (
                          <>
                            <span className="block font-medium text-slate-100 hover:text-indigo-300">
                              {item.student.fullName}
                            </span>
                            <span className="block font-mono text-xs text-slate-500">{item.student.studentId}</span>
                          </>
                        ) : (
                          <span className="text-slate-500">Student record removed</span>
                        )}
                      </button>
                    </td>
                    {showsAll && (
                      <td className="px-4 py-3">
                        {item.advisor ? (
                          <span className="text-slate-200">{item.advisor.fullName}</span>
                        ) : (
                          <span className="text-slate-500">Unassigned</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <p className="font-mono font-semibold text-indigo-300">{item.course?.code ?? 'Course removed'}</p>
                      {item.term && <p className="text-xs text-slate-500">{item.term.label}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={SLOT_TONE[item.slotType]}>{item.slotType}</Badge>
                        <span className="whitespace-nowrap text-xs text-slate-300">{slotLabel(item.currentSlot)}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">{formatDate(item.submittedAt)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[item.status]} dot>
                        {item.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">{outcomeSummary(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <SlotChangeRequestDetailDrawer
        selected={selected}
        showsAll={showsAll}
        onClose={closeDetails}
        onStale={refreshAfterStale}
      />
    </>
  );
};

export default SlotChangeRequestsReviewPage;
