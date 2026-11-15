import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Columns2, Loader2, Lock, MapPin, RotateCcw, UsersRound, XCircle } from 'lucide-react';
import type { ApiError } from '../lib/api';
import { fetchSlotChangeAlternatives } from '../lib/slotChangeRequestsService';
import type { SlotAlternative, SlotChangeComparison, SlotComparisonTimes } from '../lib/types';
import AlertBanner from './ui/AlertBanner';
import Badge from './ui/Badge';
import CustomButton from './ui/CustomButton';

interface SlotAlternativesComparisonProps {
  requestId: string;
  courseCode: string | null;
  /** Req 48: lets staff choose one available group as the replacement. */
  selectable?: boolean;
  selectedId?: string | null;
  onSelect?: (alternative: SlotAlternative | null) => void;
  /** Req 48: change it to re-read seats and clashes (e.g. after a refused approval). */
  reloadKey?: number;
  /** Req 48: while a decision is being confirmed or saved, the chosen group cannot change. */
  selectionLocked?: boolean;
}

const timeLine = (slot: SlotComparisonTimes) => `${slot.dayOfWeek} ${slot.startTime}–${slot.endTime}`;

/** Seats as "8 of 60 left", with the bar the eye scans first. */
const SeatMeter: React.FC<{ remaining: number; capacity: number; assigned: number }> = ({ remaining, capacity, assigned }) => {
  const used = capacity > 0 ? Math.min(100, Math.round((Math.max(0, assigned) / capacity) * 100)) : 100;
  const tone = remaining === 0 ? 'bg-error' : remaining <= 2 ? 'bg-warning' : 'bg-success';
  return (
    <div className="min-w-[7.5rem]">
      <p className="text-body font-semibold tabular-nums text-on-surface">
        {remaining} <span className="text-caption font-normal text-on-surface-variant">of {capacity} left</span>
      </p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container" aria-hidden>
        <div className={`h-full ${tone}`} style={{ width: `${used}%` }} />
      </div>
      <p className="mt-0.5 text-caption tabular-nums text-on-surface-variant">{assigned} assigned</p>
    </div>
  );
};

