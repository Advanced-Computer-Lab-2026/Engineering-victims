import React, { useEffect, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { X, Loader2, BookOpen, Clock, MapPin, UserRound, Calendar, ArrowRightLeft, Hourglass } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import type { CourseDetailsResponse, CourseSlotDetail, SlotChangeEligibility } from '../lib/types';
import { fetchSlotChangeEligibility } from '../lib/slotChangeRequestsService';
import { formatDate } from '../lib/studentsService';
import { useSession } from '../hooks/useSession';
import CustomButton from './ui/CustomButton';
import Card from './ui/Card';
import Badge, { type BadgeTone } from './ui/Badge';
import AlertBanner from './ui/AlertBanner';
import SlotChangeRequestDialog from './SlotChangeRequestDialog';

interface CourseDetailDrawerProps {
  courseId: string | null;
  courseName?: string;
  onClose: () => void;
}

const TYPE_STYLE: Record<CourseSlotDetail['slotType'], { tone: BadgeTone; icon: React.ReactNode }> = {
  Lecture: { tone: 'indigo', icon: <BookOpen className="h-4 w-4" /> },
  Tutorial: { tone: 'sky', icon: <BookOpen className="h-4 w-4" /> },
  Lab: { tone: 'emerald', icon: <BookOpen className="h-4 w-4" /> },
};

/**
 * Req 33: Select a registered course and view its assigned lecture, tutorial
 * and lab details. Shows specific slot information for each component.
 */
const CourseDetailDrawer: React.FC<CourseDetailDrawerProps> = ({ courseId, courseName, onClose }) => {
  const [data, setData] = useState<CourseDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(!!courseId);

  // Escape mirrors the scrim and the close button.
  useEffect(() => {
    if (!courseId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [courseId, onClose]);

  // Req 40: Advising Students may ask for a change to one of these slots while
  // their completed schedule is under review. The API decides; this only
  // decides whether to offer the action.
  const { user } = useSession();
  const isAdvisingStudent = user?.role === 'Student' && user.studentType === 'Advising Student';
  const [eligibility, setEligibility] = useState<SlotChangeEligibility | null>(null);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [requestingSlot, setRequestingSlot] = useState<CourseSlotDetail | null>(null);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId || !isAdvisingStudent) return;
    let cancelled = false;
    setEligibilityError(null);
    fetchSlotChangeEligibility()
      .then((result) => {
        if (!cancelled) setEligibility(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setEligibility(null);
          setEligibilityError((err as ApiError).message || 'Could not check slot-change request eligibility.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, isAdvisingStudent]);

  const slotAction = (slot: CourseSlotDetail): SlotCardAction | undefined => {
    if (!eligibility?.canRequest) return undefined;
    if (eligibility.pendingSlotIds.includes(slot.id)) return { kind: 'pending' };
    return { kind: 'request', onRequest: () => setRequestingSlot(slot) };
  };

  useEffect(() => {
    if (!courseId) return;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiFetch<CourseDetailsResponse>(`/api/students/my-courses/${courseId}`);
        setData(response);
      } catch (err) {
        setError(err as ApiError);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [courseId]);

  if (!courseId) return null;

  return (
    <div className="fixed inset-0 z-toast flex items-end justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 scrim backdrop-blur-sm" onClick={onClose} aria-hidden />

      {/* Drawer */}
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Course details"
        className="relative h-full w-full max-w-2xl overflow-hidden bg-surface-container-lowest shadow-elevation-3"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-6 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-h3 font-bold text-on-surface">
                {data?.course.code || courseName || 'Course Details'}
              </h2>
              {data && (
                <p className="truncate text-body text-on-surface-variant">{data.course.name}</p>
              )}
            </div>
            <CustomButton variant="ghost" size="sm" onClick={onClose} icon={<X className="h-5 w-5" />}>
              Close
            </CustomButton>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4">
                <AlertBanner tone="error" title="Could not load course details">
                  {error.message}
                </AlertBanner>
              </div>
            )}

            {isLoading ? (
              <div role="status" className="flex items-center justify-center gap-2 py-16 text-body text-on-surface-variant">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading course details...
              </div>
            ) : data ? (
              <div className="space-y-6">
                {submittedMessage && (
                  <AlertBanner tone="success" title="Request sent" onDismiss={() => setSubmittedMessage(null)}>
                    {submittedMessage}
                  </AlertBanner>
                )}

                {isAdvisingStudent && eligibility && (
                  <AlertBanner tone={eligibility.canRequest ? 'info' : 'neutral'} title="Slot-change requests">
                    {eligibility.canRequest && eligibility.term
                      ? `You can ask for a change to any of these slots until the end of ${formatDate(eligibility.term.advisingDeadline)}. Your advisor decides; the slot stays assigned until then.`
                      : eligibility.reason}
                  </AlertBanner>
                )}
                {isAdvisingStudent && eligibilityError && (
                  <AlertBanner tone="error" title="Could not check slot-change requests">
                    {eligibilityError}
                  </AlertBanner>
                )}

                {/* Course Info Card */}
                <Card tone="raised" className="p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-mono text-h2 font-bold text-on-surface">{data.course.code}</h3>
                        <Badge tone="neutral">{data.course.courseType}</Badge>
                      </div>
                      <p className="mt-1 text-on-surface">{data.course.name}</p>
                    </div>
                    <div className="rounded-lg bg-primary-container px-4 py-2 text-center">
                      <p className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">Credit Hours</p>
                      <p className="text-h2 font-bold text-primary">{data.course.creditHours}</p>
                    </div>
                  </div>
                </Card>

                {/* Lectures */}
                {data.slots.lectures.length > 0 && (
                  <section>
                    <h3 className="mb-3 flex items-center gap-2 text-body font-semibold uppercase tracking-eyebrow text-on-surface">
                      <BookOpen className="h-4 w-4 text-primary" />
                      Lectures ({data.slots.lectures.length})
                    </h3>
                    <div className="space-y-3">
                      {data.slots.lectures.map((slot) => (
                        <SlotCard key={slot.id} slot={slot} action={slotAction(slot)} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Tutorials */}
                {data.slots.tutorials.length > 0 && (
                  <section>
                    <h3 className="mb-3 flex items-center gap-2 text-body font-semibold uppercase tracking-eyebrow text-on-surface">
                      <BookOpen className="h-4 w-4 text-info" />
                      Tutorials ({data.slots.tutorials.length})
                    </h3>
                    <div className="space-y-3">
                      {data.slots.tutorials.map((slot) => (
                        <SlotCard key={slot.id} slot={slot} action={slotAction(slot)} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Labs */}
                {data.slots.labs.length > 0 && (
                  <section>
                    <h3 className="mb-3 flex items-center gap-2 text-body font-semibold uppercase tracking-eyebrow text-on-surface">
                      <BookOpen className="h-4 w-4 text-success" />
                      Labs ({data.slots.labs.length})
                    </h3>
                    <div className="space-y-3">
                      {data.slots.labs.map((slot) => (
                        <SlotCard key={slot.id} slot={slot} action={slotAction(slot)} />
                      ))}
                    </div>
                  </section>
                )}

                {data.totalSlots === 0 && (
                  <Card className="p-8 text-center">
                    <p className="text-body text-on-surface-variant">No slots assigned for this course</p>
                  </Card>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {requestingSlot && data && (
        <SlotChangeRequestDialog
          course={data.course}
          slot={requestingSlot}
          onCancel={() => setRequestingSlot(null)}
          onSubmitted={(request, message) => {
            setRequestingSlot(null);
            setSubmittedMessage(message);
            // Mark the slot as pending so it is not offered again.
            setEligibility((current) =>
              current ? { ...current, pendingSlotIds: [...current.pendingSlotIds, request.currentSlot.id] } : current
            );
          }}
        />
      )}
    </div>
  );
};

/** Req 40: what a slot card offers an Advising Student, if anything. */
type SlotCardAction = { kind: 'request'; onRequest: () => void } | { kind: 'pending' };

const SlotCard: React.FC<{ slot: CourseSlotDetail; action?: SlotCardAction }> = ({ slot, action }) => {
  const style = TYPE_STYLE[slot.slotType];

  return (
    <Card tone="raised" className="p-4 transition-all hover:border-outline">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone={style.tone} icon={style.icon}>
              {slot.slotType} · Group {slot.groupNumber}
            </Badge>
          </div>

          <div className="grid gap-2 text-body">
            <div className="flex items-center gap-2 text-on-surface">
              <Calendar className="h-4 w-4 text-on-surface-variant" />
              <span className="font-medium">{slot.dayOfWeek}</span>
            </div>

            <div className="flex items-center gap-2 text-on-surface">
              <Clock className="h-4 w-4 text-on-surface-variant" />
              <span className="font-mono">
                {slot.startTime} – {slot.endTime}
              </span>
            </div>

            <div className="flex items-center gap-2 text-on-surface">
              <MapPin className="h-4 w-4 text-on-surface-variant" />
              <span>{slot.room}</span>
            </div>

            {slot.instructor && (
              <div className="flex items-center gap-2 text-on-surface-variant">
                <UserRound className="h-4 w-4 text-on-surface-variant" />
                <span className="truncate">{slot.instructor.fullName}</span>
              </div>
            )}
          </div>
        </div>

        {action?.kind === 'request' && (
          <CustomButton
            variant="secondary"
            size="sm"
            onClick={action.onRequest}
            icon={<ArrowRightLeft className="h-4 w-4" aria-hidden />}
          >
            Request change
          </CustomButton>
        )}
        {action?.kind === 'pending' && (
          <Badge tone="amber" icon={<Hourglass className="h-3.5 w-3.5" aria-hidden />}>
            Change requested
          </Badge>
        )}
      </div>
    </Card>
  );
};

export default CourseDetailDrawer;
