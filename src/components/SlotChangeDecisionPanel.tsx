import React, { useEffect, useState } from 'react';
import { Check, Gavel, Loader2, X } from 'lucide-react';
import { ApiError } from '../lib/api';
import {
  approveSlotChangeRequest,
  rejectSlotChangeRequest,
  SLOT_CHANGE_NOTE_LIMIT,
} from '../lib/slotChangeRequestsService';
import {
  confirmationStillValid,
  decisionCall,
  openConfirmation,
  type DecisionConfirmation,
} from '../lib/slotChangeDecisionFlow';
import type { SlotAlternative, StaffSlotChangeRequestItem } from '../lib/types';
import AlertBanner from './ui/AlertBanner';
import CustomButton from './ui/CustomButton';

interface SlotChangeDecisionPanelProps {
  request: StaffSlotChangeRequestItem;
  /** The available group chosen in the comparison, if any. */
  replacement: SlotAlternative | null;
  /** The decision was saved; `updated` is the request as it is now (null if re-reading it failed). */
  onDecided: (updated: StaffSlotChangeRequestItem | null, message: string) => void;
  /** The server refused because something changed (409): seats and clashes should be re-read. */
  onConflict: () => void;
  /** True while a decision is being confirmed or saved, so the chosen group must not change. */
  onLockChange?: (locked: boolean) => void;
}

/**
 * Req 48: approve a Pending request into the chosen replacement group, or
 * reject it, with an optional note the student will see. Each action is
 * confirmed on the page first (the app cannot use browser dialogs).
 *
 * An approval confirmation is bound to the group it was opened for, and that
 * is the group sent; it is closed if that group is unchosen or becomes
 * unavailable, and it can never fall back to a rejection. While a decision is
 * being confirmed or saved, the group cannot be changed. The server re-checks
 * everything, so a refusal is shown as it explains itself, and the comparison
 * is re-read.
 */
const SlotChangeDecisionPanel: React.FC<SlotChangeDecisionPanelProps> = ({
  request,
  replacement,
  onDecided,
  onConflict,
  onLockChange,
}) => {
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<DecisionConfirmation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const studentName = request.student?.fullName ?? 'the student';
  const component = request.slotType.toLowerCase();
  const tooLong = note.trim().length > SLOT_CHANGE_NOTE_LIMIT;
  const confirmationValid = confirming ? confirmationStillValid(confirming, replacement) : false;

  // Lock the group choice while a decision is being confirmed or saved.
  const locked = Boolean(confirming) || submitting;
  useEffect(() => {
    onLockChange?.(locked);
  }, [locked, onLockChange]);
  useEffect(() => () => onLockChange?.(false), [onLockChange]);

  // An approval whose group was unchosen or became unavailable is closed, not sent.
  useEffect(() => {
    if (confirming && !submitting && !confirmationStillValid(confirming, replacement)) {
      setConfirming(null);
      setNotice('The chosen group is no longer available, so the approval was not sent. Choose a group and approve again.');
    }
  }, [confirming, submitting, replacement]);

  const open = (action: DecisionConfirmation['action']) => {
    const next = openConfirmation(action, replacement);
    if (!next) return; // an approval with no available group has nothing to confirm
    setError(null);
    setNotice(null);
    setConfirming(next);
  };

  const submit = async () => {
    if (!confirming || !confirmationValid || tooLong) return;
    const call = decisionCall(confirming, note);
    setSubmitting(true);
    setError(null);
    try {
      const result =
        call.endpoint === 'approve'
          ? await approveSlotChangeRequest(request.id, call.body)
          : await rejectSlotChangeRequest(request.id, call.body);
      setConfirming(null);
      setNote('');
      onDecided(result.request, result.message);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'The decision could not be saved. Nothing was changed.');
      setConfirming(null);
      if (apiError.status === 409) onConflict();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-indigo-500/30 bg-slate-900/60 p-4" aria-labelledby="slot-decision-title">
      <h3 id="slot-decision-title" className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Gavel className="h-4 w-4" aria-hidden />
        Decide this request
      </h3>

      {error && (
        <div className="mb-3">
          <AlertBanner tone="error" title="The decision was not saved" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}
      {notice && !error && (
        <div className="mb-3">
          <AlertBanner tone="info" title="Approval cancelled" onDismiss={() => setNotice(null)}>
            {notice}
          </AlertBanner>
        </div>
      )}

      <label htmlFor={`decision-note-${request.id}`} className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
        Response note <span className="normal-case text-slate-500">(optional, shown to the student)</span>
      </label>
      <textarea
        id={`decision-note-${request.id}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        maxLength={SLOT_CHANGE_NOTE_LIMIT + 50}
        disabled={submitting}
        placeholder="e.g. Moved you to the Sunday group, which has seats and fits your timetable."
        aria-describedby={`decision-note-count-${request.id}`}
        className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 disabled:opacity-60"
      />
      <p
        id={`decision-note-count-${request.id}`}
        className={`mt-1 text-right text-[11px] tabular-nums ${tooLong ? 'text-rose-300' : 'text-slate-500'}`}
      >
        {note.trim().length}/{SLOT_CHANGE_NOTE_LIMIT}
      </p>

      {confirming ? (
        <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3" role="group" aria-label="Confirm decision">
          <p className="text-sm text-slate-200">
            {confirming.action === 'approve' ? (
              <>
                Approve and move {studentName} to <b>{component} group {confirming.replacement.groupNumber}</b> (
                {confirming.replacement.dayOfWeek} {confirming.replacement.startTime}–{confirming.replacement.endTime},{' '}
                {confirming.replacement.room})? Their schedule and both groups' seat counts are updated together.
              </>
            ) : (
              <>Reject this request? {studentName} keeps their current {component} group.</>
            )}
          </p>
          <p className="mt-1 text-xs text-slate-500">The group choice is locked until you confirm or cancel.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CustomButton
              size="sm"
              variant={confirming.action === 'approve' ? 'primary' : 'danger'}
              onClick={submit}
              isLoading={submitting}
              disabled={tooLong || !confirmationValid}
              icon={confirming.action === 'approve' ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
            >
              {confirming.action === 'approve' ? 'Confirm approval' : 'Confirm rejection'}
            </CustomButton>
            <CustomButton size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={submitting}>
              Cancel
            </CustomButton>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CustomButton
            size="sm"
            onClick={() => open('approve')}
            disabled={!replacement || !replacement.isEligible || tooLong}
            icon={<Check className="h-4 w-4" aria-hidden />}
          >
            Approve{replacement ? ` → group ${replacement.groupNumber}` : ''}
          </CustomButton>
          <CustomButton
            size="sm"
            variant="secondary"
            onClick={() => open('reject')}
            disabled={tooLong}
            icon={<X className="h-4 w-4" aria-hidden />}
          >
            Reject
          </CustomButton>
          {!replacement && <span className="text-xs text-slate-500">Choose an available group above to approve.</span>}
          {submitting && <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Saving" />}
        </div>
      )}
    </section>
  );
};

export default SlotChangeDecisionPanel;
