import React, { useEffect, useState } from 'react';
import { X, Loader2, BookOpen, Clock, MapPin, UserRound, Calendar } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import type { CourseDetailsResponse, CourseSlotDetail } from '../lib/types';
import CustomButton from './ui/CustomButton';
import Card from './ui/Card';
import Badge, { type BadgeTone } from './ui/Badge';
import AlertBanner from './ui/AlertBanner';

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
    <div className="fixed inset-0 z-50 flex items-end justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative h-full w-full max-w-2xl overflow-hidden bg-slate-950 shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-6 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-white">
                {data?.course.code || courseName || 'Course Details'}
              </h2>
              {data && (
                <p className="truncate text-sm text-slate-400">{data.course.name}</p>
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
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading course details...
              </div>
            ) : data ? (
              <div className="space-y-6">
                {/* Course Info Card */}
                <Card tone="raised" className="p-5" sheen>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-mono text-xl font-bold text-white">{data.course.code}</h3>
                        <Badge tone="neutral">{data.course.courseType}</Badge>
                      </div>
                      <p className="mt-1 text-slate-300">{data.course.name}</p>
                    </div>
                    <div className="rounded-lg bg-indigo-500/20 px-4 py-2 text-center">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Credit Hours</p>
                      <p className="text-2xl font-bold text-indigo-300">{data.course.creditHours}</p>
                    </div>
                  </div>
                </Card>

                {/* Lectures */}
                {data.slots.lectures.length > 0 && (
                  <section>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
                      <BookOpen className="h-4 w-4 text-indigo-400" />
                      Lectures ({data.slots.lectures.length})
                    </h3>
                    <div className="space-y-3">
                      {data.slots.lectures.map((slot) => (
                        <SlotCard key={slot.id} slot={slot} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Tutorials */}
                {data.slots.tutorials.length > 0 && (
                  <section>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
                      <BookOpen className="h-4 w-4 text-sky-400" />
                      Tutorials ({data.slots.tutorials.length})
                    </h3>
                    <div className="space-y-3">
                      {data.slots.tutorials.map((slot) => (
                        <SlotCard key={slot.id} slot={slot} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Labs */}
                {data.slots.labs.length > 0 && (
                  <section>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
                      <BookOpen className="h-4 w-4 text-emerald-400" />
                      Labs ({data.slots.labs.length})
                    </h3>
                    <div className="space-y-3">
                      {data.slots.labs.map((slot) => (
                        <SlotCard key={slot.id} slot={slot} />
                      ))}
                    </div>
                  </section>
                )}

                {data.totalSlots === 0 && (
                  <Card className="p-8 text-center">
                    <p className="text-sm text-slate-400">No slots assigned for this course</p>
                  </Card>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const SlotCard: React.FC<{ slot: CourseSlotDetail }> = ({ slot }) => {
  const style = TYPE_STYLE[slot.slotType];

  return (
    <Card tone="raised" className="p-4 transition-all hover:border-slate-600">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone={style.tone} icon={style.icon}>
              {slot.slotType} · Group {slot.groupNumber}
            </Badge>
          </div>

          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2 text-slate-300">
              <Calendar className="h-4 w-4 text-slate-500" />
              <span className="font-medium">{slot.dayOfWeek}</span>
            </div>

            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="h-4 w-4 text-slate-500" />
              <span className="font-mono">
                {slot.startTime} – {slot.endTime}
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-300">
              <MapPin className="h-4 w-4 text-slate-500" />
              <span>{slot.room}</span>
            </div>

            {slot.instructor && (
              <div className="flex items-center gap-2 text-slate-400">
                <UserRound className="h-4 w-4 text-slate-500" />
                <span className="truncate">{slot.instructor.fullName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default CourseDetailDrawer;
