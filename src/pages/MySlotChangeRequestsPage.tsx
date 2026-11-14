import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ClipboardList, Loader2, MessageSquare, RotateCcw } from 'lucide-react';
import type { ApiError } from '../lib/api';
import type { SlotChangeRequestItem, SlotChangeRequestStatus } from '../lib/types';
import { fetchMySlotChangeRequests } from '../lib/slotChangeRequestsService';
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

const SLOT_TONE: Record<SlotChangeRequestItem['slotType'], BadgeTone> = {
  Lecture: 'indigo',
  Tutorial: 'sky',
  Lab: 'emerald',
};

type Slot = SlotChangeRequestItem['currentSlot'];

const slotLabel = (slot: Slot) =>
  `Group ${slot.groupNumber} · ${slot.dayOfWeek} ${slot.startTime}–${slot.endTime} · ${slot.room}`;

const formatDateTime = (value: string) => new Date(value).toLocaleString();

/** Req 41: the Advisor or Coordinator response, or what the student waits for. */
const ResponseBlock: React.FC<{ item: SlotChangeRequestItem }> = ({ item }) => {
  if (item.status === 'Pending') {
    return <p className="text-xs text-slate-400">Waiting for an Advisor or Coordinator response.</p>;
  }
  if (item.status === 'Withdrawn') {
    return (
      <p className="text-xs text-slate-400">
        You withdrew this request{item.withdrawnAt ? ` on ${formatDateTime(item.withdrawnAt)}` : ''}.
      </p>
    );
  }

  const { response } = item;
  return (
    <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
        {response?.respondedBy ? (
          <>
            <span className="font-semibold text-slate-200">{response.respondedBy.role}</span>
            <span>· {response.respondedBy.name}</span>
          </>
        ) : (
          <span className="font-semibold text-slate-200">Advisor or Coordinator</span>
        )}
        {response?.respondedAt && <span>· {formatDateTime(response.respondedAt)}</span>}
      </p>

      <p className="text-sm text-slate-200">
        {response?.note ? response.note : <span className="italic text-slate-400">No response note was given.</span>}
      </p>

      {item.status === 'Approved' && (
        <p className="text-xs text-emerald-300">
          {response?.replacementSlot ? (
            <>
              Replacement slot: <span className="font-semibold">{slotLabel(response.replacementSlot)}</span>
            </>
          ) : (
            'The replacement slot is no longer available to display.'
          )}
        </p>
      )}
    </div>
  );
};

/**
 * Req 41: an Advising Student's own slot-change requests from every term,
 * newest first, with their statuses and the Advisor or Coordinator response,
 * including any approved replacement slot. The API only ever returns the
 * signed-in student's own requests.
 */
const MySlotChangeRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState<SlotChangeRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      setRequests(await fetchMySlotChangeRequests());
    } catch (err) {
      setError((err as ApiError).message || 'Could not load your slot-change requests.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="My Slot-Change Requests"
        description="Your requests to change a lecture, tutorial or lab slot, their statuses and the Advisor or Coordinator response."
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
          Loading your slot-change requests...
        </Card>
      ) : requests.length === 0 ? (
        !error && (
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title="No slot-change requests yet"
            description="When you request a change to a slot from a course's details on My Registered Courses, it will appear here with its status and response."
          />
        )
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            All requests ({requests.length})
          </h2>
          {requests.map((item) => (
            <Card key={item.id} tone="raised" className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-sm font-bold text-indigo-300">{item.course?.code ?? 'Course removed'}</span>
                {item.course && <span className="text-sm text-slate-200">{item.course.name}</span>}
                <Badge tone={SLOT_TONE[item.slotType]}>{item.slotType}</Badge>
                <Badge tone={STATUS_TONE[item.status]} dot>
                  {item.status}
                </Badge>
              </div>

              <p className="text-xs text-slate-400">
                {item.term ? `${item.term.label} · ` : ''}Submitted {formatDateTime(item.submittedAt)}
              </p>

              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                <span className="text-xs uppercase tracking-wide text-slate-500">Current slot</span>
                <span>{slotLabel(item.currentSlot)}</span>
                {item.status === 'Approved' && item.response?.replacementSlot && (
                  <>
                    <ArrowRight className="h-4 w-4 text-emerald-400" aria-label="replaced by" />
                    <span className="text-emerald-300">{slotLabel(item.response.replacementSlot)}</span>
                  </>
                )}
              </div>

              {item.preferenceNote && (
                <p className="text-xs text-slate-400">
                  Your note: <span className="text-slate-300">{item.preferenceNote}</span>
                </p>
              )}

              <ResponseBlock item={item} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
};

export default MySlotChangeRequestsPage;
