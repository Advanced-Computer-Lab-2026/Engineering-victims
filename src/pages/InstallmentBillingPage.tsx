import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import CustomInput from '../components/ui/CustomInput';
import AlertBanner from '../components/ui/AlertBanner';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import InstallmentsEmptyState from '../components/InstallmentsEmptyState';
import { listBillingPlans, createBillingPlan, searchBillingStudents, assignBillingPlan, listBillingInstallments, recordBillingEntry, type BillingPlan, type BillingStudent, type BillingInstallment } from '../lib/installmentBillingService';
const money = (value: number) => `EGP ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inputStyle = 'block w-full rounded-lg border border-outline-variant bg-surface p-2 text-on-surface';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Could not complete billing action.';
const EntryForm: React.FC<{ installment: BillingInstallment; onSaved: () => void }> = ({ installment, onSaved }) => {
  const [kind, setKind] = useState<'Adjustment' | 'Payment'>('Payment'), [amount, setAmount] = useState(''), [reason, setReason] = useState(''), [reference, setReference] = useState('');
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const key = useRef('');
  return <form className="mt-4 space-y-3 border-t border-outline-variant pt-3" onSubmit={(event) => { event.preventDefault(); if (!key.current) key.current = crypto.randomUUID(); setConfirm(true); }}>
    <p className="text-sm text-on-surface-variant">Record a payment already received by the university, or an individual tuition adjustment. This does not charge a wallet or card.</p>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2" onChange={() => { key.current = ''; }}>
      <label className="text-sm text-on-surface-variant">Entry type<select className={inputStyle} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="Payment">External payment received</option><option value="Adjustment">Tuition adjustment (+/−)</option></select></label>
      <CustomInput label="Amount (EGP)" type="number" step="0.01" required min={kind === 'Payment' ? '0.01' : undefined} value={amount} onChange={(event) => setAmount(event.target.value)} />
      <CustomInput label="Reason / receipt note" required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
      {kind === 'Payment' && <CustomInput label="External payment reference" required maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} />}
    </fieldset>
    {error && <AlertBanner tone="error">{error}</AlertBanner>}
    <CustomButton type="submit" size="sm" disabled={busy}>Review entry</CustomButton>
    <ConfirmDialog open={confirm} title="Confirm billing entry" tone="warning" confirmLabel="Record entry" isLoading={busy} onCancel={() => { if (!busy) setConfirm(false); }}
      message={<>Installment: {installment.label}. {kind === 'Payment' ? 'Record externally received payment' : 'Apply adjustment'} of {money(Number(amount))}. Reason: {reason}. {kind === 'Payment' && `Reference: ${reference}.`} No card or wallet will be charged.</>}
      onConfirm={() => { if (busy) return; setBusy(true); setError(null); void recordBillingEntry(installment.id, { kind, amount: Number(amount), reason, ...(kind === 'Payment' ? { externalReference: reference } : {}), submissionKey: key.current })
        .then(() => { key.current = ''; setAmount(''); setReason(''); setReference(''); setConfirm(false); onSaved(); }).catch((error) => { setError(errorMessage(error)); setConfirm(false); }).finally(() => setBusy(false)); }} />
  </form>;
};
const InstallmentBillingPage: React.FC = () => {
  const { user } = useSession(); const staff = user?.role === 'Coordinator' || user?.role === 'Administrator';
  const [plans, setPlans] = useState<BillingPlan[]>([]), [students, setStudents] = useState<BillingStudent[]>([]), [student, setStudent] = useState<BillingStudent | null>(null);
  const [rows, setRows] = useState<BillingInstallment[]>([]), [search, setSearch] = useState(''), [selectedPlan, setSelectedPlan] = useState('');
  const [name, setName] = useState(''), [year, setYear] = useState(''), [entries, setEntries] = useState([{ label: '', dueDate: '', baseAmount: '' }]);
  // Starts busy: the very first paint is the loading line, never a flash of
  // the empty state before the installments request has even been sent.
  const [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null), [success, setSuccess] = useState<string | null>(null), [refresh, setRefresh] = useState(0);
  const [assignConfirm, setAssignConfirm] = useState(false); const [isRefreshing, setIsRefreshing] = useState(false); const refreshRows = () => { setIsRefreshing(true); setRefresh((value) => value + 1); };
  // Every refresh bump re-runs both effects: staff clear on the plans fetch,
  // students on the installments fetch, so the spinner always stops.
  useEffect(() => { if (staff) void listBillingPlans().then((result) => setPlans(result.plans)).catch((error) => setError(errorMessage(error))).finally(() => setIsRefreshing(false)); }, [staff, refresh]);
  useEffect(() => {
    let active = true; setRows([]);
    if (staff && !student) { setBusy(false); return; }
    setBusy(true); setError(null);
    void listBillingInstallments(staff ? student?.id : undefined).then((result) => { if (active) setRows(result.installments); }).catch((error) => { if (active) setError(errorMessage(error)); }).finally(() => { if (active) { setBusy(false); setIsRefreshing(false); } });
    return () => { active = false; };
  }, [staff, student, refresh]);
  const run = async (action: () => Promise<{ message: string }>) => { setBusy(true); setError(null); setSuccess(null); try { const result = await action(); setSuccess(result.message); refreshRows(); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); } };
  return <>
    <PageHeader title={staff ? 'Installment billing' : 'My installments'} description="Tuition installments, additional charges and recorded payments." onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))} meta={<CustomButton variant="secondary" size="sm" onClick={refreshRows} isLoading={isRefreshing} disabled={busy} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>Refresh</CustomButton>} />
    {error && <div className="mb-4"><AlertBanner tone="error">{error}</AlertBanner></div>}{success && <div className="mb-4"><AlertBanner tone="success">{success}</AlertBanner></div>}
    {staff && <div className="mb-6 space-y-4">
      <Card className="p-5"><details><summary className="cursor-pointer font-semibold text-on-surface">Create an installment plan</summary>
        <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void run(() => createBillingPlan({ name, academicYear: year, entries: entries.map((entry) => ({ ...entry, baseAmount: Number(entry.baseAmount) })) })); }}>
          <fieldset disabled={busy} className="space-y-3"><CustomInput label="Plan name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /><CustomInput label="Academic year (YYYY/YYYY)" placeholder="2026/2027" required pattern="[0-9]{4}/[0-9]{4}" value={year} onChange={(event) => setYear(event.target.value)} />
            {entries.map((entry, index) => <div key={index} className="grid gap-3 sm:grid-cols-3"><CustomInput label={`Installment ${index + 1} name`} required value={entry.label} onChange={(event) => setEntries((items) => items.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} /><CustomInput label={`Installment ${index + 1} due date`} type="date" required value={entry.dueDate} onChange={(event) => setEntries((items) => items.map((item, i) => i === index ? { ...item, dueDate: event.target.value } : item))} /><CustomInput label={`Installment ${index + 1} tuition (EGP)`} type="number" min="0" step="0.01" required value={entry.baseAmount} onChange={(event) => setEntries((items) => items.map((item, i) => i === index ? { ...item, baseAmount: event.target.value } : item))} /></div>)}
            <div className="flex gap-3"><CustomButton size="sm" variant="secondary" disabled={entries.length >= 12} onClick={() => setEntries((items) => [...items, { label: '', dueDate: '', baseAmount: '' }])}>Add installment</CustomButton><CustomButton size="sm" variant="secondary" disabled={entries.length <= 1} onClick={() => setEntries((items) => items.slice(0, -1))}>Remove last</CustomButton><CustomButton type="submit" size="sm">Create plan</CustomButton></div>
          </fieldset><p className="text-xs text-on-surface-variant">Use official dates and amounts. Created plans are immutable; existing assignments keep their original values.</p>
        </form></details></Card>
      <Card className="space-y-3 p-5"><form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(null); void searchBillingStudents(search).then((result) => setStudents(result.students)).catch((error) => setError(errorMessage(error))).finally(() => setBusy(false)); }}><CustomInput label="Student ID, name or email" minLength={2} required value={search} onChange={(event) => setSearch(event.target.value)} /><CustomButton type="submit" size="sm" disabled={busy}>Find student</CustomButton></form>
        {students.map((item) => <CustomButton key={item.id} size="sm" variant="secondary" disabled={busy} onClick={() => { setStudent(item); setSuccess(null); }}>{item.studentId} · {item.name}</CustomButton>)}
        {student && <><p className="text-on-surface">Selected: {student.name} ({student.studentId})</p><label className="block text-sm text-on-surface-variant">Plan to assign<select className={inputStyle} value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value)}><option value="">Choose a plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.academicYear} · {plan.name}</option>)}</select></label><CustomButton size="sm" disabled={busy || !selectedPlan} onClick={() => setAssignConfirm(true)}>Review assignment</CustomButton></>}
      </Card>
      <ConfirmDialog open={assignConfirm} title="Assign installment plan" tone="warning" isLoading={busy} confirmLabel="Assign plan" message={<>Assign {plans.find((plan) => plan.id === selectedPlan)?.name} to {student?.name}? This creates the student's tuition installments. A different plan cannot replace an existing academic-year assignment here.</>} onCancel={() => { if (!busy) setAssignConfirm(false); }} onConfirm={() => { if (student && selectedPlan) void run(() => assignBillingPlan(student.id, selectedPlan)).then(() => setAssignConfirm(false)); }} />
    </div>}
    {busy && <p role="status" className="mb-4 text-on-surface-variant">Loading or saving billing records…</p>}
    {/* An empty list means two different things: for staff it is "pick a
        student first"; for a student it is genuinely nothing to pay, which
        gets the astronaut. */}
    {!busy && !rows.length && (staff ? (
      <p className="text-on-surface-variant">{student ? 'No installment plan has been assigned yet.' : 'Choose a student to view or assign installments.'}</p>
    ) : (
      <InstallmentsEmptyState />
    ))}
    <div className="space-y-4">{rows.map((row) => <Card key={row.id} className="space-y-3 p-5"><h2 className="font-semibold text-on-surface">{row.label} · {row.academicYear}</h2><p className="break-all text-sm text-on-surface-variant">{row.reference} · Due {new Date(row.dueDate).toLocaleDateString()} · {row.status}</p>
      <dl className="grid gap-2 text-sm text-on-surface-variant sm:grid-cols-3">{[['Base tuition', row.baseAmount], ['Adjustments', row.adjustments], ['Deferred extra hours', row.deferredAmount], ['Total', row.total], ['Payments received', row.paid], ['Amount due', row.amountDue]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="font-semibold text-on-surface">{money(Number(value))}</dd></div>)}</dl>
      {row.charges.map((charge) => <p key={charge.reference} className="break-all text-sm text-on-surface-variant">Extra-hours charge {charge.reference}: {money(charge.amount)} · {charge.status}</p>)}
      {row.entries.map((entry) => <p key={entry.id} className="text-sm text-on-surface-variant">{new Date(entry.recordedAt).toLocaleString()} · {entry.kind}: {money(entry.amount)} · {entry.reason}{entry.externalReference && ` · ${entry.externalReference}`}</p>)}
      {staff && row.status !== 'Cancelled' && <EntryForm installment={row} onSaved={refreshRows} />}
    </Card>)}</div>
  </>;
};
export default InstallmentBillingPage;
