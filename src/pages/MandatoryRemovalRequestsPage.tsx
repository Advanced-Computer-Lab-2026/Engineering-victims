import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardX, ListFilter, Loader2, Search, X } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import MandatoryRemovalDetailDrawer from '../components/MandatoryRemovalDetailDrawer';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import CustomInput from '../components/ui/CustomInput';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError } from '../lib/api';
import { REMOVAL_STATUS_TONE, REMOVAL_STATUSES } from '../lib/mandatoryRemovalDisplay';
import { fetchMandatoryRemovalRequests, NO_REMOVAL_QUERY, REMOVAL_SEARCH_LIMIT } from '../lib/mandatoryRemovalService';
import { formatDate } from '../lib/studentsService';
import type { MandatoryRemovalListResponse, MandatoryRemovalQuery, MandatoryRemovalRequestSummary } from '../lib/types';

const hasCriteria = (query: MandatoryRemovalQuery) => Object.values(query).some((value) => Boolean(value));

/**
 * Req 65: a Coordinator views the list of mandatory-course removal requests.
 * Req 66: ...and searches it using a student ID, a course code, or an Advisor's
 * name or GUC email.
 * Req 67: ...and filters it by Advisor, request status and submission date.
 * Req 68: ...and opens a request from the displayed results to see its details.
 *
 * The search runs when Search is pressed; each filter applies as soon as it
 * changes, like the slot-change list (req 45). Everything combines.
 */
