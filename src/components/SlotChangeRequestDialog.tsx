import React, { useEffect, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { ArrowRightLeft, Calendar, Clock, MapPin } from 'lucide-react';
import type { ApiError } from '../lib/api';
import type { CourseSlotDetail, SlotChangeRequestSummary } from '../lib/types';
import { SLOT_CHANGE_NOTE_LIMIT, submitSlotChangeRequest } from '../lib/slotChangeRequestsService';
import CustomButton from './ui/CustomButton';
import AlertBanner from './ui/AlertBanner';

interface SlotChangeRequestDialogProps {
  course: { id: string; code: string; name: string };
  /** The slot the student holds now; shown read-only, never edited here. */
  slot: CourseSlotDetail;
  onCancel: () => void;
  onSubmitted: (request: SlotChangeRequestSummary, message: string) => void;
}

const fieldClass =
  'rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body text-on-surface transition-colors hover:border-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Req 40: ask for a change to one assigned lecture, tutorial or lab slot.
 *
 * The course, component and current slot come from the schedule and cannot be
 * edited; the only input is an optional note. Submitting sends a request — the
 * slot itself stays assigned until an Advisor or Coordinator resolves it.
 */
const SlotChangeRequestDialog: React.FC<SlotChangeRequestDialogProps> = ({ course, slot, onCancel, onSubmitted }) => {
  const [note, setNote] = useState('');
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const trimmed = note.trim();
      const response = await submitSlotChangeRequest({
        courseId: course.id,
        slotType: slot.slotType,
        slotId: slot.id,
        ...(trimmed ? { preferenceNote: trimmed } : {}),
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
        aria-labelledby="slot-change-title"
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary bg-primary-container text-on-primary-container">
            <ArrowRightLeft className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="slot-change-title" className="text-body-lg font-bold text-on-surface">
              Request a slot change
            </h2>
            <p className="mt-1 text-body leading-relaxed text-on-surface-variant">
              Your advisor reviews the request. Your current slot stays assigned until then.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-body">
          <dt className="text-on-surface-variant">Course</dt>
          <dd className="text-on-surface">
            <span className="font-mono font-semibold text-primary">{course.code}</span> · {course.name}
          </dd>
          <dt className="text-on-surface-variant">Component</dt>
          <dd className="text-on-surface">
            {slot.slotType} · Group {slot.groupNumber}
          </dd>
          <dt className="text-on-surface-variant">Current slot</dt>
          <dd className="space-y-1 text-on-surface">
            <span className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-on-surface-variant" aria-hidden />
              {slot.dayOfWeek}
            </span>
            <span className="flex items-center gap-2 font-mono">
              <Clock className="h-3.5 w-3.5 text-on-surface-variant" aria-hidden />
              {slot.startTime} – {slot.endTime}
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-on-surface-variant" aria-hidden />
              {slot.room}
            </span>
          </dd>
        </dl>

        <label className="mt-5 block">
          <span className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">Preference note (optional)</span>
          <textarea
            value={note}
            maxLength={SLOT_CHANGE_NOTE_LIMIT}
            disabled={isSubmitting}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Group 2 would suit me, or any slot on Sunday."
            className={`${fieldClass} mt-1.5 w-full resize-y`}
          />
          <span className="mt-1 block text-right text-caption text-on-surface-variant">
            {note.length}/{SLOT_CHANGE_NOTE_LIMIT}
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
          <CustomButton type="submit" isLoading={isSubmitting}>
            Send request
          </CustomButton>
        </div>
      </form>
    </div>
  );
};

export default SlotChangeRequestDialog;
