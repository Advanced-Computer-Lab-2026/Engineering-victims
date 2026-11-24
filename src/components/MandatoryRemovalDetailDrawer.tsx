import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarDays, FileText, Link2, Loader2, MessageSquareText, UserRound, X } from 'lucide-react';
import { ApiError } from '../lib/api';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { REMOVAL_STATUS_TONE } from '../lib/mandatoryRemovalDisplay';
import { fetchMandatoryRemovalRequest } from '../lib/mandatoryRemovalService';
import { formatDate, formatRelative } from '../lib/studentsService';
import type { MandatoryRemovalRequestSummary } from '../lib/types';
import MandatoryRemovalDecisionPanel from './MandatoryRemovalDecisionPanel';
import AlertBanner from './ui/AlertBanner';
import Badge from './ui/Badge';

interface MandatoryRemovalDetailDrawerProps {
  /** The row picked from the list; null keeps the drawer closed. */
  selected: MandatoryRemovalRequestSummary | null;
  onClose: () => void;
  /** Called when the request turned out to be gone, so the list can refresh. */
  onStale: () => void;
  /** Req 69: called after a decision is saved, so the list can refresh with the same search and filters. */
  onDecided: () => void;
}

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

const DetailRow: React.FC<DetailRowProps> = ({ icon, label, children }) => (
  <div className="flex items-start gap-3 py-2.5">
    <span className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden>
      {icon}
    </span>
    <div className="min-w-0 flex-1">
      <dt className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">{label}</dt>
      <dd className="mt-0.5 break-words text-body text-on-surface">{children}</dd>
    </div>
  </div>
);

const when = (value: string) => (
  <>
    {formatDate(value)} <span className="text-caption text-on-surface-variant">({formatRelative(value)})</span>
  </>
);

/**
 * Req 68: a Coordinator opens a removal request picked out of the list, its
 * search results (req 66) or its filtered results (req 67).
 *
 * Rendered as a panel over the list, like the slot-change details (req 46), so
 * closing it returns to the same results with the same search and filters. The
 * row's data is shown at once and then replaced by a fresh read, so a request
 * decided since the list loaded is shown as it is now.
 *
 * Req 69: while the request is Pending the decision panel is shown; once it is
 * decided, the drawer shows the recorded decision instead.
 */
