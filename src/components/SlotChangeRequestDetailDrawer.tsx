import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleAlert,
  Clock,
  Hash,
  Loader2,
  MapPin,
  MessageSquareText,
  UserRound,
  X,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { fetchStaffSlotChangeRequest } from '../lib/slotChangeRequestsService';
import { SLOT_TONE, STATUS_TONE, slotLabel } from '../lib/slotChangeDisplay';
import { formatDate, formatRelative } from '../lib/studentsService';
import type { StaffSlotChangeRequestItem } from '../lib/types';
import SlotAlternativesComparison from './SlotAlternativesComparison';
import AlertBanner from './ui/AlertBanner';
import Badge from './ui/Badge';
import CustomButton from './ui/CustomButton';

interface SlotChangeRequestDetailDrawerProps {
  /** The row picked from the list; null keeps the drawer closed. */
  selected: StaffSlotChangeRequestItem | null;
  /** Whether the viewer sees every request (Coordinator) or only their own students'. */
  showsAll: boolean;
  onClose: () => void;
  /** Called when the request turned out to be gone or out of scope, so the list can refresh. */
  onStale: () => void;
}

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

const DetailRow: React.FC<DetailRowProps> = ({ icon, label, children }) => (
  <div className="flex items-start gap-3 py-2.5">
    <span className="mt-0.5 shrink-0 text-slate-500" aria-hidden>
      {icon}
    </span>
    <div className="min-w-0 flex-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-200">{children}</dd>
    </div>
  </div>
);

const when = (value: string) => (
  <>
    {formatDate(value)} <span className="text-xs text-slate-500">({formatRelative(value)})</span>
  </>
);

/**
 * Req 46: an Advisor or Coordinator opens a slot-change request picked out of
 * the list, its search results (req 44) or its filtered results (req 45).
 *
 * Rendered as a panel over the list, like the advising-details drawer
 * (req 53), so closing it returns to the same results with the same search
 * and filters. The row's data is shown at once and then replaced by a fresh
 * read; that read is checked against the viewer's scope on the server, so a
 * request that was withdrawn, decided or moved to another Advisor since the
 * list loaded is shown as it is now, or not at all.
 *
 * Req 47 adds a read-only comparison of the current slot with the other
 * groups of the same component. Deciding the request (req 48) is later.
 */
