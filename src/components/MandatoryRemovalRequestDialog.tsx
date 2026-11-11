import React, { useEffect, useState } from 'react';
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
  'w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 transition-colors hover:border-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-60';

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={isSubmitting ? undefined : onCancel}
        aria-hidden
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="removal-request-title"
        onSubmit={handleSubmit}
        className="relative max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-800/60 bg-rose-950/60 text-rose-300">
            <ShieldAlert className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="removal-request-title" className="text-base font-bold text-white">
              Request mandatory-course removal
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              The Coordinator reviews the request. The course stays mandatory until it is approved.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm">
          <dt className="text-slate-500">Course</dt>
          <dd className="text-slate-200">
            <span className="font-mono font-semibold text-indigo-300">{candidate.course.code}</span> ·{' '}
            {candidate.course.name}
          </dd>
          <dt className="text-slate-500">Mandatory because</dt>
          <dd className="text-slate-200">
            {candidate.reason === 'Failed' ? `Failed in ${candidate.term}` : `Not attended in semester ${candidate.semester}`}
          </dd>
        </dl>

        <label className="mt-5 block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Case</span>
          <select
            value={category}
            disabled={isSubmitting}
            onChange={(event) => setCategory(event.target.value)}
            className={`${fieldClass} mt-1.5`}
          >
            <option value="">Choose the case that applies</option>
            {categories.map((option) => (
              <option key={option.value} value={option.value} className="bg-slate-900">
                {option.value}
              </option>
            ))}
          </select>
          {description && <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">{description}</span>}
        </label>

        {isPair && (
          <label className="mt-4 block">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Other course of the pair</span>
            <select
              value={pairedCourseId}
              disabled={isSubmitting}
              onChange={(event) => setPairedCourseId(event.target.value)}
              className={`${fieldClass} mt-1.5`}
            >
              <option value="">Choose a mandatory course</option>
              {otherCourses.map((entry) => (
                <option key={entry.course.id} value={entry.course.id} className="bg-slate-900">
                  {entry.course.code} · {entry.course.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mt-4 block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Reason</span>
          <textarea
            value={reason}
            maxLength={REMOVAL_NOTE_LIMIT}
            disabled={isSubmitting}
            rows={4}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this course should not be mandatory for this student."
            className={`${fieldClass} mt-1.5 resize-y`}
          />
          <span className="mt-1 block text-right text-[11px] text-slate-500">
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
