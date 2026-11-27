import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2, RotateCcw, Receipt } from 'lucide-react';
import ExtraHoursHistoryTimeline from '../components/ExtraHoursHistoryTimeline';
import { fetchMyFinanceRecords, fetchMyRequestHistory, type FinanceRecord, type RequestHistory } from '../lib/extraHoursFinanceService';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import AlertBanner from '../components/ui/AlertBanner';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { fetchMyWallet } from '../lib/walletService';
import { fetchExtraHoursDocument, downloadExtraHoursDocument, type ExtraHoursDocument } from '../lib/extraHoursReviewService';
import { fetchMyExtraHoursRequests, saveExtraHoursPreference, payExtraHoursWallet, openExtraHoursCheckout, confirmExtraHoursCheckout, cancelExtraHoursCheckout, retryExtraHoursCheckout, previewExtraHoursDeferral, confirmExtraHoursDeferral, type DeferralPreview, type SettlementPreference, type StudentExtraHoursRequest } from '../lib/extraHoursReviewService';

const money = (value: number) => `EGP ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DocumentActions: React.FC<{ request: StudentExtraHoursRequest }> = ({ request }) => {
  const [preview, setPreview] = useState<ExtraHoursDocument | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const download = async () => { setBusy(true); setError(null); try { await downloadExtraHoursDocument(request.id); } catch (err) { setError(err instanceof Error ? err.message : 'Download failed.'); } finally { setBusy(false); } };
  return <div className="space-y-3">
    {error && <AlertBanner tone="error">{error}</AlertBanner>}
    <div className="flex gap-3"><CustomButton size="sm" variant="secondary" disabled={busy} onClick={() => { setBusy(true); setError(null); void fetchExtraHoursDocument(request.id).then((result) => setPreview(result.document)).catch((err) => setError(err instanceof Error ? err.message : 'Could not load document.')).finally(() => setBusy(false)); }}>View {request.settlementStatus === 'Paid' ? 'payment receipt' : 'deferred confirmation'}</CustomButton><CustomButton size="sm" variant="secondary" disabled={busy} onClick={() => void download()}>Download PDF</CustomButton></div>
    <ConfirmDialog open={Boolean(preview)} title={preview?.title || 'Document'} tone="warning" confirmLabel="Download PDF" cancelLabel="Close" isLoading={busy} onCancel={() => { if (!busy) setPreview(null); }} onConfirm={() => void download()}
      message={<>{preview?.reference}<br />Request: {preview?.requestReference}<br />Date: {preview && new Date(preview.date).toLocaleString()}<br />Total: {money(preview?.totalCost || 0)}<br />
        {preview?.kind === 'Paid' ? <>Method: {preview.paymentMethod}<br />Transaction: {preview.transactionReference}<br /></> : <>Installment: {preview?.installment?.label}<br />Reference: {preview?.installment?.reference}<br />Due date: {preview?.installment && new Date(preview.installment.dueDate).toLocaleDateString()}<br />Extra-hours amount due: {money(preview?.amountDue || 0)}<br /></>}{preview?.notice}</>} />
  </div>;
};
const PayNow: React.FC<{ request: StudentExtraHoursRequest; onSaved: () => void }> = ({ request, onSaved }) => {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [walletConfirmation, setWalletConfirmation] = useState<{ balance: number } | null>(null);
  const retryable = ['Failed', 'Cancelled'].includes(request.gatewayStatus || '') && !request.activatedAt;
  const reviewWalletPayment = async () => {
    if (busy || walletConfirmation) return;
    setBusy(true); setError(null);
    try {
      const { wallet } = await fetchMyWallet();
      if (wallet.currency !== request.currency || wallet.balance < request.totalCost) {
        setError('Insufficient wallet balance for the full approved amount. No payment was taken.');
        return;
      }
      setWalletConfirmation({ balance: wallet.balance });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not check your wallet balance.'); }
    finally { setBusy(false); }
  };
  const pay = async (method: 'Wallet' | 'Gateway' | 'Check') => {
    if (busy || (method === 'Wallet' && !walletConfirmation)) return;
    setBusy(true); setError(null);
    try {
      if (method === 'Wallet') await payExtraHoursWallet(request.id);
      else if (method === 'Check' && request.gatewayAttempt) {
        const result = await confirmExtraHoursCheckout(request.gatewayAttempt); setError(result.message);
      } else {
        const result = retryable ? await retryExtraHoursCheckout(request.id) : await openExtraHoursCheckout(request.id);
        if (result.url) { window.location.assign(result.url); return; }
        await confirmExtraHoursCheckout(result.paymentId);
      }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not complete payment.'); }
    finally { setBusy(false); setWalletConfirmation(null); }
  };
  return <div className="space-y-3">
    <p className="text-sm text-on-surface-variant">Pay the full approved amount of {money(request.totalCost)}. Wallet payments require enough balance. Stripe Checkout uses test payments only.</p>
    {error && <AlertBanner tone="info">{error}</AlertBanner>}
    <div className="flex flex-wrap gap-3">
      {!retryable && <CustomButton type="button" size="sm" disabled={busy || Boolean(request.gatewayAttempt)} onClick={() => void reviewWalletPayment()}>Pay {money(request.totalCost)} from wallet</CustomButton>}
      <CustomButton type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void pay('Gateway')}>{retryable ? 'Retry Stripe payment' : request.gatewayAttempt ? 'Continue Stripe checkout' : 'Pay with Stripe (test)'}</CustomButton>
      {request.gatewayAttempt && <CustomButton type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void pay('Check')}>Check Stripe payment</CustomButton>}
    </div>
    <ConfirmDialog open={walletConfirmation !== null} title="Confirm wallet payment" tone="warning"
      confirmLabel={`Confirm payment of ${money(request.totalCost)}`} isLoading={busy}
      onCancel={() => { if (!busy) setWalletConfirmation(null); }} onConfirm={() => void pay('Wallet')}
      message={<>
        Request: <strong className="break-all text-on-surface">{request.reference}</strong><br />
        Payment method: Wallet<br />
        Total to pay: <strong className="text-on-surface">{money(request.totalCost)}</strong><br />
        Current wallet balance: {money(walletConfirmation?.balance ?? 0)}<br />
        Balance after payment: {money((walletConfirmation?.balance ?? 0) - request.totalCost)}<br />
        Confirming deducts this amount and activates your approved extra hours and courses. Your balance will be checked again before payment.
      </>} />
  </div>;
};
const DeferCharge: React.FC<{ request: StudentExtraHoursRequest; onSaved: () => void }> = ({ request, onSaved }) => {
  const [preview, setPreview] = useState<DeferralPreview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  return <div className="space-y-3">
    <p className="text-sm text-on-surface-variant">Add the approved amount to your next assigned university installment. It remains an outstanding charge; no wallet or card payment is taken.</p>
    {error && <AlertBanner tone="error">{error}</AlertBanner>}
    <CustomButton type="button" size="sm" disabled={busy || Boolean(request.gatewayAttempt)} onClick={() => { setBusy(true); setError(null); void previewExtraHoursDeferral(request.id).then(setPreview).catch((error) => setError(error instanceof Error ? error.message : 'Could not load installment.')).finally(() => setBusy(false)); }}>Review installment deferral</CustomButton>
    <ConfirmDialog open={Boolean(preview)} title="Confirm installment deferral" tone="warning" confirmLabel="Confirm deferral" isLoading={busy} onCancel={() => { if (!busy) setPreview(null); }}
      message={<>Request: {request.reference}<br />Add {money(preview?.amount ?? 0)} to {preview?.installment.label}.<br />Installment reference: {preview?.installment.reference}<br />Due: {preview ? new Date(preview.installment.dueDate).toLocaleDateString() : ''}<br />This creates an outstanding charge and immediately activates your approved hours and courses. It is not a paid receipt. No wallet or card will be charged.</>}
      onConfirm={() => { if (!preview || busy) return; setBusy(true); setError(null); void confirmExtraHoursDeferral(request.id, preview.installment.id, preview.version).then(() => { setPreview(null); onSaved(); }).catch((error) => { setError(error instanceof Error ? error.message : 'Could not confirm deferral.'); setPreview(null); }).finally(() => setBusy(false)); }} />
  </div>;
};
const SettlementChoice: React.FC<{ request: StudentExtraHoursRequest; onSaved: () => void }> = ({ request, onSaved }) => {
  const [choice, setChoice] = useState<SettlementPreference | ''>(request.settlementPreference ?? '');
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => { setChoice(request.settlementPreference ?? ''); }, [request.settlementPreference]);
  if (['Failed', 'Cancelled'].includes(request.settlementStatus) && ['Failed', 'Cancelled'].includes(request.gatewayStatus || '') && !request.activatedAt) return <div className="space-y-3 border-t border-outline-variant pt-4"><AlertBanner tone="info">{request.settlementStatus === 'Cancelled' ? 'The previous Stripe payment was cancelled.' : 'The previous Stripe payment failed.'} Retry opens a verified checkout for the same approved amount. Extra hours remain inactive until payment succeeds.</AlertBanner><PayNow request={request} onSaved={onSaved} /></div>;
  if (request.settlementStatus !== 'Awaiting Payment Choice') return null;
  return <form className="space-y-3 border-t border-outline-variant pt-4" onSubmit={async (event) => {
    event.preventDefault(); if (!choice || saving) return;
    setSaving(true); setError(null); setSaved(null);
    try { const result = await saveExtraHoursPreference(request.id, choice, request.version); setSaved(result.message); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save your preference.'); }
    finally { setSaving(false); }
  }}>
    <fieldset disabled={saving || Boolean(request.gatewayAttempt)} className="space-y-2"><legend className="mb-2 font-semibold text-on-surface">How would you like to settle this request?</legend>
      <label className="flex gap-2 text-sm text-on-surface-variant"><input type="radio" name={`choice-${request.id}`} value="Pay Now" checked={choice === 'Pay Now'} onChange={() => setChoice('Pay Now')} />Pay now</label>
      <label className="flex gap-2 text-sm text-on-surface-variant"><input type="radio" name={`choice-${request.id}`} value="Next Installment" checked={choice === 'Next Installment'} onChange={() => setChoice('Next Installment')} />Add to my next university installment</label>
    </fieldset>
    <p className="text-xs text-on-surface-variant">Saving a preference does not settle this request. Review and confirm the selected option below.</p>
    {request.settlementPreference && <p className="text-sm text-on-surface-variant">Saved preference: {request.settlementPreference}</p>}
    {error && <AlertBanner tone="error">{error} Refresh the page before retrying.</AlertBanner>}
    {saved && <AlertBanner tone="success">{saved}</AlertBanner>}
    <CustomButton type="submit" size="sm" disabled={saving || Boolean(request.gatewayAttempt) || !choice || choice === request.settlementPreference}>{saving ? 'Saving…' : 'Save preference'}</CustomButton>
    {request.settlementPreference === 'Pay Now' && <PayNow request={request} onSaved={onSaved} />}
    {request.settlementPreference === 'Next Installment' && <DeferCharge request={request} onSaved={onSaved} />}
  </form>;
};
// Req 95: status and decision history of one approved request.
const RequestHistoryToggle: React.FC<{ requestId: string; refresh: number }> = ({ requestId, refresh }) => {
  const [open, setOpen] = useState(false), [history, setHistory] = useState<RequestHistory | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setHistory(null); setError(null);
    fetchMyRequestHistory(requestId).then((result) => { if (active) setHistory(result.history); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load the request history.'); });
    return () => { active = false; };
  }, [open, requestId, refresh]);
  return <div className="space-y-3 border-t border-outline-variant pt-4">
    <CustomButton size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? 'Hide status history' : 'View status and decision history'}</CustomButton>
    {open && (error ? <AlertBanner tone="error">{error}</AlertBanner> : history
      ? <ExtraHoursHistoryTimeline events={history.events} decision={history.decision} settlementStatus={history.settlementStatus} responseNote={history.responseNote} />
      : <p className="text-sm text-on-surface-variant">Loading history…</p>)}
  </div>;
};
// Req 97: the student's own payments and deferred charges with settlement option and status.
const PaymentHistory: React.FC<{ refresh: number }> = ({ refresh }) => {
  const [rows, setRows] = useState<FinanceRecord[]>([]), [page, setPage] = useState(1), [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    fetchMyFinanceRecords(page).then((result) => { if (active) { setRows(result.records); setPages(result.pagination.totalPages); } })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load your payment history.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, refresh]);
  return <section aria-labelledby="payment-history" className="mt-8 space-y-3">
    <h2 id="payment-history" className="text-lg font-semibold text-on-surface">Payment and deferred-charge history</h2>
    {error ? <AlertBanner tone="error">{error}</AlertBanner> : loading ? <Card className="flex items-center justify-center gap-2 p-8 text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" />Loading history…</Card>
      : rows.length === 0 ? <EmptyState icon={<Receipt className="h-5 w-5" />} title="No payments or deferred charges yet" description="Each payment attempt and each amount added to your installment will appear here." />
      : <><Card className="overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm text-on-surface-variant"><caption className="sr-only">Your extra-hours payments and deferred charges</caption>
        <thead className="text-xs uppercase text-on-surface-variant"><tr>{['Date', 'Request', 'Settlement option', 'Reference', 'Amount', 'Status'].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={`${row.kind}-${row.id}`} className="border-t border-outline-variant"><td className="p-3 text-xs">{new Date(row.date).toLocaleString()}</td><td className="max-w-[12rem] break-all p-3 text-xs">{row.request?.reference}</td><td className="p-3">{row.settlementOption}</td><td className="max-w-[12rem] break-all p-3 text-xs">{row.reference}</td><td className="p-3">{money(row.amount)}</td><td className="p-3">{row.status}</td></tr>)}</tbody>
      </table></Card>
        {pages > 1 && <div className="flex gap-3"><CustomButton size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</CustomButton><CustomButton size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</CustomButton></div>}
      </>}
  </section>;
};
const MyExtraHoursRequestsPage: React.FC = () => {
  const [rows, setRows] = useState<StudentExtraHoursRequest[]>([]);
  const [page, setPage] = useState(1), [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const retry = useCallback(() => setRefresh((value) => value + 1), []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search), id = params.get('checkout');
    if (!id) return;
    let active = true;
    setPaymentMessage('Checking payment with Stripe…');
    const action = params.get('cancelled') === '1' ? cancelExtraHoursCheckout(id, Number(params.get('attempt') || 0)) : confirmExtraHoursCheckout(id);
    action.then((result) => { if (active) { setPaymentMessage(result.message); retry(); } })
      .catch((err: unknown) => { if (active) setPaymentMessage(err instanceof Error ? err.message : 'Could not check payment.'); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    fetchMyExtraHoursRequests(page).then((result) => {
      if (!active) return;
      if (page > 1 && page > result.pagination.totalPages) { setPage(Math.max(1, result.pagination.totalPages)); return; }
      setRows(result.requests); setPages(result.pagination.totalPages);
    }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load your requests.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, refresh]);
  return <>
    <PageHeader title="My extra-hours requests" description="Your Coordinator-approved requests and itemized costs." onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      meta={<CustomButton size="sm" variant="secondary" isLoading={loading} onClick={retry} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>Refresh</CustomButton>} />
    {paymentMessage && <div className="mb-4"><AlertBanner tone="info">{paymentMessage}</AlertBanner></div>}
    {error ? <AlertBanner tone="error">{error}</AlertBanner> : loading ? <Card className="flex items-center justify-center gap-2 p-12 text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" />Loading requests…</Card>
      : rows.length === 0 ? <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No approved extra-hours requests" description="Your requests appear here after Coordinator approval." />
      : <div className="space-y-5">
        <AlertBanner tone="info">Approval confirms eligibility and cost. Approval alone does not activate extra hours or add courses to your schedule.</AlertBanner>
        {rows.map((row) => <Card key={row.id} className="space-y-3 p-5">
          <h2 className="break-all font-semibold text-on-surface">{row.reference}</h2>
          <p className="text-sm text-on-surface-variant">{row.term} · {row.decision} · {row.settlementStatus}</p>
          <p className="text-xs text-on-surface-variant">Approved: {row.decidedAt ? new Date(row.decidedAt).toLocaleString() : 'Not recorded'}</p>
          {row.paymentReference && <p className="text-sm text-success">Payment reference: {row.paymentReference}</p>}
          {row.deferredCharge && <div className="space-y-1 text-sm text-on-surface-variant"><p className="font-semibold text-warning">Deferred charge — {row.deferredCharge.status}; not a paid receipt</p><p className="break-all">{row.deferredCharge.reference} · {money(row.deferredCharge.amount)}</p><p>{row.deferredCharge.installment.label} · Due {new Date(row.deferredCharge.installment.dueDate).toLocaleDateString()}</p></div>}
          {row.activatedAt && <p className="text-sm text-success">{row.activatedHours} extra hours and requested courses activated {new Date(row.activatedAt).toLocaleString()}</p>}
          <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm text-on-surface-variant"><caption className="sr-only">Courses and itemized costs for {row.reference}</caption>
            <thead><tr>{['Course', 'Course credit hours', 'Requested extra hours', 'Type', 'Price per hour', 'Subtotal'].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
            <tbody>{row.items.map((item) => <tr key={item.courseId} className="border-t border-outline-variant"><td className="p-2">{item.code}<span className="block text-xs text-on-surface-variant">{item.name}</span></td><td className="p-2">{item.creditHours}</td><td className="p-2">{item.requestedHours}</td><td className="p-2">{item.classification}</td><td className="p-2">{money(item.ratePerHour)}</td><td className="p-2">{money(item.subtotal)}</td></tr>)}</tbody>
          </table></div>
          <p className="font-semibold text-on-surface">{row.requestedHours} requested extra hours · Total: {money(row.totalCost)}</p>
          <SettlementChoice request={row} onSaved={retry} />
          {['Paid', 'Deferred to Next Installment'].includes(row.settlementStatus) && <DocumentActions request={row} />}
          <RequestHistoryToggle requestId={row.id} refresh={refresh} />
        </Card>)}
        <p className="text-sm text-on-surface-variant">Page {page} of {pages}</p>
        <div className="flex gap-3"><CustomButton variant="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</CustomButton><CustomButton variant="secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</CustomButton></div>
      </div>}
    <PaymentHistory refresh={refresh} />
  </>;
};
export default MyExtraHoursRequestsPage;
