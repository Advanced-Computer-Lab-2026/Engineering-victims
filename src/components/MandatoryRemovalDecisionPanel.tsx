import React, { useState } from 'react';
import { Check, Gavel, Loader2, X } from 'lucide-react';
import { ApiError } from '../lib/api';
import { decideRemovalRequest, REMOVAL_NOTE_LIMIT } from '../lib/mandatoryRemovalService';
import type { MandatoryRemovalRequestSummary } from '../lib/types';
import AlertBanner from './ui/AlertBanner';
import CustomButton from './ui/CustomButton';

interface MandatoryRemovalDecisionPanelProps {
  request: MandatoryRemovalRequestSummary;
  /** The decision was saved; `updated` is the request as it is now (null if re-reading it failed). */
  onDecided: (updated: MandatoryRemovalRequestSummary | null, message: string) => void;
}

/**
 * Req 69: approve or reject a Pending removal request and provide a response
 * note. The note is required (the sheet says "provide", where req 48's note is
 * "optional"). Each action is confirmed on the page first, with what it will do
 * spelled out, because an approval takes the course off the student's mandatory
 * list and out of any unprocessed draft schedule.
 *
 * The server re-checks everything, so a refusal (a request decided meanwhile, a
 * database that cannot run the approval) is shown as it explains itself.
 */
const MandatoryRemovalDecisionPanel: React.FC<MandatoryRemovalDecisionPanelProps> = ({ request, onDecided }) => {
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<'approve' | 'reject' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studentName = request.student?.fullName ?? 'the student';
  const courseCode = request.course?.code ?? 'the course';
  const trimmedLength = note.trim().length;
  const tooLong = trimmedLength > REMOVAL_NOTE_LIMIT;
  const noteReady = trimmedLength > 0 && !tooLong;

  const submit = async () => {
    if (!confirming || !noteReady) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await decideRemovalRequest(request.id, confirming, note.trim());
      onDecided(response.request, response.message);
    } catch (err) {
      setError((err as ApiError).message || 'The decision could not be saved. Nothing was changed.');
      setConfirming(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-primary bg-surface-container-low p-4" aria-labelledby="removal-decision-title">
      <h3
        id="removal-decision-title"
        className="mb-1 flex items-center gap-2 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant"
      >
        <Gavel className="h-4 w-4" aria-hidden />
        Decide this request
      </h3>
      <p className="mb-3 text-caption text-on-surface-variant">
        Approving removes the course from the student&apos;s mandatory list and from any unprocessed draft schedule.
        Rejecting leaves it mandatory.
      </p>

      {error && (
        <div className="mb-3">
          <AlertBanner tone="error" title="The decision was not saved" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      <label
        htmlFor={`removal-note-${request.id}`}
        className="mb-1.5 block text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant"
      >
        Response note <span className="normal-case text-on-surface-variant">(required)</span>
      </label>
      <textarea
        id={`removal-note-${request.id}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        maxLength={REMOVAL_NOTE_LIMIT + 50}
        disabled={submitting}
        placeholder="e.g. The student still has the first makeup, so the course is not mandatory yet."
        aria-describedby={`removal-note-count-${request.id}`}
        className="w-full resize-y rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
      />
      <p
        id={`removal-note-count-${request.id}`}
        className={`mt-1 text-right text-caption tabular-nums ${tooLong ? 'text-error' : 'text-on-surface-variant'}`}
      >
        {trimmedLength}/{REMOVAL_NOTE_LIMIT}
      </p>

      {confirming ? (
        <div className="mt-3 rounded-xl border border-outline-variant bg-surface-container p-3" role="group" aria-label="Confirm decision">
          <p className="text-body text-on-surface">
            {confirming === 'approve' ? (
              <>
                Approve the removal of <b>{courseCode}</b> for {studentName}? It is taken off their mandatory list and out
                of any unprocessed draft schedule, with its draft slots released.
              </>
            ) : (
              <>
                Reject the removal of <b>{courseCode}</b> for {studentName}? The course stays mandatory.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CustomButton
              size="sm"
              variant={confirming === 'approve' ? 'primary' : 'danger'}
              onClick={submit}
              isLoading={submitting}
              disabled={!noteReady}
              icon={confirming === 'approve' ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
            >
              {confirming === 'approve' ? 'Confirm approval' : 'Confirm rejection'}
            </CustomButton>
            <CustomButton size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={submitting}>
              Cancel
            </CustomButton>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CustomButton size="sm" onClick={() => setConfirming('approve')} disabled={!noteReady} icon={<Check className="h-4 w-4" aria-hidden />}>
            Approve removal
          </CustomButton>
          <CustomButton
            size="sm"
            variant="secondary"
            onClick={() => setConfirming('reject')}
            disabled={!noteReady}
            icon={<X className="h-4 w-4" aria-hidden />}
          >
            Reject request
          </CustomButton>
          {!noteReady && !tooLong && (
            <span className="text-caption text-on-surface-variant">Add a response note to decide.</span>
          )}
          {submitting && <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" aria-label="Saving" />}
        </div>
      )}
    </section>
  );
};

export default MandatoryRemovalDecisionPanel;
