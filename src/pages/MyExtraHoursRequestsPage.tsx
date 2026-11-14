import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import AlertBanner from '../components/ui/AlertBanner';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import { fetchMyExtraHoursRequests, saveExtraHoursPreference, payExtraHoursWallet, openExtraHoursCheckout, confirmExtraHoursCheckout, type SettlementPreference, type StudentExtraHoursRequest } from '../lib/extraHoursReviewService';

const money = (value: number) => `EGP ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PayNow: React.FC<{ request: StudentExtraHoursRequest; onSaved: () => void }> = ({ request, onSaved }) => {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const pay = async (method: 'Wallet' | 'Gateway' | 'Check') => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (method === 'Wallet') await payExtraHoursWallet(request.id);
      else if (method === 'Check' && request.gatewayAttempt) {
        const result = await confirmExtraHoursCheckout(request.gatewayAttempt); setError(result.message);
      } else {
        const result = await openExtraHoursCheckout(request.id);
        if (result.url) { window.location.assign(result.url); return; }
        await confirmExtraHoursCheckout(result.paymentId);
      }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not complete payment.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3">
    <p className="text-sm text-slate-300">Pay the full approved amount of {money(request.totalCost)}. Wallet payments require enough balance. Stripe Checkout uses test payments only.</p>
    {error && <AlertBanner tone="info">{error}</AlertBanner>}
    <div className="flex flex-wrap gap-3">
      <CustomButton type="button" size="sm" disabled={busy || Boolean(request.gatewayAttempt)} onClick={() => void pay('Wallet')}>Pay {money(request.totalCost)} from wallet</CustomButton>
      <CustomButton type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void pay('Gateway')}>{request.gatewayAttempt ? 'Continue Stripe checkout' : 'Pay with Stripe (test)'}</CustomButton>
      {request.gatewayAttempt && <CustomButton type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void pay('Check')}>Check Stripe payment</CustomButton>}
    </div>
  </div>;
};
const SettlementChoice: React.FC<{ request: StudentExtraHoursRequest; onSaved: () => void }> = ({ request, onSaved }) => {
  const [choice, setChoice] = useState<SettlementPreference | ''>(request.settlementPreference ?? '');
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => { setChoice(request.settlementPreference ?? ''); }, [request.settlementPreference]);
  if (request.settlementStatus !== 'Awaiting Payment Choice') return null;
  return <form className="space-y-3 border-t border-slate-800 pt-4" onSubmit={async (event) => {
    event.preventDefault(); if (!choice || saving) return;
    setSaving(true); setError(null); setSaved(null);
    try { const result = await saveExtraHoursPreference(request.id, choice, request.version); setSaved(result.message); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save your preference.'); }
    finally { setSaving(false); }
  }}>
    <fieldset disabled={saving || Boolean(request.gatewayAttempt)} className="space-y-2"><legend className="mb-2 font-semibold text-white">How would you like to settle this request?</legend>
      <label className="flex gap-2 text-sm text-slate-300"><input type="radio" name={`choice-${request.id}`} value="Pay Now" checked={choice === 'Pay Now'} onChange={() => setChoice('Pay Now')} />Pay now</label>
      <label className="flex gap-2 text-sm text-slate-300"><input type="radio" name={`choice-${request.id}`} value="Next Installment" checked={choice === 'Next Installment'} onChange={() => setChoice('Next Installment')} />Add to my next university installment</label>
    </fieldset>
    <p className="text-xs text-slate-400">Saving a preference does not settle this request. Pay now below after saving that preference. Installment confirmation is not available yet.</p>
    {request.settlementPreference && <p className="text-sm text-slate-300">Saved preference: {request.settlementPreference}</p>}
    {error && <AlertBanner tone="error">{error} Refresh the page before retrying.</AlertBanner>}
    {saved && <AlertBanner tone="success">{saved}</AlertBanner>}
    <CustomButton type="submit" size="sm" disabled={saving || Boolean(request.gatewayAttempt) || !choice || choice === request.settlementPreference}>{saving ? 'Saving…' : 'Save preference'}</CustomButton>
    {request.settlementPreference === 'Pay Now' && <PayNow request={request} onSaved={onSaved} />}
  </form>;
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
    confirmExtraHoursCheckout(id).then((result) => { if (active) { setPaymentMessage(result.message); retry(); } })
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
      meta={<CustomButton size="sm" variant="secondary" disabled={loading} onClick={retry}>Refresh</CustomButton>} />
    {paymentMessage && <div className="mb-4"><AlertBanner tone="info">{paymentMessage}</AlertBanner></div>}
    {error ? <AlertBanner tone="error">{error}</AlertBanner> : loading ? <Card className="flex items-center justify-center gap-2 p-12 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading requests…</Card>
      : rows.length === 0 ? <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No approved extra-hours requests" description="Your requests appear here after Coordinator approval." />
      : <div className="space-y-5">
        <AlertBanner tone="info">Approval confirms eligibility and cost. Approval alone does not activate extra hours or add courses to your schedule.</AlertBanner>
        {rows.map((row) => <Card key={row.id} className="space-y-3 p-5">
          <h2 className="break-all font-semibold text-white">{row.reference}</h2>
          <p className="text-sm text-slate-300">{row.term} · {row.decision} · {row.settlementStatus}</p>
          <p className="text-xs text-slate-400">Approved: {row.decidedAt ? new Date(row.decidedAt).toLocaleString() : 'Not recorded'}</p>
          {row.paymentReference && <p className="text-sm text-emerald-300">Payment reference: {row.paymentReference}</p>}
          {row.activatedAt && <p className="text-sm text-emerald-300">{row.activatedHours} extra hours and requested courses activated {new Date(row.activatedAt).toLocaleString()}</p>}
          <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm text-slate-300"><caption className="sr-only">Courses and itemized costs for {row.reference}</caption>
            <thead><tr>{['Course', 'Course credit hours', 'Requested extra hours', 'Type', 'Price per hour', 'Subtotal'].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
            <tbody>{row.items.map((item) => <tr key={item.courseId} className="border-t border-slate-800"><td className="p-2">{item.code}<span className="block text-xs text-slate-400">{item.name}</span></td><td className="p-2">{item.creditHours}</td><td className="p-2">{item.requestedHours}</td><td className="p-2">{item.classification}</td><td className="p-2">{money(item.ratePerHour)}</td><td className="p-2">{money(item.subtotal)}</td></tr>)}</tbody>
          </table></div>
          <p className="font-semibold text-white">{row.requestedHours} requested extra hours · Total: {money(row.totalCost)}</p>
          <SettlementChoice request={row} onSaved={retry} />
        </Card>)}
        <p className="text-sm text-slate-400">Page {page} of {pages}</p>
        <div className="flex gap-3"><CustomButton variant="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</CustomButton><CustomButton variant="secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</CustomButton></div>
      </div>}
  </>;
};
export default MyExtraHoursRequestsPage;
