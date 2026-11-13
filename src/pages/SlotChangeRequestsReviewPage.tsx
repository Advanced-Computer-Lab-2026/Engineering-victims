import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ClipboardList, Loader2, RotateCcw } from 'lucide-react';
import type { ApiError } from '../lib/api';
import type { SlotChangeRequestStatus, StaffSlotChangeRequestItem, StaffSlotChangeRequestList } from '../lib/types';
import { fetchStaffSlotChangeRequests } from '../lib/slotChangeRequestsService';
import { formatDate } from '../lib/studentsService';
import { useSession } from '../hooks/useSession';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';

const STATUS_TONE: Record<SlotChangeRequestStatus, BadgeTone> = {
  Pending: 'amber',
  Approved: 'emerald',
  Rejected: 'rose',
  Withdrawn: 'neutral',
};

const SLOT_TONE: Record<StaffSlotChangeRequestItem['slotType'], BadgeTone> = {
  Lecture: 'indigo',
  Tutorial: 'sky',
  Lab: 'emerald',
};

type Slot = StaffSlotChangeRequestItem['currentSlot'];

const slotLabel = (slot: Slot) => `Group ${slot.groupNumber} · ${slot.dayOfWeek} ${slot.startTime}–${slot.endTime}`;

/** One short line for the outcome column; the full response lives in the details (req 46). */
const outcomeSummary = (item: StaffSlotChangeRequestItem): React.ReactNode => {
  if (item.status === 'Pending') return <span className="text-slate-500">Awaiting decision</span>;
  if (item.status === 'Withdrawn') {
    return (
      <span className="text-slate-500">
        Withdrawn by student{item.withdrawnAt ? ` · ${formatDate(item.withdrawnAt)}` : ''}
      </span>
    );
  }
  const responder = item.response?.respondedBy;
  return (
    <div className="space-y-0.5">
      {item.status === 'Approved' && item.response?.replacementSlot && (
        <p className="flex items-center gap-1 text-emerald-300">
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          {slotLabel(item.response.replacementSlot)}
        </p>
      )}
      <p className="text-xs text-slate-500">
        {responder ? `${responder.role} · ${responder.name}` : 'Advisor or Coordinator'}
        {item.response?.respondedAt ? ` · ${formatDate(item.response.respondedAt)}` : ''}
      </p>
    </div>
  );
};

/**
 * Req 43: Advisors see slot-change requests from the advising students
 * currently assigned to them; Coordinators see every request. All statuses,
 * newest first. The API decides the scope from the session alone, so this
 * page only reflects it. Search, filters and details are later requirements.
 */
const SlotChangeRequestsReviewPage: React.FC = () => {
  const { user } = useSession();
  const [data, setData] = useState<StaffSlotChangeRequestList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      setData(await fetchStaffSlotChangeRequests());
    } catch (err) {
      setError((err as ApiError).message || 'Could not load slot-change requests.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showsAll = data ? data.scope === 'all' : user?.role === 'Coordinator';
  const requests = data?.requests ?? [];

  return (
    <>
      <PageHeader
        title="Slot-Change Requests"
        description={
          showsAll
            ? 'Every advising-student slot-change request, newest first.'
            : 'Slot-change requests from the advising students assigned to you, newest first.'
        }
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <CustomButton
            variant="secondary"
            size="sm"
            onClick={() => load(true)}
            isLoading={isRefreshing}
            icon={<RotateCcw className="h-4 w-4" aria-hidden />}
          >
            Refresh
          </CustomButton>
        }
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load requests" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading slot-change requests...
        </Card>
      ) : requests.length === 0 ? (
        !error && (
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title={showsAll ? 'No slot-change requests yet' : 'No requests from your assigned students'}
            description={
              showsAll
                ? 'Requests appear here once an advising student asks to change a slot in their schedule under review.'
                : 'Requests appear here once one of your assigned advising students asks to change a slot.'
            }
          />
        )
      ) : (
        <Card tone="raised" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                  {showsAll && (
                    <th scope="col" className="px-4 py-3 font-semibold">Advisor</th>
                  )}
                  <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Current slot</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Submitted</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {requests.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      {item.student ? (
                        <>
                          <p className="font-medium text-slate-100">{item.student.fullName}</p>
                          <p className="font-mono text-xs text-slate-500">{item.student.studentId}</p>
                        </>
                      ) : (
                        <span className="text-slate-500">Student record removed</span>
                      )}
                    </td>
                    {showsAll && (
                      <td className="px-4 py-3">
                        {item.advisor ? (
                          <span className="text-slate-200">{item.advisor.fullName}</span>
                        ) : (
                          <span className="text-slate-500">Unassigned</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <p className="font-mono font-semibold text-indigo-300">{item.course?.code ?? 'Course removed'}</p>
                      {item.term && <p className="text-xs text-slate-500">{item.term.label}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={SLOT_TONE[item.slotType]}>{item.slotType}</Badge>
                        <span className="whitespace-nowrap text-xs text-slate-300">{slotLabel(item.currentSlot)}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">{formatDate(item.submittedAt)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[item.status]} dot>
                        {item.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">{outcomeSummary(item)}</td>
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

export default SlotChangeRequestsReviewPage;