/** The verdict for one alternative: available, or each reason it cannot be offered. */
const Verdict: React.FC<{ alt: SlotAlternative }> = ({ alt }) => {
  if (alt.isEligible) {
    return (
      <Badge tone="emerald" dot>
        Available
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {alt.reasons.includes('full') && <Badge tone="rose">Full</Badge>}
      {alt.reasons.includes('clash') && (
        <Badge tone="amber">
          {alt.clashes.length === 1 ? 'Clash' : `${alt.clashes.length} clashes`}
        </Badge>
      )}
      {alt.reasons.includes('already-assigned') && <Badge tone="neutral">Already in schedule</Badge>}
      {alt.reasons.includes('timetable-unavailable') && <Badge tone="neutral">Timetable unknown</Badge>}
    </div>
  );
};

/**
 * Req 47: the student's current slot beside every other group of the same
 * course offering and component, with remaining seats and clashes against
 * the rest of the student's timetable. Everything comes from the server,
 * which finds the request inside the viewer's scope first.
 *
 * Req 48: with `selectable`, each available group can be chosen as the
 * replacement; full, clashing or otherwise unavailable groups stay visible
 * but cannot be chosen. Without it the comparison stays read-only. The server
 * re-checks the chosen group when the request is approved.
 */
const SlotAlternativesComparison: React.FC<SlotAlternativesComparisonProps> = ({
  requestId,
  courseCode,
  selectable = false,
  selectedId = null,
  onSelect,
  reloadKey = 0,
  selectionLocked = false,
}) => {
  const [comparison, setComparison] = useState<SlotChangeComparison | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchSlotChangeAlternatives(requestId)
      .then((result) => {
        if (!cancelled) setComparison(result);
      })
      .catch((err: ApiError) => {
        if (!cancelled) setError(err.message || 'Could not compare the alternative slots.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  // One effect, so each change of request or reload asks the server once. A
  // new request starts from an empty view; a reload (req 48) re-reads in
  // place, keeping the current view until the answer arrives.
  const shownRequest = useRef<string | null>(null);
  useEffect(() => {
    if (shownRequest.current !== requestId) {
      shownRequest.current = requestId;
      setComparison(null);
    }
    return load();
  }, [load, reloadKey]);

  // After a read, a chosen group that is no longer available is unchosen, and
  // one that still is is handed back with its fresh seats.
  useEffect(() => {
    if (!comparison || !selectedId || !onSelect) return;
    const still = comparison.alternatives.find((alt) => alt.id === selectedId);
    // Choosing a group hands back this same object, so that is a no-op.
    onSelect(still && still.isEligible ? still : null);
  }, [comparison, selectedId, onSelect]);

  const component = comparison?.slotType.toLowerCase() ?? 'slot';

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-4" aria-labelledby="slot-compare-title" aria-busy={isLoading}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="slot-compare-title" className="flex items-center gap-2 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
          <Columns2 className="h-4 w-4" aria-hidden />
          Compare alternatives
        </h3>
        {comparison && comparison.summary.total > 0 && (
          <div className="flex flex-wrap gap-1.5 text-caption" aria-label="Summary">
            <Badge tone="emerald">{comparison.summary.eligible} available</Badge>
            {comparison.summary.full > 0 && <Badge tone="rose">{comparison.summary.full} full</Badge>}
            {comparison.summary.clashing > 0 && <Badge tone="amber">{comparison.summary.clashing} clashing</Badge>}
          </div>
        )}
      </div>

      {isLoading && !comparison && (
        <div className="flex items-center justify-center gap-2 py-8 text-body text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Checking other groups, seats and clashes...
        </div>
      )}

      {error && (
        <AlertBanner tone="error" title="Could not compare the alternative slots">
          <span className="block">{error}</span>
          <CustomButton
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => load()}
            icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
          >
            Try again
          </CustomButton>
        </AlertBanner>
      )}

      {comparison && (
        <div className="space-y-3">
          {comparison.status !== 'Pending' && (
            <p className="rounded-lg bg-surface-container px-3 py-2 text-caption text-on-surface-variant">
              This request is {comparison.status.toLowerCase()}. Seats and clashes below reflect the timetable as it is now.
            </p>
          )}
          {!comparison.timetableChecked && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-container px-3 py-2 text-caption text-on-warning-container">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              The student record is no longer available, so clashes could not be checked and no group is marked available.
            </p>
          )}

          {/* The current slot, as the reference point for every comparison below. */}
          <div className="rounded-xl border border-primary bg-primary-container p-3">
            <p className="text-caption font-semibold uppercase tracking-eyebrow text-on-primary-container">
              Current {component} · Group {comparison.current.groupNumber}
            </p>
            <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body font-medium text-on-surface">{timeLine(comparison.current)}</p>
                <p className="mt-0.5 flex items-center gap-1 text-caption text-on-surface-variant">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {comparison.current.room}
                </p>
              </div>
              {comparison.current.missing || comparison.current.remainingSeats === null ? (
                <p className="max-w-[14rem] text-caption text-on-surface-variant">
                  This slot no longer exists; the times shown are from the request.
                </p>
              ) : (
                <SeatMeter
                  remaining={comparison.current.remainingSeats}
                  capacity={comparison.current.maxCapacity ?? 0}
                  assigned={comparison.current.assignedCount ?? 0}
                />
              )}
            </div>
          </div>

          {comparison.alternatives.length === 0 ? (
            <div className="rounded-xl border border-dashed border-outline-variant px-4 py-6 text-center">
              <UsersRound className="mx-auto h-5 w-5 text-on-surface-variant" aria-hidden />
              <p className="mt-2 text-body font-medium text-on-surface">No other {component} groups</p>
              <p className="mt-1 text-caption text-on-surface-variant">
                {courseCode ?? 'This course'} has only this {component} group in the term, so there is nothing to move
                the student to.
              </p>
            </div>
          ) : (
            <ul className="space-y-2" aria-label={`Other ${component} groups`}>
              {comparison.alternatives.map((alt) => (
                <li
                  key={alt.id}
                  className={`rounded-xl border p-3 ${
                    selectable && selectedId === alt.id
                      ? 'border-primary bg-primary-container ring-1 ring-primary'
                      : alt.isEligible
                        ? 'border-success bg-success-container'
                        : 'border-outline-variant bg-surface-container'
                  }`}
                  aria-label={`Group ${alt.groupNumber}: ${alt.isEligible ? 'available' : 'not available'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {selectable && (
                          // Req 48: only an available group can be chosen as the replacement.
                          <input
                            type="radio"
                            id={`replacement-${alt.id}`}
                            name={`replacement-${requestId}`}
                            value={alt.id}
                            checked={selectedId === alt.id}
                            disabled={!alt.isEligible || selectionLocked}
                            onChange={() => {
                              if (!selectionLocked) onSelect?.(alt);
                            }}
                            aria-describedby={`replacement-${alt.id}-why`}
                            className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        )}
                        <label
                          htmlFor={selectable ? `replacement-${alt.id}` : undefined}
                          className={`text-body font-semibold text-on-surface ${selectable && alt.isEligible && !selectionLocked ? 'cursor-pointer' : ''}`}
                        >
                          Group {alt.groupNumber}
                        </label>
                        <span id={`replacement-${alt.id}-why`} className="sr-only">
                          {alt.isEligible ? 'Available' : `Cannot be chosen: ${alt.reasons.join(', ')}`}
                        </span>
                        <Verdict alt={alt} />
                      </div>
                      <p className={`text-body ${alt.isEligible ? 'text-on-surface' : 'text-on-surface-variant'}`}>{timeLine(alt)}</p>
                      <p className="flex items-center gap-1 text-caption text-on-surface-variant">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {alt.room}
                      </p>
                    </div>
                    <SeatMeter remaining={alt.remainingSeats} capacity={alt.maxCapacity} assigned={alt.assignedCount} />
                  </div>

                  {alt.clashes.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-outline-variant pt-2">
                      {alt.clashes.map((clash) => (
                        <li key={clash.slotId} className="flex items-start gap-1.5 text-caption text-warning">
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span>
                            Clashes with {clash.course?.code ?? 'another course'} {clash.slotType} G{clash.groupNumber} ·{' '}
                            {timeLine(clash)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {alt.isEligible && (
                    <p className="mt-2 flex items-center gap-1.5 text-caption text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      Has a free seat and fits the student's timetable.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="flex items-center gap-1.5 text-caption text-on-surface-variant">
            <Lock className="h-3 w-3" aria-hidden />
            {selectable
              ? 'Only available groups can be chosen. Seats and clashes are checked again when you approve.'
              : 'Comparison only. Nothing is changed here.'}
          </p>
        </div>
      )}
    </section>
  );
};

export default SlotAlternativesComparison;
