import React, { useEffect, useState } from 'react';
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
  'rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 transition-colors hover:border-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-60';

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={isSubmitting ? undefined : onCancel}
        aria-hidden
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="slot-change-title"
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-800/60 bg-indigo-950/60 text-indigo-300">
            <ArrowRightLeft className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="slot-change-title" className="text-base font-bold text-white">
              Request a slot change
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              Your advisor reviews the request. Your current slot stays assigned until then.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm">
          <dt className="text-slate-500">Course</dt>
          <dd className="text-slate-200">
            <span className="font-mono font-semibold text-indigo-300">{course.code}</span> · {course.name}
          </dd>
          <dt className="text-slate-500">Component</dt>
          <dd className="text-slate-200">
            {slot.slotType} · Group {slot.groupNumber}
          </dd>
          <dt className="text-slate-500">Current slot</dt>
          <dd className="space-y-1 text-slate-300">
            <span className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-slate-500" aria-hidden />
              {slot.dayOfWeek}
            </span>
            <span className="flex items-center gap-2 font-mono">
              <Clock className="h-3.5 w-3.5 text-slate-500" aria-hidden />
              {slot.startTime} – {slot.endTime}
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-slate-500" aria-hidden />
              {slot.room}
            </span>
          </dd>
        </dl>

        <label className="mt-5 block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Preference note (optional)</span>
          <textarea
            value={note}
            maxLength={SLOT_CHANGE_NOTE_LIMIT}
            disabled={isSubmitting}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Group 2 would suit me, or any slot on Sunday."
            className={`${fieldClass} mt-1.5 w-full resize-y`}
          />
          <span className="mt-1 block text-right text-[11px] text-slate-500">
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
