import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ClipboardList, Loader2, RotateCcw, Search, SearchX, X } from 'lucide-react';
import type { ApiError } from '../lib/api';
import type { SlotChangeRequestStatus, StaffSlotChangeRequestItem, StaffSlotChangeRequestList } from '../lib/types';
import { fetchStaffSlotChangeRequests, STAFF_SEARCH_LIMIT } from '../lib/slotChangeRequestsService';
import { formatDate } from '../lib/studentsService';
import { useSession } from '../hooks/useSession';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';

const STATUS_TONE: Record<SlotChangeRequestStatus, BadgeTone> = {
  Pending: 'amber',
  Approved: 'emerald',
  Rejected: 'rose',
  Withdrawn: 'neutral',
};

const SLOT_TONE: Record<StaffSlotChangeRequestItem['slotType'], BadgeTone> = {
  Lecture: 'indigo',
  Tutorial: 'sky',
  Lab: 'emerald',
};

type Slot = StaffSlotChangeRequestItem['currentSlot'];

const slotLabel = (slot: Slot) => `Group ${slot.groupNumber} · ${slot.dayOfWeek} ${slot.startTime}–${slot.endTime}`;

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
 * The search runs on the server, inside the same scope, so an Advisor can
 * never find another Advisor's students. Filters and details are later
 * requirements.
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
  /** The search the shown list belongs to, so the no-match message names it. */
  const [shownSearch, setShownSearch] = useState('');
  // Only the newest request may update the page, so a slow answer to an
  // earlier search can never overwrite the results of a later one.
  const latestRequest = useRef(0);

  // Debounce the search so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (refresh = false) => {
      const requestId = ++latestRequest.current;
      if (refresh) setIsRefreshing(true);
      else setIsSearching(true);
      setError(null);
      try {
        const result = await fetchStaffSlotChangeRequests({ search });
        if (requestId !== latestRequest.current) return;
        setData(result);
        setShownSearch(search);
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
    [search]
  );

  useEffect(() => {
    load();
  }, [load]);

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
  };

  const showsAll = data ? data.scope === 'all' : user?.role === 'Coordinator';
  const requests = data?.requests ?? [];
  // Still typing (debounce pending) or waiting on the server.
  const searchPending = isSearching || searchInput.trim() !== search;

  return (
    <>
      <PageHeader
        title="Slot-Change Requests"
        description={
          showsAll
            ? 'Every advising-student slot-change request, newest first.'
            : 'Slot-change requests from the advising students assigned to you, newest first.'
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

      <Card tone="raised" className="mb-5 p-4">
        <label
          htmlFor="slot-change-search"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400"
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
            className="w-full rounded-lg border border-slate-700 bg-slate-900/70 py-2.5 pl-9 pr-16 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 [&::-webkit-search-cancel-button]:hidden"
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
        <p id="slot-change-search-hint" className="mt-1.5 text-xs text-slate-500">
          Student IDs match exactly, with or without the hyphen (64-30010 or 6430010). Names and course codes match
          partially.
        </p>
      </Card>

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading slot-change requests...
        </Card>
      ) : requests.length === 0 && shownSearch ? (
        !error && (
          <EmptyState
            icon={<SearchX className="h-5 w-5" />}
            title={`No requests match "${shownSearch}"`}
            description={
              showsAll
                ? 'Try a full student ID, part of a student name, or a course code such as CSEN 501.'
                : 'Only requests from the advising students assigned to you are searched. Try a full student ID, part of a name, or a course code.'
            }
            action={{ label: 'Clear search', onClick: clearSearch }}
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
          {shownSearch && (
            <p className="border-b border-slate-800 px-4 py-2.5 text-xs text-slate-400" aria-live="polite">
              {requests.length} {requests.length === 1 ? 'request matches' : 'requests match'} "{shownSearch}"
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
                  <tr key={item.id} className="transition-colors hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      {item.student ? (
                        <>
                          <p className="font-medium text-slate-100">{item.student.fullName}</p>
                          <p className="font-mono text-xs text-slate-500">{item.student.studentId}</p>
                        </>
                      ) : (
                        <span className="text-slate-500">Student record removed</span>
                      )}
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
    </>
  );
};

export default SlotChangeRequestsReviewPage;