const SlotChangeRequestDetailDrawer: React.FC<SlotChangeRequestDetailDrawerProps> = ({
  selected,
  showsAll,
  onClose,
  onStale,
}) => {
  const [request, setRequest] = useState<StaffSlotChangeRequestItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGone, setIsGone] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const selectedId = selected?.id ?? null;

  useEffect(() => {
    if (!selected) return;

    let cancelled = false;
    setRequest(selected);
    setError(null);
    setIsGone(false);
    setIsLoading(true);

    fetchStaffSlotChangeRequest(selected.id)
      .then((response) => {
        if (!cancelled) setRequest(response.request);
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        if (err.status === 404) {
          // Gone, or no longer one of this Advisor's students: show nothing stale.
          setIsGone(true);
          setRequest(null);
          onStale();
        } else {
          setError(err.message || 'Could not load the latest details.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Re-read only when a different request is opened; the row object itself
    // is replaced whenever the list refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Escape closes the panel, matching the close button; focus starts on it.
  useEffect(() => {
    if (!selectedId) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, onClose]);

  if (!selected) return null;

  const responder = request?.response?.respondedBy;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="slot-change-detail-title"
        aria-busy={isLoading}
        className="relative flex h-full w-full max-w-lg flex-col border-l border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Slot-change request</p>
            <h2 id="slot-change-detail-title" className="mt-1 truncate text-lg font-bold text-white">
              {request?.student?.fullName ?? (isGone ? 'Request unavailable' : 'Student record removed')}
            </h2>
            {request?.student && (
              <p className="mt-0.5 truncate font-mono text-xs text-slate-500">{request.student.studentId}</p>
            )}
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close request details"
            className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {isGone && (
            <AlertBanner tone="error" title="This request is no longer available">
              It may have been removed, or the student is no longer assigned to you. The list has been refreshed.
            </AlertBanner>
          )}
          {error && (
            <AlertBanner tone="error" title="Could not load the latest details">
              {error} The details below are from the list and may be out of date.
            </AlertBanner>
          )}

          {request && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[request.status]} dot>
                  {request.status}
                </Badge>
                <Badge tone={SLOT_TONE[request.slotType]}>{request.slotType}</Badge>
                {isLoading && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Checking for updates...
                  </span>
                )}
              </div>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Requested change</h3>
                <dl className="divide-y divide-slate-800/70">
                  <DetailRow icon={<BookOpen className="h-4 w-4" />} label="Course">
                    {request.course ? (
                      <>
                        <span className="font-mono font-semibold text-indigo-300">{request.course.code}</span>{' '}
                        {request.course.name}
                      </>
                    ) : (
                      <span className="text-slate-500">Course removed</span>
                    )}
                    {request.term && <span className="block text-xs text-slate-500">{request.term.label}</span>}
                  </DetailRow>
                  <DetailRow icon={<Clock className="h-4 w-4" />} label={`Current ${request.slotType.toLowerCase()} slot`}>
                    {slotLabel(request.currentSlot)}
                  </DetailRow>
                  <DetailRow icon={<MapPin className="h-4 w-4" />} label="Room">
                    {request.currentSlot.room}
                  </DetailRow>
                  <DetailRow icon={<MessageSquareText className="h-4 w-4" />} label="Student's preference note">
                    {request.preferenceNote ? (
                      <span className="whitespace-pre-wrap">{request.preferenceNote}</span>
                    ) : (
                      <span className="text-slate-500">No note</span>
                    )}
                  </DetailRow>
                  <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Submitted">
                    {when(request.submittedAt)}
                  </DetailRow>
                </dl>
              </section>

              {/* Req 47: current slot vs. the other groups of this component. Read-only. */}
              <SlotAlternativesComparison requestId={request.id} courseCode={request.course?.code ?? null} />

              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Student</h3>
                <dl className="divide-y divide-slate-800/70">
                  <DetailRow icon={<UserRound className="h-4 w-4" />} label="Name and ID">
                    {request.student ? (
                      <>
                        {request.student.fullName}{' '}
                        <span className="font-mono text-xs text-slate-500">{request.student.studentId}</span>
                      </>
                    ) : (
                      <span className="text-slate-500">Student record removed</span>
                    )}
                  </DetailRow>
                  <DetailRow icon={<UserRound className="h-4 w-4" />} label="Current Advisor">
                    {request.advisor ? (
                      <>
                        {request.advisor.fullName}
                        {!showsAll && <span className="text-xs text-slate-500"> (you)</span>}
                      </>
                    ) : (
                      <span className="text-slate-500">Unassigned</span>
                    )}
                  </DetailRow>
                </dl>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Outcome</h3>
                <dl className="divide-y divide-slate-800/70">
                  {request.status === 'Pending' && (
                    <DetailRow icon={<CircleAlert className="h-4 w-4" />} label="Decision">
                      <span className="text-slate-300">Awaiting an Advisor or Coordinator decision</span>
                    </DetailRow>
                  )}
                  {request.status === 'Withdrawn' && (
                    <DetailRow icon={<CircleAlert className="h-4 w-4" />} label="Withdrawn by the student">
                      {request.withdrawnAt ? when(request.withdrawnAt) : <span className="text-slate-500">Date not recorded</span>}
                    </DetailRow>
                  )}
                  {request.response && (
                    <>
                      <DetailRow icon={<UserRound className="h-4 w-4" />} label="Decided by">
                        {responder ? `${responder.name} (${responder.role})` : 'Advisor or Coordinator'}
                        {request.response.respondedAt && (
                          <span className="block text-xs text-slate-500">{formatDate(request.response.respondedAt)}</span>
                        )}
                      </DetailRow>
                      {request.status === 'Approved' && (
                        <DetailRow icon={<ArrowRight className="h-4 w-4" />} label="Replacement slot">
                          {request.response.replacementSlot ? (
                            <>
                              {slotLabel(request.response.replacementSlot)}
                              <span className="block text-xs text-slate-500">{request.response.replacementSlot.room}</span>
                            </>
                          ) : (
                            <span className="text-slate-500">No longer available</span>
                          )}
                        </DetailRow>
                      )}
                      <DetailRow icon={<MessageSquareText className="h-4 w-4" />} label="Response note">
                        {request.response.note ? (
                          <span className="whitespace-pre-wrap">{request.response.note}</span>
                        ) : (
                          <span className="text-slate-500">No note</span>
                        )}
                      </DetailRow>
                    </>
                  )}
                </dl>
              </section>

              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Hash className="h-3.5 w-3.5" aria-hidden />
                Request <span className="font-mono">{request.id}</span>
              </p>
            </>
          )}
        </div>

        <div className="border-t border-slate-800 p-6">
          <CustomButton variant="ghost" size="sm" fullWidth onClick={onClose}>
            Back to results
          </CustomButton>
        </div>
      </aside>
    </div>
  );
};

export default SlotChangeRequestDetailDrawer;
