import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ListFilter, Loader2, RotateCcw, Search } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';
import { ApiError } from '../lib/api';
import { listAdvisors, type Advisor } from '../lib/advisorService';
import { fetchGraduationPlans } from '../lib/graduationPlansService';
import { formatDate } from '../lib/studentsService';
import type { GraduationPlanSummary } from '../lib/types';

const STATUS_TONE: Record<string, BadgeTone> = {
  Submitted: 'sky',
  Accepted: 'emerald',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All submitted plans' },
  { value: 'Submitted', label: 'Awaiting decision' },
  { value: 'Accepted', label: 'Accepted' },
];

/**
 * Req 110-113: the Coordinator's review queue.
 *
 * Only plans that have left the draft stage are shown, so an Advisor's private
 * draft never appears here. Submitted plans can be filtered by status, Advisor
 * and submission date, or searched by student ID or Advisor name/email.
 */
const CoordinatorGraduationPlansPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [plans, setPlans] = useState<GraduationPlanSummary[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [advisorError, setAdvisorError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [advisor, setAdvisor] = useState('');
  const [submittedFrom, setSubmittedFrom] = useState('');
  const [submittedTo, setSubmittedTo] = useState('');
  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null
  );

  // Debounce the search so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    listAdvisors()
      .then((response) => setAdvisors(response.advisors))
      .catch((err: ApiError) => setAdvisorError(err.message));
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchGraduationPlans({
        status,
        advisor,
        submittedFrom,
        submittedTo,
        search,
      });
      setPlans(response.plans);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsLoading(false);
    }
  }, [advisor, search, status, submittedFrom, submittedTo]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFilters = Boolean(search || status || advisor || submittedFrom || submittedTo);
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setAdvisor('');
    setSubmittedFrom('');
    setSubmittedTo('');
  };

  const advisorOptions = useMemo(
    () => [
      { value: '', label: 'All Advisors' },
      ...advisors.map((entry) => ({
        value: entry._id,
        label: `${entry.fullName} (${entry.email})`,
      })),
    ],
    [advisors]
  );

  const inputClass =
    'w-full rounded-lg border border-outline-variant bg-surface-container-low py-2.5 text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <>
      <PageHeader
        title="Graduation plans"
        description="Review the graduation plans Advisors submitted for their advising students."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      {notice && (
        <div className="mb-4">
          <AlertBanner tone="success" title="Decision recorded" onDismiss={() => setNotice(null)}>
            {notice}
          </AlertBanner>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load graduation plans" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}
      {advisorError && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load Advisor filters" onDismiss={() => setAdvisorError(null)}>
            {advisorError}
          </AlertBanner>
        </div>
      )}

      <Card tone="raised" className="mb-5 p-4">
        <div className="mb-3 flex items-center gap-2 text-on-surface">
          <ListFilter className="h-4 w-4 text-on-surface-variant" aria-hidden />
          <h2 className="text-body font-semibold">Search and filter</h2>
        </div>

        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5 xl:col-span-2">
            <label htmlFor="plan-search" className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
                aria-hidden
              />
              <input
                id="plan-search"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Student ID, Advisor name or GUC email"
                className={`${inputClass} pl-9 pr-3`}
              />
            </div>
          </div>

          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={STATUS_OPTIONS}
          />

          <Select
            label="Advisor"
            value={advisor}
            onChange={(event) => setAdvisor(event.target.value)}
            options={advisorOptions}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="plan-from" className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">
              Submitted from
            </label>
            <input
              id="plan-from"
              type="date"
              value={submittedFrom}
              max={submittedTo || undefined}
              onChange={(event) => setSubmittedFrom(event.target.value)}
              className={`${inputClass} px-3`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="plan-to" className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">
              Submitted to
            </label>
            <input
              id="plan-to"
              type="date"
              value={submittedTo}
              min={submittedFrom || undefined}
              onChange={(event) => setSubmittedTo(event.target.value)}
              className={`${inputClass} px-3`}
            />
          </div>

          <div className="flex items-end">
            <CustomButton
              variant="ghost"
              icon={<RotateCcw className="h-4 w-4" aria-hidden />}
              onClick={clearFilters}
              disabled={!hasFilters}
            >
              Clear filters
            </CustomButton>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading submitted plans...
        </Card>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<ListFilter className="h-5 w-5" aria-hidden />}
          title={hasFilters ? 'No plan matches these filters' : 'No submitted graduation plans yet'}
          description={
            hasFilters
              ? 'Try a different status, Advisor or date range, or clear the filters.'
              : 'A plan appears here once an Advisor submits it. Private drafts stay with their Advisor.'
          }
        />
      ) : (
        <Card tone="raised" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body">
              <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Advisor</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Submitted</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Courses</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {plans.map((plan) => (
                  <tr key={plan.id} className="transition-colors hover:bg-surface-container">
                    <td className="px-4 py-3">
                      {plan.student ? (
                        <>
                          <p className="font-medium text-on-surface">{plan.student.fullName}</p>
                          <p className="font-mono text-caption text-on-surface-variant">
                            {plan.student.studentId} · {plan.student.major}
                          </p>
                        </>
                      ) : (
                        <span className="text-on-surface-variant">Student not found</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {plan.advisor ? (
                        <>
                          <p className="text-on-surface">{plan.advisor.fullName}</p>
                          <p className="text-caption text-on-surface-variant">{plan.advisor.email}</p>
                        </>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {plan.submittedAt ? formatDate(plan.submittedAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-on-surface">{plan.assignedCount}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[plan.status] ?? 'neutral'} dot>
                        {plan.status === 'Submitted' ? 'Awaiting decision' : plan.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <CustomButton
                          variant="ghost"
                          size="sm"
                          icon={<ArrowRight className="h-4 w-4" aria-hidden />}
                          onClick={() => navigate(`/graduation-plans/${plan.id}`)}
                        >
                          Review
                        </CustomButton>
                      </div>
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

export default CoordinatorGraduationPlansPage;
