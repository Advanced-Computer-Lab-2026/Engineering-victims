import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, ClipboardList } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import CustomInput from '../components/ui/CustomInput';
import EmptyState from '../components/ui/EmptyState';
import ExtraHoursHistoryTimeline from '../components/ExtraHoursHistoryTimeline';
import { fetchExtraHoursRequests, fetchExtraHoursRequest, fetchExtraHoursAdvisors, decideExtraHoursRequest, type ExtraHoursFilters, type ExtraHoursSummary, type ExtraHoursDetail } from '../lib/extraHoursReviewService';

const date = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';
const money = (value: number) => `EGP ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const message = (error: unknown) => error instanceof Error ? error.message : 'Could not load extra-hours requests.';
const CHECK_LABELS: Record<string, string> = {
  ADVISING_STUDENT: 'Advising-student eligibility', ACTIVE_STUDENT: 'Active account', VALID_SEMESTER: 'Semester information',
  ACADEMIC_HISTORY: 'Academic records', NOT_ON_PROBATION: 'No probation restriction', GRADUATION_EVIDENCE: 'Graduation evidence',
  SELECTED_COURSES: 'Selected courses', COURSES_REQUESTED: 'Requested courses', EXTRA_HOURS_NEEDED: 'Extra-hours necessity',
  REQUEST_COVERS_EXCESS: 'Coverage of additional hours', TOTAL_LIMIT: 'Projected-hour limit', REQUEST_LIMIT: 'Requested-hour increase',
};
const checkLabel = (code: string, detail: ExtraHoursDetail) => {
  if (CHECK_LABELS[code]) return CHECK_LABELS[code];
  const course = detail.items.find((item) => code.endsWith(item.courseId));
  const label = code.startsWith('NOT_PASSED_') ? 'Not already passed' : code.startsWith('CREDIT_CONSISTENCY_') ? 'Consistent course credits' : 'Course eligibility';
  return course ? `${course.code}: ${label}` : label;
};
const ExtraHoursRequestsPage: React.FC = () => {
  const [rows, setRows] = useState<ExtraHoursSummary[]>([]);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ExtraHoursFilters>({});
  const [advisors, setAdvisors] = useState<{ id: string; name: string; email: string }[]>([]);
  const [advisorError, setAdvisorError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetchExtraHoursAdvisors().then((result) => { if (active) setAdvisors(result.advisors); })
      .catch((err) => { if (active) setAdvisorError(message(err)); });
    return () => { active = false; };
  }, []);
  const filtered = Object.values(filters).some(Boolean);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [detail, setDetail] = useState<ExtraHoursDetail | null>(null);
  const [responseNote, setResponseNote] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true); setError(null);
    try {
      const response = await fetchExtraHoursRequests(page, search, filters);
      if (current !== version.current) return;
      if (page > 1 && page > response.pagination.totalPages) { setPage(Math.max(1, response.pagination.totalPages)); return; }
      setRows(response.requests); setTotal(response.pagination.total); setPages(response.pagination.totalPages);
    } catch (err) { if (current === version.current) setError(message(err)); }
    finally { if (current === version.current) setLoading(false); }
  }, [page, search, filters]);
  useEffect(() => { void load(); return () => { version.current += 1; }; }, [load]);
  const open = async (id: string) => {
    setOpening(true); setError(null); setSuccess(null); setResponseNote('');
    try { setDetail((await fetchExtraHoursRequest(id)).request); window.scrollTo({ top: 0 }); }
    catch (err) { setError(message(err)); }
    finally { setOpening(false); }
  };
  const decide = async (decision: 'Approved' | 'Rejected') => {
    if (!detail || deciding || !responseNote.trim()) return;
    setDeciding(true); setError(null); setSuccess(null);
    try {
      const result = await decideExtraHoursRequest(detail.id, decision, responseNote.trim());
      setSuccess(result.message);
      setDetail((await fetchExtraHoursRequest(detail.id)).request);
      setResponseNote('');
      void load();
    } catch (err) { setError(message(err)); }
    finally { setDeciding(false); }
  };
  return <>
    <PageHeader title="Extra-hours requests" description="Review submitted requests, eligibility checks and itemized costs." onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      meta={detail ? <CustomButton size="sm" variant="secondary" disabled={deciding} onClick={() => { setDetail(null); setError(null); setSuccess(null); }}>Back to requests</CustomButton>
        : <CustomButton size="sm" variant="secondary" disabled={loading || opening} onClick={() => void load()}>Refresh</CustomButton>} />
    {error && <div className="mb-4"><AlertBanner tone="error">{error}</AlertBanner></div>}
    {success && <div className="mb-4"><AlertBanner tone="success">{success}</AlertBanner></div>}
    {!detail && advisorError && <div className="mb-4"><AlertBanner tone="error">{advisorError} Reload the page to retry.</AlertBanner></div>}
    {!detail && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {([
        ['advisor', 'Requesting Advisor', advisors.map((advisor) => [advisor.id, `${advisor.name} (${advisor.email})`])],
        ['decision', 'Coordinator decision', ['Pending', 'Approved', 'Rejected', 'Withdrawn'].map((value) => [value, value])],
        ['settlementOption', 'Settlement option', ['Not selected', 'Wallet', 'Gateway', 'Next Installment'].map((value) => [value, value])],
        ['settlementStatus', 'Settlement status', ['Not Applicable', 'Awaiting Payment Choice', 'Paid', 'Deferred to Next Installment', 'Failed', 'Cancelled', 'Refunded'].map((value) => [value, value])],
      ] as [keyof ExtraHoursFilters, string, string[][]][]).map(([key, label, options]) => <label key={key} className="text-sm text-slate-300">{label}
        <select className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100" value={filters[key] ?? ''} disabled={opening}
          onChange={(event) => { setFilters((current) => ({ ...current, [key]: event.target.value })); setPage(1); }}>
          <option value="">All</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </label>)}
    </div>}
    {!detail && <form className="mb-5 flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      const next = searchInput.trim();
      if (page === 1 && next === search) void load();
      else { setPage(1); setSearch(next); }
    }}>
      <CustomInput type="search" label="Search by student ID" placeholder="e.g. 64-40077" hint="Enter a full or partial student ID." maxLength={32} pattern="[0-9\-]*"
        value={searchInput} disabled={opening} onChange={(event) => setSearchInput(event.target.value)} className="max-w-sm" />
      <CustomButton type="submit" size="sm" disabled={loading || opening}>Search</CustomButton>
      <CustomButton size="sm" variant="secondary" disabled={opening || (!searchInput && !search)} onClick={() => { setSearchInput(''); setSearch(''); setPage(1); if (!search && page === 1) void load(); }}>Clear search</CustomButton>
      <CustomButton size="sm" variant="secondary" disabled={opening || (!filtered && !search && !searchInput)} onClick={() => { setFilters({}); setSearchInput(''); setSearch(''); setPage(1); }}>Clear all filters</CustomButton>
    </form>}
    {detail ? <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <h2 className="break-all text-lg font-semibold text-white">{detail.reference}</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-400">Student</dt><dd className="text-slate-100">{detail.student?.name ?? 'Student record unavailable'} · {detail.student?.studentId}</dd><dd className="text-xs text-slate-400">{detail.student?.email}</dd></div>
          <div><dt className="text-slate-400">Requesting Advisor</dt><dd className="text-slate-100">{detail.requestingAdvisor?.name ?? 'Advisor record unavailable'}</dd><dd className="text-xs text-slate-400">{detail.requestingAdvisor?.email}</dd></div>
          <div><dt className="text-slate-400">Academic term</dt><dd className="text-slate-100">{detail.term?.label ?? 'Term record unavailable'}</dd></div>
          <div><dt className="text-slate-400">Submitted</dt><dd className="text-slate-100">{date(detail.submittedAt)}</dd></div>
          <div><dt className="text-slate-400">Coordinator decision</dt><dd className="text-slate-100">{detail.decision}</dd></div>
          <div><dt className="text-slate-400">Settlement</dt><dd className="text-slate-100">{detail.settlementStatus} · {detail.settlementOption ?? 'Not selected'}</dd></div>
        </dl>
        {detail.responseNote && <p className="whitespace-pre-wrap text-sm text-slate-300">Response: {detail.responseNote} ({date(detail.decidedAt)})</p>}
      </Card>
      <Card className="p-5"><h2 className="mb-3 font-semibold text-white">Courses and itemized cost</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[38rem] text-left text-sm text-slate-300"><caption className="sr-only">Requested courses, hours and itemized EGP costs</caption>
          <thead><tr><th>Course</th><th>Course credits</th><th>Requested hours</th><th>Type</th><th>EGP/hour</th><th>Subtotal</th></tr></thead>
          <tbody>{detail.items.map((item) => <tr key={item.courseId} className="border-t border-slate-800"><td className="py-3">{item.code}<span className="block text-xs text-slate-400">{item.name}</span></td><td>{item.creditHours}</td><td>{item.requestedHours}</td><td>{item.classification}</td><td>{item.ratePerHour.toLocaleString()}</td><td>{money(item.subtotal)}</td></tr>)}</tbody>
        </table></div><p className="mt-4 font-semibold text-white">{detail.requestedHours} requested extra hours · Total: {money(detail.totalCost)}</p>
      </Card>
      <Card className="space-y-3 p-5"><h2 className="font-semibold text-white">Eligibility at submission</h2>
        <p className="text-xs text-slate-400">Recorded {date(detail.eligibilityRecordedAt)}. These are saved submission checks, not a new approval.</p>
        <p className="text-sm text-slate-200">Standard allowance: {detail.eligibility.standardHours} · Allowed: {detail.eligibility.allowedHours} · Projected: {detail.eligibility.selectedHours} · Maximum: {detail.eligibility.maximumTotalHours} hours</p>
        <p className="text-sm text-slate-300">GPA: {detail.eligibility.gpa == null ? 'Not graded yet' : detail.eligibility.gpa.toFixed(2)} · {detail.eligibility.graduationBasis}</p>
        <ul className="space-y-2">{detail.eligibility.checks.map((check, index) => <li key={`${check.code}-${index}`} className="text-sm text-slate-300"><Badge tone={check.passed ? 'emerald' : 'rose'}>{check.passed ? 'Passed' : 'Failed'}</Badge> {checkLabel(check.code, detail)}{!check.passed && ` — ${check.message}`}</li>)}</ul>
      </Card>
      <Card className="p-5"><h2 className="mb-3 font-semibold text-white">Status and decision history</h2>
        <ExtraHoursHistoryTimeline events={detail.history ?? []} decision={detail.decision} settlementStatus={detail.settlementStatus} /></Card>
      {detail.decision === 'Pending' && <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-white">Coordinator decision</h2>
        <p className="text-sm text-slate-300">Approval rechecks current eligibility and itemized cost and makes the request available for settlement. It does not activate extra hours, add courses or take payment.</p>
        <label className="block text-sm text-slate-300">Response note (required)
          <textarea className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-slate-100" rows={3} maxLength={2000} value={responseNote} disabled={deciding} onChange={(event) => setResponseNote(event.target.value)} />
        </label>
        <div className="flex gap-3"><CustomButton disabled={deciding || !responseNote.trim()} onClick={() => void decide('Approved')}>{deciding ? 'Saving…' : 'Approve for settlement'}</CustomButton>
          <CustomButton variant="secondary" disabled={deciding || !responseNote.trim()} onClick={() => void decide('Rejected')}>Reject request</CustomButton></div>
      </Card>}
    </div> : loading ? <Card className="flex items-center justify-center gap-2 p-12 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading requests…</Card>
      : rows.length === 0 ? <EmptyState icon={<ClipboardList className="h-5 w-5" />} title={search || filtered ? 'No matching requests' : 'No extra-hours requests'} description={search || filtered ? 'No requests match the current search and filters. Clear all filters to see all requests.' : 'Requests submitted by Advisors will appear here.'} />
      : <><p className="mb-3 text-sm text-slate-400">{total} requests · Page {page} of {pages}</p>
        <Card className="overflow-x-auto"><table className="w-full min-w-[60rem] text-left text-sm"><caption className="sr-only">All extra-hours requests</caption><thead className="text-xs uppercase text-slate-400"><tr>{['Student', 'Advisor', 'Hours / cost', 'Decision', 'Settlement', 'Submitted', 'Details'].map((title) => <th key={title} className="p-3">{title}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-800 text-slate-300"><td className="p-3">{row.student?.name ?? 'Unavailable student'}<span className="block text-xs text-slate-400">{row.student?.studentId}</span></td><td className="p-3">{row.requestingAdvisor?.name ?? 'Unavailable advisor'}</td><td className="p-3">{row.requestedHours} hours<span className="block text-xs">{money(row.totalCost)}</span></td><td className="p-3">{row.decision}</td><td className="p-3">{row.settlementStatus}<span className="block text-xs">{row.settlementOption ?? 'Not selected'}</span></td><td className="p-3 text-xs">{date(row.submittedAt)}</td><td className="p-3"><CustomButton size="sm" variant="secondary" disabled={opening} aria-label={`View request ${row.reference}`} onClick={() => void open(row.id)}>View details</CustomButton></td></tr>)}</tbody>
        </table></Card>
        <div className="mt-4 flex gap-2"><CustomButton size="sm" variant="secondary" disabled={page === 1 || opening} onClick={() => setPage((current) => current - 1)}>Previous</CustomButton><CustomButton size="sm" variant="secondary" disabled={page >= pages || opening} onClick={() => setPage((current) => current + 1)}>Next</CustomButton></div>
      </>}
  </>;
};
export default ExtraHoursRequestsPage;