const MandatoryRemovalDetailDrawer: React.FC<MandatoryRemovalDetailDrawerProps> = ({
  selected,
  onClose,
  onStale,
  onDecided,
}) => {
  const [request, setRequest] = useState<MandatoryRemovalRequestSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGone, setIsGone] = useState(false);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const selectedId = selected?.id ?? null;
  const trapRef = useFocusTrap<HTMLElement>(!!selectedId);

  /** Req 69: show the decided request, and refresh the list behind it. */
  const handleDecided = useCallback(
    (updated: MandatoryRemovalRequestSummary | null, message: string) => {
      setDecisionNotice(message);
      if (updated) {
        setRequest(updated);
      } else if (selectedId) {
        fetchMandatoryRemovalRequest(selectedId)
          .then((response) => setRequest(response.request))
          .catch(() => undefined);
      }
      onDecided();
    },
    [selectedId, onDecided]
  );

  useEffect(() => {
    if (!selected) return;

    let cancelled = false;
    setRequest(selected);
    setError(null);
    setIsGone(false);
    setIsLoading(true);
    setDecisionNotice(null);

    fetchMandatoryRemovalRequest(selected.id)
      .then((response) => {
        if (!cancelled) setRequest(response.request);
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        if (err.status === 404) {
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

  const decided = request && request.status !== 'Pending';

  return (
    <div className="fixed inset-0 z-modal flex justify-end">
      <div className="absolute inset-0 scrim backdrop-blur-sm" onClick={onClose} aria-hidden />

      <aside
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="removal-detail-title"
        aria-busy={isLoading}
        className="relative flex h-full w-full max-w-lg flex-col border-l border-outline-variant bg-surface-container-lowest shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant p-6">
          <div className="min-w-0">
            <p className="text-caption font-semibold uppercase tracking-eyebrow text-primary">Removal request</p>
            <h2 id="removal-detail-title" className="mt-1 truncate text-h3 font-bold text-on-surface">
              {request?.student?.fullName ?? (isGone ? 'Request unavailable' : 'Student record removed')}
            </h2>
            {request?.student && (
              <p className="mt-0.5 truncate font-mono text-caption text-on-surface-variant">{request.student.studentId}</p>
            )}
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close request details"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {isGone && (
            <AlertBanner tone="error" title="This request is no longer available">
              It may have been removed. The list has been refreshed.
            </AlertBanner>
          )}
          {error && (
            <AlertBanner tone="error" title="Could not load the latest details">
              {error} The details below are from the list and may be out of date.
            </AlertBanner>
          )}
          {decisionNotice && (
            <AlertBanner tone="success" title="Decision saved" onDismiss={() => setDecisionNotice(null)}>
              {decisionNotice}
            </AlertBanner>
          )}

          {request && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={REMOVAL_STATUS_TONE[request.status]} dot>
                  {request.status}
                </Badge>
                {isLoading && (
                  <span className="flex items-center gap-1.5 text-caption text-on-surface-variant">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Checking for updates...
                  </span>
                )}
              </div>

              <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
                <h3 className="mb-1 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                  Requested removal
                </h3>
                <dl className="divide-y divide-outline-variant">
                  <DetailRow icon={<BookOpen className="h-4 w-4" />} label="Course">
                    {request.course ? (
                      <>
                        <span className="font-mono font-semibold text-primary">{request.course.code}</span>{' '}
                        {request.course.name}
                        <span className="block text-caption text-on-surface-variant">
                          {request.course.creditHours} credit hours
                        </span>
                      </>
                    ) : (
                      <span className="text-on-surface-variant">Course removed</span>
                    )}
                  </DetailRow>
                  <DetailRow icon={<UserRound className="h-4 w-4" />} label="Requested by">
                    {request.advisor ? (
                      <>
                        {request.advisor.fullName}
                        <span className="block text-caption text-on-surface-variant">{request.advisor.email}</span>
                      </>
                    ) : (
                      <span className="text-on-surface-variant">Advisor record removed</span>
                    )}
                  </DetailRow>
                  <DetailRow icon={<FileText className="h-4 w-4" />} label="Case">
                    {request.category}
                  </DetailRow>
                  {request.pairedCourse && (
                    <DetailRow icon={<Link2 className="h-4 w-4" />} label="Other course of the pair">
                      <span className="font-mono font-semibold text-primary">{request.pairedCourse.code}</span>{' '}
                      {request.pairedCourse.name}
                    </DetailRow>
                  )}
                  <DetailRow icon={<MessageSquareText className="h-4 w-4" />} label="Reason">
                    <span className="whitespace-pre-wrap">{request.reason}</span>
                  </DetailRow>
                  <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Submitted">
                    {when(request.submittedAt)}
                  </DetailRow>
                </dl>
              </section>

              {decided && (
                <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
                  <h3 className="mb-1 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                    Decision
                  </h3>
                  <dl className="divide-y divide-outline-variant">
                    <DetailRow icon={<MessageSquareText className="h-4 w-4" />} label="Response note">
                      {request.responseNote ? (
                        <span className="whitespace-pre-wrap">{request.responseNote}</span>
                      ) : (
                        <span className="text-on-surface-variant">No note was recorded.</span>
                      )}
                    </DetailRow>
                    <DetailRow icon={<UserRound className="h-4 w-4" />} label="Decided by">
                      {request.decidedBy?.fullName ?? <span className="text-on-surface-variant">Not recorded</span>}
                    </DetailRow>
                    {request.decidedAt && (
                      <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Decided">
                        {when(request.decidedAt)}
                      </DetailRow>
                    )}
                  </dl>
                </section>
              )}

              {request.status === 'Pending' && !isGone && (
                <MandatoryRemovalDecisionPanel request={request} onDecided={handleDecided} />
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
};

export default MandatoryRemovalDetailDrawer;
