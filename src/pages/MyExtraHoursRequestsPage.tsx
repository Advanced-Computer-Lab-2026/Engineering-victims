import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import AlertBanner from '../components/ui/AlertBanner';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import { fetchMyExtraHoursRequests, type StudentExtraHoursRequest } from '../lib/extraHoursReviewService';

const money = (value: number) => `EGP ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MyExtraHoursRequestsPage: React.FC = () => {
  const [rows, setRows] = useState<StudentExtraHoursRequest[]>([]);
  const [page, setPage] = useState(1), [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const retry = useCallback(() => setRefresh((value) => value + 1), []);
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
    {error ? <AlertBanner tone="error">{error}</AlertBanner> : loading ? <Card className="flex items-center justify-center gap-2 p-12 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading requests…</Card>
      : rows.length === 0 ? <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No approved extra-hours requests" description="Your requests appear here after Coordinator approval." />
      : <div className="space-y-5">
        <AlertBanner tone="info">Approval confirms eligibility and cost. Approval alone does not activate extra hours or add courses to your schedule.</AlertBanner>
        {rows.map((row) => <Card key={row.id} className="space-y-3 p-5">
          <h2 className="break-all font-semibold text-white">{row.reference}</h2>
          <p className="text-sm text-slate-300">{row.term} · {row.decision} · {row.settlementStatus}</p>
          <p className="text-xs text-slate-400">Approved: {row.decidedAt ? new Date(row.decidedAt).toLocaleString() : 'Not recorded'}</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm text-slate-300"><caption className="sr-only">Courses and itemized costs for {row.reference}</caption>
            <thead><tr>{['Course', 'Course credit hours', 'Requested extra hours', 'Type', 'Price per hour', 'Subtotal'].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
            <tbody>{row.items.map((item) => <tr key={item.courseId} className="border-t border-slate-800"><td className="p-2">{item.code}<span className="block text-xs text-slate-400">{item.name}</span></td><td className="p-2">{item.creditHours}</td><td className="p-2">{item.requestedHours}</td><td className="p-2">{item.classification}</td><td className="p-2">{money(item.ratePerHour)}</td><td className="p-2">{money(item.subtotal)}</td></tr>)}</tbody>
          </table></div>
          <p className="font-semibold text-white">{row.requestedHours} requested extra hours · Total: {money(row.totalCost)}</p>
        </Card>)}
        <p className="text-sm text-slate-400">Page {page} of {pages}</p>
        <div className="flex gap-3"><CustomButton variant="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</CustomButton><CustomButton variant="secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</CustomButton></div>
      </div>}
  </>;
};
export default MyExtraHoursRequestsPage;
