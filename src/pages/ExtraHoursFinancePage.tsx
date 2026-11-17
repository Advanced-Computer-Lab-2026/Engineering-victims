import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Receipt } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import CustomButton from '../components/ui/CustomButton';
import CustomInput from '../components/ui/CustomInput';
import EmptyState from '../components/ui/EmptyState';
import ExtraHoursHistoryTimeline from '../components/ExtraHoursHistoryTimeline';
import { exportFinanceRecords, fetchFinanceOptions, fetchFinanceRecord, fetchFinanceRecords, reverseFinanceRecord,
  type FinanceDetail, type FinanceFilters, type FinanceRecord } from '../lib/extraHoursFinanceService';

/**
 * Reqs 98-102, 127: extra-hours financial records for Coordinators and
 * Administrators. List (98), search (99), filter (100), open details (101),
 * refund or cancel (102) and export the filtered list (127).
 */
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : 'Not recorded';
const money = (value: number) => `EGP ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const message = (error: unknown) => error instanceof Error ? error.message : 'Could not load the financial records.';
const tone = (status: string): BadgeTone => ({ Succeeded: 'emerald', Paid: 'emerald', Outstanding: 'amber', Pending: 'amber', RefundRequired: 'amber',
  Refunded: 'sky', Cancelled: 'neutral', Failed: 'rose' } as Record<string, BadgeTone>)[status] ?? 'neutral';
const SELECT = 'mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100';

const ExtraHoursFinancePage: React.FC = () => {
  const [rows, setRows] = useState<FinanceRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<FinanceFilters>({});
  const [options, setOptions] = useState<{ settlementOptions: string[]; statuses: string[] }>({ settlementOptions: [], statuses: [] });
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<FinanceDetail | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const version = useRef(0);
  const active = Object.values(filters).some(Boolean);

  useEffect(() => {
    let live = true;
    fetchFinanceOptions().then((result) => { if (live) setOptions(result); }).catch((err) => { if (live) setError(message(err)); });
    return () => { live = false; };
  }, []);
  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true); setError(null);
    try {
      const response = await fetchFinanceRecords(page, filters);
      if (current !== version.current) return;
      if (page > 1 && page > response.pagination.totalPages) { setPage(Math.max(1, response.pagination.totalPages)); return; }
      setRows(response.records); setTotal(response.pagination.total); setPages(response.pagination.totalPages);
    } catch (err) { if (current === version.current) setError(message(err)); }
    finally { if (current === version.current) setLoading(false); }
  }, [page, filters]);
  useEffect(() => { void load(); return () => { version.current += 1; }; }, [load]);

  const setFilter = (key: keyof FinanceFilters, value: string) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const open = async (row: FinanceRecord) => {
    setOpening(true); setError(null); setSuccess(null); setReason('');
    try { setDetail(await fetchFinanceRecord(row.kind, row.id)); window.scrollTo({ top: 0 }); }
    catch (err) { setError(message(err)); }
    finally { setOpening(false); }
  };
  const doExport = async () => {
    setExporting(true); setError(null); setSuccess(null);
    try { await exportFinanceRecords(filters); setSuccess(`Exported ${total} record${total === 1 ? '' : 's'} as a CSV file.`); }
    catch (err) { setError(message(err)); }
    finally { setExporting(false); }
  };
  const reverse = async () => {
    if (!detail || reversing) return;
    setReversing(true); setError(null); setSuccess(null);
    try {
      const result = await reverseFinanceRecord(detail.record.kind, detail.record.id, reason.trim());
      setSuccess(result.message); setReason('');
      setDetail(await fetchFinanceRecord(detail.record.kind, detail.record.id));
      void load();
    } catch (err) { setError(message(err)); }
    finally { setReversing(false); setConfirming(false); }
  };

  const action = detail?.reversal.action;
  return <>
    <PageHeader title="Extra-hours financial records" description="Payments and deferred charges for extra-hours requests: search, filter, open, refund or cancel, and export."
      onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      meta={detail ? <CustomButton size="sm" variant="secondary" disabled={reversing} onClick={() => { setDetail(null); setError(null); setSuccess(null); }}>Back to records</CustomButton>
        : <CustomButton size="sm" variant="secondary" disabled={loading || opening} onClick={() => void load()}>Refresh</CustomButton>} />
    {error && <div className="mb-4"><AlertBanner tone="error">{error}</AlertBanner></div>}
    {success && <div className="mb-4"><AlertBanner tone="success">{success}</AlertBanner></div>}

    {!detail && <>
      <form className="mb-4 space-y-2" onSubmit={(event) => { event.preventDefault(); setFilter('search', searchInput.trim()); }}>
        <div className="flex flex-wrap items-end gap-3">
          <CustomInput type="search" label="Search" placeholder="e.g. 64-40077, EHR-…, PAY-… or DEF-…" aria-describedby="finance-search-hint"
            maxLength={80} value={searchInput} disabled={opening} onChange={(event) => setSearchInput(event.target.value)} className="max-w-md" />
          <CustomButton type="submit" size="sm" disabled={loading || opening}>Search</CustomButton>
        </div>
        <p id="finance-search-hint" className="text-xs text-slate-400">Student ID, request ID, transaction reference or deferred-charge reference.</p>
      </form>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm text-slate-300">From date
          <input type="date" className={SELECT} value={filters.from ?? ''} max={filters.to || undefined} disabled={opening} onChange={(event) => setFilter('from', event.target.value)} />
        </label>
        <label className="text-sm text-slate-300">To date
          <input type="date" className={SELECT} value={filters.to ?? ''} min={filters.from || undefined} disabled={opening} onChange={(event) => setFilter('to', event.target.value)} />
        </label>
        <label className="text-sm text-slate-300">Settlement option
          <select className={SELECT} value={filters.settlementOption ?? ''} disabled={opening} onChange={(event) => setFilter('settlementOption', event.target.value)}>
            <option value="">All</option>{options.settlementOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-300">Status
          <select className={SELECT} value={filters.status ?? ''} disabled={opening} onChange={(event) => setFilter('status', event.target.value)}>
            <option value="">All</option>{options.statuses.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className="mb-5 flex flex-wrap gap-3">
        <CustomButton size="sm" variant="secondary" disabled={opening || (!active && !searchInput)} onClick={() => { setFilters({}); setSearchInput(''); setPage(1); }}>Clear search and filters</CustomButton>
        <CustomButton size="sm" variant="secondary" disabled={exporting || loading || total === 0} onClick={() => void doExport()}>{exporting ? 'Exporting…' : `Export ${active ? 'filtered ' : ''}records (CSV)`}</CustomButton>
      </div>
    </>}

    {detail ? <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3"><h2 className="break-all text-lg font-semibold text-white">{detail.record.reference}</h2><Badge tone={tone(detail.record.status)}>{detail.record.status}</Badge></div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-400">Student</dt><dd className="text-slate-100">{detail.record.student?.name ?? 'Student record unavailable'} · {detail.record.student?.studentId}</dd><dd className="text-xs text-slate-400">{detail.record.student?.email}</dd></div>
          <div><dt className="text-slate-400">Request</dt><dd className="break-all text-slate-100">{detail.request?.reference ?? 'Request unavailable'}</dd><dd className="text-xs text-slate-400">{detail.request?.term}</dd></div>
          <div><dt className="text-slate-400">Amount</dt><dd className="text-slate-100">{money(detail.record.amount)}</dd></div>
          <div><dt className="text-slate-400">Settlement option</dt><dd className="text-slate-100">{detail.record.settlementOption}</dd></div>
          <div><dt className="text-slate-400">{detail.record.kind === 'payment' ? 'Payment date' : 'Deferral confirmed'}</dt><dd className="text-slate-100">{date(detail.record.date)}</dd></div>
          {detail.record.installment && <div><dt className="text-slate-400">Installment</dt><dd className="text-slate-100">{detail.record.installment.label} ({detail.record.installment.reference})</dd><dd className="text-xs text-slate-400">Due {new Date(detail.record.installment.dueDate).toLocaleDateString()}</dd></div>}
          {detail.record.refundReference && <div><dt className="text-slate-400">Refund reference</dt><dd className="break-all text-slate-100">{detail.record.refundReference}</dd></div>}
          {detail.request && <div><dt className="text-slate-400">Request status</dt><dd className="text-slate-100">{detail.request.decision} · {detail.request.settlementStatus}</dd><dd className="text-xs text-slate-400">{detail.request.activatedHours} of {detail.request.requestedHours} extra hours active</dd></div>}
          {detail.request?.advisor && <div><dt className="text-slate-400">Requesting Advisor</dt><dd className="text-slate-100">{detail.request.advisor.name}</dd><dd className="text-xs text-slate-400">{detail.request.advisor.email}</dd></div>}
        </dl>
      </Card>
      {detail.request && <Card className="p-5"><h2 className="mb-3 font-semibold text-white">Courses</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[30rem] text-left text-sm text-slate-300"><caption className="sr-only">Courses in this extra-hours request</caption>
          <thead><tr><th>Course</th><th>Hours</th><th>EGP/hour</th><th>Subtotal</th></tr></thead>
          <tbody>{detail.request.items.map((item) => <tr key={item.code} className="border-t border-slate-800"><td className="py-3">{item.code}<span className="block text-xs text-slate-400">{item.name}</span></td><td>{item.requestedHours}</td><td>{item.ratePerHour.toLocaleString()}</td><td>{money(item.subtotal)}</td></tr>)}</tbody>
        </table></div>
      </Card>}
      {detail.request?.reversal && <Card className="space-y-2 p-5"><h2 className="font-semibold text-white">Reversal</h2>
        <p className="text-sm text-slate-300">{detail.request.reversal.kind === 'Refund' ? `Refunded ${money(detail.request.reversal.amount)} to the wallet` : `Removed ${money(detail.request.reversal.amount)} from the installment`} on {date(detail.request.reversal.at)}{detail.request.reversal.by ? ` by ${detail.request.reversal.by}` : ''}.</p>
        <p className="whitespace-pre-wrap text-sm text-slate-300">Reason: {detail.request.reversal.reason}</p>
        <p className="text-xs text-slate-400">{detail.request.reversal.removedSchedules} added slot(s) removed · {detail.request.reversal.restoredDrafts} slot(s) returned to draft.</p>
      </Card>}
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-white">{detail.record.kind === 'payment' ? 'Refund this payment' : 'Cancel this deferred charge'}</h2>
        {detail.reversal.eligible ? <>
          <p className="text-sm text-slate-300">{action === 'Refund'
            ? `This cancels the request and credits ${money(detail.record.amount)} to the student's wallet. The extra hours are revoked and the course slots this payment added are removed. A payment can be refunded only once.`
            : `This cancels the request and removes ${money(detail.record.amount)} from the student's next installment. The wallet is not credited. The extra hours are revoked and the course slots this deferral added are removed.`}</p>
          <label className="block text-sm text-slate-300">Reason for cancelling (required)
            <textarea className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-slate-100" rows={3} maxLength={1000} value={reason} disabled={reversing} onChange={(event) => setReason(event.target.value)} />
          </label>
          {reason.trim().length > 0 && reason.trim().length < 5 && <p className="text-xs text-slate-400">Use at least 5 characters.</p>}
          <CustomButton variant="danger" disabled={reversing || reason.trim().length < 5} onClick={() => setConfirming(true)}>{action === 'Refund' ? 'Refund to wallet' : 'Cancel deferred charge'}</CustomButton>
        </> : <p className="text-sm text-slate-300">Not available: {detail.reversal.reason}</p>}
      </Card>
      <Card className="p-5"><h2 className="mb-3 font-semibold text-white">Request status and decision history</h2><ExtraHoursHistoryTimeline events={detail.history} /></Card>
      <ConfirmDialog open={confirming} tone="danger" isLoading={reversing}
        title={action === 'Refund' ? 'Refund this payment?' : 'Cancel this deferred charge?'}
        message={action === 'Refund' ? `${money(detail.record.amount)} goes back to ${detail.record.student?.name ?? 'the student'}'s wallet and the request is cancelled. This cannot be undone.`
          : `${money(detail.record.amount)} is removed from the next installment and the request is cancelled. This cannot be undone.`}
        confirmLabel={action === 'Refund' ? 'Refund' : 'Cancel charge'} cancelLabel="Keep it"
        onConfirm={() => void reverse()} onCancel={() => setConfirming(false)} />
    </div> : loading ? <Card className="flex items-center justify-center gap-2 p-12 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading financial records…</Card>
      : rows.length === 0 ? <EmptyState icon={<Receipt className="h-5 w-5" />} title={active ? 'No matching records' : 'No financial records yet'}
        description={active ? 'No records match the current search and filters. Clear them to see every record.' : 'Payments and deferred charges appear here after students settle approved extra-hours requests.'} />
      : <><p className="mb-3 text-sm text-slate-400">{total} {total === 1 ? 'record' : 'records'} · Page {page} of {pages}</p>
        <Card className="overflow-x-auto"><table className="w-full min-w-[64rem] text-left text-sm"><caption className="sr-only">Extra-hours financial records</caption>
          <thead className="text-xs uppercase text-slate-400"><tr>{['Student', 'Request', 'Amount', 'Settlement option', 'Reference', 'Date', 'Status', 'Details'].map((title) => <th key={title} className="p-3">{title}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={`${row.kind}-${row.id}`} className="border-t border-slate-800 text-slate-300">
            <td className="p-3">{row.student?.name ?? 'Unavailable student'}<span className="block text-xs text-slate-400">{row.student?.studentId}</span></td>
            <td className="max-w-[12rem] break-all p-3 text-xs">{row.request?.reference ?? 'Unavailable'}</td>
            <td className="p-3">{money(row.amount)}</td>
            <td className="p-3">{row.settlementOption}</td>
            <td className="max-w-[12rem] break-all p-3 text-xs">{row.reference}</td>
            <td className="p-3 text-xs">{date(row.date)}</td>
            <td className="p-3"><Badge tone={tone(row.status)}>{row.status}</Badge></td>
            <td className="p-3"><CustomButton size="sm" variant="secondary" disabled={opening} aria-label={`View record ${row.reference}`} onClick={() => void open(row)}>View details</CustomButton></td>
          </tr>)}</tbody>
        </table></Card>
        <div className="mt-4 flex gap-2"><CustomButton size="sm" variant="secondary" disabled={page === 1 || opening} onClick={() => setPage((current) => current - 1)}>Previous</CustomButton><CustomButton size="sm" variant="secondary" disabled={page >= pages || opening} onClick={() => setPage((current) => current + 1)}>Next</CustomButton></div>
      </>}
  </>;
};
export default ExtraHoursFinancePage;
