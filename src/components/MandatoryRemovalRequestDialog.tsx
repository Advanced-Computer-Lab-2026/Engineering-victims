import React, { useEffect, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { ShieldAlert } from 'lucide-react';
import type { ApiError } from '../lib/api';
import {
  REMOVAL_NOTE_LIMIT,
  RESTRICTED_PAIR_CATEGORY,
  submitRemovalRequest,
} from '../lib/mandatoryRemovalService';
import type { MandatoryCandidate, MandatoryRemovalRequestSummary } from '../lib/types';
import AlertBanner from './ui/AlertBanner';
import CustomButton from './ui/CustomButton';

interface MandatoryRemovalRequestDialogProps {
  studentId: string;
  /** The mandatory course the request is about; shown read-only. */
  candidate: MandatoryCandidate;
  /** The student's whole mandatory list, for choosing the other half of a pair. */
  candidates: MandatoryCandidate[];
  categories: Array<{ value: string; description: string }>;
  onCancel: () => void;
  onSubmitted: (request: MandatoryRemovalRequestSummary, message: string) => void;
}

const fieldClass =
  'w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body text-on-surface transition-colors hover:border-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Req 64: the assigned Advisor asks for a mandatory course to be removed and
 * says why.
 *
 * The course comes from the mandatory list and cannot be edited. The Advisor
 * picks one of the valid cases and writes the reason; the server checks the
 * case against the student's record, and the course stays mandatory until a
 * Coordinator approves.
 */
const MandatoryRemovalRequestDialog: React.FC<MandatoryRemovalRequestDialogProps> = ({
  studentId,
  candidate,
  candidates,
  categories,
  onCancel,
  onSubmitted,
}) => {
  const [category, setCategory] = useState('');
  const [pairedCourseId, setPairedCourseId] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLFormElement>(true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isSubmitting, onCancel]);

  const isPair = category === RESTRICTED_PAIR_CATEGORY;
  const otherCourses = candidates.filter((entry) => entry.course.id !== candidate.course.id);
  const description = categories.find((option) => option.value === category)?.description;
  const canSubmit = Boolean(category) && Boolean(reason.trim()) && (!isPair || Boolean(pairedCourseId));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await submitRemovalRequest({
        studentId,
        courseId: candidate.course.id,
        category,
        ...(isPair ? { pairedCourseId } : {}),
        reason: reason.trim(),
      });
      onSubmitted(response.request, response.message);
    } catch (err) {
      setError((err as ApiError).message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-toast flex items-center justify-center p-4">
      <div
        className="absolute inset-0 scrim backdrop-blur-sm"
        onClick={isSubmitting ? undefined : onCancel}
        aria-hidden
      />
      <form
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="removal-request-title"
        onSubmit={handleSubmit}
        className="relative max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-error bg-error-container text-error">
            <ShieldAlert className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="removal-request-title" className="text-body-lg font-bold text-on-surface">
              Request mandatory-course removal
            </h2>
            <p className="mt-1 text-body leading-relaxed text-on-surface-variant">
              The Coordinator reviews the request. The course stays mandatory until it is approved.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-body">
          <dt className="text-on-surface-variant">Course</dt>
          <dd className="text-on-surface">
            <span className="font-mono font-semibold text-primary">{candidate.course.code}</span> ·{' '}
            {candidate.course.name}
          </dd>
          <dt className="text-on-surface-variant">Mandatory because</dt>
          <dd className="text-on-surface">
            {candidate.reason === 'Failed' ? `Failed in ${candidate.term}` : `Not attended in semester ${candidate.semester}`}
          </dd>
        </dl>

        <label className="mt-5 block">
          <span className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">Case</span>
          <select
            value={category}
            disabled={isSubmitting}
            onChange={(event) => setCategory(event.target.value)}
            className={`${fieldClass} mt-1.5`}
          >
            <option value="">Choose the case that applies</option>
            {categories.map((option) => (
              <option key={option.value} value={option.value} className="bg-surface-container-low">
                {option.value}
              </option>
            ))}
          </select>
          {description && <span className="mt-1.5 block text-caption leading-relaxed text-on-surface-variant">{description}</span>}
        </label>

        {isPair && (
          <label className="mt-4 block">
            <span className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">Other course of the pair</span>
            <select
              value={pairedCourseId}
              disabled={isSubmitting}
              onChange={(event) => setPairedCourseId(event.target.value)}
              className={`${fieldClass} mt-1.5`}
            >
              <option value="">Choose a mandatory course</option>
              {otherCourses.map((entry) => (
                <option key={entry.course.id} value={entry.course.id} className="bg-surface-container-low">
                  {entry.course.code} · {entry.course.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mt-4 block">
          <span className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">Reason</span>
          <textarea
            value={reason}
            maxLength={REMOVAL_NOTE_LIMIT}
            disabled={isSubmitting}
            rows={4}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this course should not be mandatory for this student."
            className={`${fieldClass} mt-1.5 resize-y`}
          />
          <span className="mt-1 block text-right text-caption text-on-surface-variant">
            {reason.length}/{REMOVAL_NOTE_LIMIT}
          </span>
        </label>

        {error && (
          <div className="mt-3">
            <AlertBanner tone="error" title="Request not sent">
              {error}
            </AlertBanner>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <CustomButton type="button" variant="secondary" disabled={isSubmitting} onClick={onCancel} autoFocus>
            Cancel
          </CustomButton>
          <CustomButton type="submit" isLoading={isSubmitting} disabled={!canSubmit}>
            Send request
          </CustomButton>
        </div>
      </form>
    </div>
  );
};

export default MandatoryRemovalRequestDialog;
