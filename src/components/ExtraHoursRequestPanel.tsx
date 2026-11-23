import React, { useRef, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import Card from './ui/Card';
import Select from './ui/Select';
import CustomButton from './ui/CustomButton';
import AlertBanner from './ui/AlertBanner';
import ConfirmDialog from './ui/ConfirmDialog';
import ExtraHoursHistoryTimeline from './ExtraHoursHistoryTimeline';
import { fetchAdvisorRequestHistory, type RequestHistory } from '../lib/extraHoursFinanceService';

interface Context {
  student: { name: string; studentId: string };
  termId: string;
  terms: { id: string; label: string }[];
  deadlinePassed: boolean;
  advisingDeadline: string;
  graduationVerified: boolean;
  selectedHours: number;
  courses: { id: string; code: string; name: string; creditHours: number; alreadySelected: boolean }[];
  requests: { id: string; reference: string; requestedHours: number; totalCost: number; decision: string;
    settlementStatus?: string; reversed?: boolean; cancellationRequestedAt?: string | null }[];
}
interface Quote {
  eligible: boolean;
  standardHours: number;
  selectedHours: number;
  maximumTotalHours: number;
  requestedHours: number;
  totalCost: number;
  issues: { code: string; message: string }[];
  items: { course: string; code: string; classification: string; requestedHours: number; ratePerHour: number; subtotal: number }[];
}
const errorText = (error: unknown) => {
  if (error instanceof ApiError) {
    const data = error.data as { issues?: { message: string }[] } | undefined;
    return data?.issues?.length ? `${error.message} ${data.issues.map((issue) => issue.message).join(' ')}` : error.message;
  }
  return error instanceof Error ? error.message : 'Could not complete the extra-hours request.';
};
const ExtraHoursRequestPanel: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<Context | null>(null);
  const [hours, setHours] = useState<Record<string, number>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [withdrawal, setWithdrawal] = useState<Context['requests'][number] | null>(null);
  // Reqs 96, 102, 120: ask a Coordinator to refund or cancel an approved, settled request.
  const [cancellation, setCancellation] = useState<Context['requests'][number] | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  // Req 95: status and decision history of one of this Advisor's requests.
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<RequestHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const toggleHistory = async (id: string) => {
    if (historyFor === id) { setHistoryFor(null); return; }
    setHistoryFor(id); setHistory(null); setHistoryError(null);
    try { const result = await fetchAdvisorRequestHistory(id); setHistory(result.history); }
    catch (err) { setHistoryError(errorText(err)); }
  };
  const submissionKey = useRef('');
  const loadVersion = useRef(0);
  const load = async (termId?: string) => {
    const version = ++loadVersion.current;
    setBusy(true); setError(null); setQuote(null); setHours({});
    try {
      const next = await apiFetch<Context>(`/api/extra-hours/context/${studentId}${termId ? `?termId=${encodeURIComponent(termId)}` : ''}`);
      if (version === loadVersion.current) setContext(next);
    } catch (err) { if (version === loadVersion.current) { setContext(null); setError(errorText(err)); } }
    finally { if (version === loadVersion.current) setBusy(false); }
  };
  const changeHours = (next: Record<string, number>) => {
    setHours(next); setQuote(null); setSuccess(null); setError(null);
    submissionKey.current = crypto.randomUUID();
  };
  const selection = () => ({ studentId, termId: context!.termId,
    items: Object.entries(hours).map(([courseId, requestedHours]) => ({ courseId, requestedHours })) });
  const preview = async () => {
    setBusy(true); setError(null); setQuote(null); setSuccess(null);
    try { setQuote(await apiFetch<Quote>('/api/extra-hours/quote', { method: 'POST', body: JSON.stringify(selection()) })); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!quote?.eligible || !context) return;
    setBusy(true); setError(null);
    try {
      const result = await apiFetch<{ request: { reference: string }; message: string }>('/api/extra-hours', {
        method: 'POST', body: JSON.stringify({ ...selection(), submissionKey: submissionKey.current }),
      });
      setSuccess(`${result.request.reference}: ${result.message}`);
      await load(context.termId);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  const withdraw = async () => {
    if (!withdrawal || busy) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const result = await apiFetch<{ request: { id: string; decision: string }; message: string }>(`/api/extra-hours/${withdrawal.id}/withdraw`, { method: 'POST', body: '{}' });
      setContext((current) => current && ({ ...current, requests: current.requests.map((request) => request.id === result.request.id ? { ...request, decision: result.request.decision } : request) }));
      setSuccess(result.message); setWithdrawal(null);
    } catch (err) { setError(errorText(err)); setWithdrawal(null); }
    finally { setBusy(false); }
  };
  const canRequestCancellation = (request: Context['requests'][number]) => request.decision === 'Approved' && !request.reversed
    && !request.cancellationRequestedAt && ['Paid', 'Deferred to Next Installment'].includes(request.settlementStatus ?? '');
  const requestCancellation = async () => {
    if (!cancellation || busy || cancelReason.trim().length < 5) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const result = await apiFetch<{ request: { id: string; cancellationRequestedAt: string }; message: string }>(`/api/extra-hours/${cancellation.id}/request-cancellation`, { method: 'POST', body: JSON.stringify({ reason: cancelReason.trim() }) });
      setContext((current) => current && ({ ...current, requests: current.requests.map((request) => request.id === result.request.id ? { ...request, cancellationRequestedAt: result.request.cancellationRequestedAt } : request) }));
      setSuccess(result.message);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); setCancellation(null); setCancelReason(''); }
  };
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-body-lg font-semibold text-on-surface">Extra-hours request</h3>
      {!open ? <CustomButton size="sm" variant="secondary" onClick={() => { setOpen(true); void load(); }}>Request extra credit hours</CustomButton> : <div className="space-y-4">
        <p className="text-body text-on-surface-variant">Choose the courses and billable extra hours to request. Approval and settlement are required before hours can be activated.</p>
        {busy && <p role="status" className="text-body text-on-surface-variant">Loading or validating request…</p>}
        {error && <AlertBanner tone="error">{error}</AlertBanner>}
        {success && <AlertBanner tone="success">{success}</AlertBanner>}
        {!context && !busy && <CustomButton size="sm" onClick={() => void load()}>Retry</CustomButton>}
        {context && <>
          <Select label="Draft term" value={context.termId} disabled={busy} options={context.terms.map((term) => ({ value: term.id, label: term.label }))} onChange={(event) => { setSuccess(null); void load(event.target.value); }} />
          <p className="text-body text-on-surface-variant">Current draft: {context.selectedHours} credit hours.</p>
          <p className="text-caption text-on-surface-variant">{context.graduationVerified ? 'An accepted graduation plan currently verifies completion within one year.' : 'Graduation within one year is not verified. The normal maximum increase of three hours applies.'}</p>
          {context.deadlinePassed ? <AlertBanner tone="info">The advising deadline ({new Date(context.advisingDeadline).toLocaleDateString()}) has passed. Requests are closed for this term.</AlertBanner> : <>
            {context.courses.length === 0 && <AlertBanner tone="info">No eligible published courses are available for this term.</AlertBanner>}
            <fieldset disabled={busy} className="space-y-3">
              <legend className="mb-2 text-body font-medium text-on-surface">Courses and requested extra hours</legend>
              {context.courses.map((course) => <div key={course.id} className="rounded-lg border border-outline-variant p-3">
                <label className="flex items-start gap-2 text-body text-on-surface">
                  <input type="checkbox" checked={Object.prototype.hasOwnProperty.call(hours, course.id)} onChange={(event) => {
                    const next = { ...hours }; if (event.target.checked) next[course.id] = course.creditHours; else delete next[course.id]; changeHours(next);
                  }} className="mt-1" />
                  <span>{course.code} — {course.name}<span className="block text-caption text-on-surface-variant">{course.creditHours} course credits{course.alreadySelected ? ' · already in draft' : ''}</span></span>
                </label>
                {Object.prototype.hasOwnProperty.call(hours, course.id) && <label className="mt-2 flex items-center gap-2 text-caption text-on-surface-variant">Requested extra hours
                  <input type="number" min={1} max={course.creditHours} step={1} value={hours[course.id]} onChange={(event) => changeHours({ ...hours, [course.id]: Number(event.target.value) })} className="w-20 rounded border border-outline-variant bg-surface-container-lowest px-2 py-1 text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary" />
                </label>}
              </div>)}
            </fieldset>
            <p className="text-caption text-on-surface-variant">The whole course counts towards the projected schedule. Pricing uses the extra hours you request: EGP 1,000/hour for repeats, EGP 800/hour for new courses.</p>
            <CustomButton size="sm" disabled={busy || !Object.keys(hours).length} onClick={() => void preview()}>Check eligibility and price</CustomButton>
            {quote && <div className="space-y-3">
              <p className="text-body text-on-surface">Standard: {quote.standardHours} · Projected: {quote.selectedHours} · Maximum: {quote.maximumTotalHours} hours</p>
              {quote.issues.length > 0 && <AlertBanner tone="error"><ul className="list-disc pl-4">{quote.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul></AlertBanner>}
              <div className="overflow-x-auto"><table className="w-full text-left text-caption text-on-surface-variant"><caption className="sr-only">Extra-hours itemized price in EGP</caption><thead><tr><th>Course</th><th>Type</th><th>Hours</th><th>EGP/hour</th><th>Subtotal</th></tr></thead><tbody>{quote.items.map((item) => <tr key={item.course}><td className="py-2">{item.code}</td><td>{item.classification}</td><td>{item.requestedHours}</td><td>{item.ratePerHour}</td><td>{item.subtotal}</td></tr>)}</tbody></table></div>
              <p className="font-semibold text-on-surface">Total: EGP {quote.totalCost.toLocaleString()}</p>
              <CustomButton size="sm" disabled={busy || !quote.eligible} onClick={() => void submit()}>Submit extra-hours request</CustomButton>
            </div>}
          </>}
          {context.requests.length > 0 && <section className="space-y-2"><h4 className="text-body font-semibold text-on-surface">Your recent requests for this term</h4>{context.requests.map((request) => <div key={request.id} className="space-y-2 rounded-lg border border-outline-variant p-3">
            <p className="break-all text-caption text-on-surface-variant">{request.reference} · {request.requestedHours} hours · EGP {request.totalCost} · {request.decision}{request.settlementStatus && request.settlementStatus !== 'Not Applicable' ? ` · ${request.settlementStatus}` : ''}</p>
            {request.cancellationRequestedAt && !request.reversed && <p className="text-caption text-on-surface-variant">Cancellation requested {new Date(request.cancellationRequestedAt).toLocaleString()}. Waiting for a Coordinator to refund or cancel the charge.</p>}
            <div className="flex flex-wrap gap-2">
              {request.decision === 'Pending' && <CustomButton size="sm" variant="secondary" disabled={busy} onClick={() => setWithdrawal(request)} aria-label={`Withdraw request ${request.reference}`}>Withdraw request</CustomButton>}
              {canRequestCancellation(request) && <CustomButton size="sm" variant="secondary" disabled={busy} onClick={() => { setCancelReason(''); setCancellation(request); }} aria-label={`Request cancellation of ${request.reference}`}>Request cancellation</CustomButton>}
              <CustomButton size="sm" variant="ghost" aria-expanded={historyFor === request.id} aria-label={`${historyFor === request.id ? 'Hide' : 'View'} history of ${request.reference}`} onClick={() => void toggleHistory(request.id)}>{historyFor === request.id ? 'Hide history' : 'View history'}</CustomButton>
            </div>
            {historyFor === request.id && (history ? <ExtraHoursHistoryTimeline events={history.events} decision={history.decision} settlementStatus={history.settlementStatus} responseNote={history.responseNote} />
              : historyError ? <AlertBanner tone="error">{historyError}</AlertBanner> : <p className="text-caption text-on-surface-variant">Loading history…</p>)}
          </div>)}</section>}
        </>}
      </div>}
      <ConfirmDialog open={Boolean(withdrawal)} title="Withdraw extra-hours request?" message={`Withdraw ${withdrawal?.reference ?? 'this request'} before Coordinator approval? You can submit a new request later, subject to eligibility and the advising deadline.`}
        confirmLabel="Withdraw request" cancelLabel="Keep request" isLoading={busy} onConfirm={() => void withdraw()} onCancel={() => setWithdrawal(null)} />
      <ConfirmDialog open={Boolean(cancellation)} tone="warning" title="Request cancellation?"
        message={<div className="space-y-3">
          <p>{`Ask a Coordinator to cancel ${cancellation?.reference ?? 'this request'}. ${cancellation?.settlementStatus === 'Paid' ? 'The payment will be refunded to the student\'s wallet' : 'The deferred charge will be removed from the next installment'} and the extra hours revoked. Nothing changes until the Coordinator acts.`}</p>
          <label className="block text-body text-on-surface">Reason (5 to 1000 characters)
            <textarea value={cancelReason} maxLength={1000} rows={3} onChange={(event) => setCancelReason(event.target.value)}
              aria-describedby="cancellation-reason-hint"
              className="mt-1 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1 text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <p id="cancellation-reason-hint" className="text-caption text-on-surface-variant">
            {cancelReason.trim().length < 5 ? `Use at least 5 characters (${cancelReason.trim().length}/5).` : `${cancelReason.trim().length}/1000 characters.`}
          </p>
        </div>}
        confirmLabel="Send to Coordinator" cancelLabel="Keep request" isLoading={busy} confirmDisabled={cancelReason.trim().length < 5}
        onConfirm={() => void requestCancellation()} onCancel={() => { setCancellation(null); setCancelReason(''); }} />
    </Card>
  );
};
export default ExtraHoursRequestPanel;
