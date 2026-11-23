import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardX, Loader2, Search } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import CustomInput from '../components/ui/CustomInput';
import EmptyState from '../components/ui/EmptyState';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError } from '../lib/api';
import { fetchMandatoryRemovalRequests, REMOVAL_SEARCH_LIMIT } from '../lib/mandatoryRemovalService';
import { formatDate } from '../lib/studentsService';
import type { MandatoryRemovalRequestSummary, MandatoryRemovalStatus } from '../lib/types';

const STATUS_TONE: Record<MandatoryRemovalStatus, 'amber' | 'emerald' | 'neutral'> = {
  Pending: 'amber',
  Approved: 'emerald',
  Rejected: 'neutral',
};

/**
 * Req 65: a Coordinator views the list of mandatory-course removal requests.
 * Req 66: ...and searches it using a student ID, a course code, or an Advisor's
 * name or GUC email.
 */
const MandatoryRemovalRequestsPage: React.FC = () => {
  usePageTitle('Mandatory-course removal requests');

  const [requests, setRequests] = useState<MandatoryRemovalRequestSummary[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the newest search may update the list, so a slow earlier answer cannot overwrite it.
  const latestLoad = useRef(0);

  const load = useCallback(async (search: string) => {
    const ticket = ++latestLoad.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchMandatoryRemovalRequests(search);
      if (ticket !== latestLoad.current) return;
      setRequests(response.requests);
    } catch (err) {
      if (ticket !== latestLoad.current) return;
      setRequests([]);
      setError((err as ApiError).message);
    } finally {
      if (ticket === latestLoad.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const term = searchInput.trim();
    setAppliedSearch(term);
    void load(term);
  };

  const clearSearch = () => {
    setSearchInput('');
    setAppliedSearch('');
    void load('');
  };

  const hasSearch = Boolean(appliedSearch);

  return (
    <>
      <PageHeader
        title="Mandatory-course removal requests"
        description="Requests from Advisors to remove a mandatory course from a student's list."
        meta={
          !isLoading && !error ? (
            <Badge tone="neutral">
              {requests.length} {requests.length === 1 ? 'request' : 'requests'}
              {hasSearch ? ' found' : ''}
            </Badge>
          ) : undefined
        }
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      <form role="search" onSubmit={submitSearch} className="mb-2 flex flex-col gap-2 md:flex-row md:items-end">
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
        {(searchInput || hasSearch) && (
          <CustomButton type="button" variant="secondary" onClick={clearSearch} disabled={isLoading}>
            Clear search
          </CustomButton>
        )}
      </form>
      <p className="mb-4 text-caption text-on-surface-variant">
        Matches a student ID, a course code, or an Advisor&apos;s name or GUC email.
      </p>

      {error ? (
        <div className="space-y-3">
          <AlertBanner tone="error" title="Could not load the removal requests">
            {error}
          </AlertBanner>
          <CustomButton variant="secondary" onClick={() => void load(appliedSearch)}>
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
          title={hasSearch ? 'No matching requests' : 'No removal requests yet'}
          description={
            hasSearch
              ? `No request matches “${appliedSearch}”. Check the student ID, the course code, or the Advisor's name or email.`
              : 'Requests appear here after an Advisor asks to remove a mandatory course.'
          }
          action={hasSearch ? { label: 'Clear search', onClick: clearSearch } : undefined}
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
                  <tr key={request.id} className="align-top hover:bg-surface-container">
                    <td className="px-4 py-3">
                      <p className="text-on-surface">{request.student?.fullName ?? 'Unknown student'}</p>
                      <p className="font-mono text-caption text-on-surface-variant">{request.student?.studentId ?? '—'}</p>
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
                      <Badge tone={STATUS_TONE[request.status]} dot>
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
    </>
  );
};

export default MandatoryRemovalRequestsPage;