const MandatoryRemovalRequestsPage: React.FC = () => {
  usePageTitle('Mandatory-course removal requests');

  const [requests, setRequests] = useState<MandatoryRemovalRequestSummary[]>([]);
  const [advisors, setAdvisors] = useState<MandatoryRemovalListResponse['advisors']>([]);
  const [applied, setApplied] = useState<MandatoryRemovalQuery>(NO_REMOVAL_QUERY);
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState<MandatoryRemovalRequestSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the newest load may update the list, so a slow earlier answer cannot overwrite it.
  const latestLoad = useRef(0);

  const load = useCallback(async (query: MandatoryRemovalQuery, { silent = false } = {}) => {
    const ticket = ++latestLoad.current;
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const response = await fetchMandatoryRemovalRequests(query);
      if (ticket !== latestLoad.current) return;
      setRequests(response.requests);
      setAdvisors(response.advisors);
    } catch (err) {
      if (ticket !== latestLoad.current) return;
      setRequests([]);
      setError((err as ApiError).message);
    } finally {
      if (ticket === latestLoad.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(applied);
  }, [applied, load]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setApplied((current) => ({ ...current, search: searchInput.trim() }));
  };

  const setFilter = (key: Exclude<keyof MandatoryRemovalQuery, 'search'>) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setApplied((current) => ({ ...current, [key]: event.target.value }));

  const clearAll = () => {
    setSearchInput('');
    setApplied(NO_REMOVAL_QUERY);
  };

  const criteria = hasCriteria(applied) || Boolean(searchInput.trim());
  const filtered = hasCriteria(applied);

  const statusOptions = REMOVAL_STATUSES.map((status) => ({ value: status, label: status }));
  const advisorOptions = useMemo(
    () => advisors.map((advisor) => ({ value: advisor.id, label: `${advisor.fullName} (${advisor.email})` })),
    [advisors]
  );

  // Req 69: after a decision, refresh the list behind the drawer with the same search and filters.
  const refreshQuietly = useCallback(() => void load(applied, { silent: true }), [applied, load]);

  return (
    <>
      <PageHeader
        title="Mandatory-course removal requests"
        description="Requests from Advisors to remove a mandatory course from a student's list."
        meta={
          !isLoading && !error ? (
            <Badge tone="neutral">
              {requests.length} {requests.length === 1 ? 'request' : 'requests'}
              {filtered ? ' found' : ''}
            </Badge>
          ) : undefined
        }
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      <Card tone="raised" className="mb-5 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <ListFilter className="h-4 w-4" aria-hidden />
            <h2 className="text-body font-semibold">Search and filter</h2>
          </div>
          {criteria && (
            <CustomButton variant="secondary" size="sm" onClick={clearAll} icon={<X className="h-4 w-4" aria-hidden />}>
              Clear all
            </CustomButton>
          )}
        </div>

        <form role="search" onSubmit={submitSearch} className="flex flex-col gap-2 md:flex-row md:items-end">
          <CustomInput
            type="search"
            label="Search requests"
            icon={<Search className="h-4 w-4" aria-hidden />}
            placeholder="Student ID, course code, or Advisor name or email"
            maxLength={REMOVAL_SEARCH_LIMIT}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="md:max-w-md"
          />
          <CustomButton type="submit" icon={<Search className="h-4 w-4" aria-hidden />} disabled={isLoading}>
            Search
          </CustomButton>
        </form>
        <p className="mb-4 mt-2 text-caption text-on-surface-variant">
          Matches a student ID, a course code, or an Advisor&apos;s name or GUC email.
        </p>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select
            id="removal-status"
            label="Status"
            value={applied.status}
            onChange={setFilter('status')}
            options={statusOptions}
            placeholder="All statuses"
          />
          <Select
            id="removal-advisor"
            label="Advisor"
            value={applied.advisor}
            onChange={setFilter('advisor')}
            options={advisorOptions}
            placeholder={advisorOptions.length === 0 ? 'No Advisor has asked yet' : 'All Advisors'}
            disabled={advisorOptions.length === 0 && !applied.advisor}
          />
          <CustomInput
            id="removal-from"
            type="date"
            label="Submitted from"
            value={applied.submittedFrom}
            max={applied.submittedTo || undefined}
            onChange={setFilter('submittedFrom')}
          />
          <CustomInput
            id="removal-to"
            type="date"
            label="Submitted to"
            value={applied.submittedTo}
            min={applied.submittedFrom || undefined}
            onChange={setFilter('submittedTo')}
          />
        </div>
      </Card>

      {error ? (
        <div className="space-y-3">
          <AlertBanner tone="error" title="Could not load the removal requests">
            {error}
          </AlertBanner>
          <CustomButton variant="secondary" onClick={() => void load(applied)}>
            Try again
          </CustomButton>
        </div>
      ) : isLoading ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-12 text-body text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading removal requests...
        </Card>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<ClipboardX className="h-5 w-5" aria-hidden />}
          title={filtered ? 'No matching requests' : 'No removal requests yet'}
          description={
            filtered
              ? 'No request matches the current search and filters. Clear them to see every request.'
              : 'Requests appear here after an Advisor asks to remove a mandatory course.'
          }
          action={filtered ? { label: 'Clear search and filters', onClick: clearAll } : undefined}
        />
      ) : (
        <Card tone="raised" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-body">
              <caption className="sr-only">Mandatory-course removal requests, newest first</caption>
              <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Advisor</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Case</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {requests.map((request) => (
                  <tr
                    key={request.id}
                    onClick={() => setSelected(request)}
                    className={`cursor-pointer align-top transition-colors hover:bg-surface-container ${
                      selected?.id === request.id ? 'bg-primary-container' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      {/* Req 68: the keyboard-reachable way to open the details; the row click is a mouse shortcut. */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(request);
                        }}
                        aria-haspopup="dialog"
                        aria-label={`Open request details for ${request.student?.fullName ?? 'a removed student'}, ${
                          request.course?.code ?? 'removed course'
                        }`}
                        className="text-left underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span className="block font-medium text-on-surface hover:text-primary">
                          {request.student?.fullName ?? 'Unknown student'}
                        </span>
                        <span className="block font-mono text-caption text-on-surface-variant">
                          {request.student?.studentId ?? '—'}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-caption text-on-surface">{request.course?.code ?? '—'}</p>
                      <p className="text-on-surface-variant">{request.course?.name ?? ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-on-surface">{request.advisor?.fullName ?? 'Unknown Advisor'}</p>
                      <p className="text-caption text-on-surface-variant">{request.advisor?.email ?? ''}</p>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{request.category}</td>
                    <td className="px-4 py-3">
                      <Badge tone={REMOVAL_STATUS_TONE[request.status]} dot>
                        {request.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">{formatDate(request.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <MandatoryRemovalDetailDrawer
        selected={selected}
        onClose={() => setSelected(null)}
        onStale={refreshQuietly}
        onDecided={refreshQuietly}
      />
    </>
  );
};

export default MandatoryRemovalRequestsPage;
