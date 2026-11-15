import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import AlertBanner from '../components/ui/AlertBanner';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/PageHeader';
import Select from '../components/ui/Select';
import { ApiError } from '../lib/api';
import { courseOfferingService } from '../lib/courseOfferingService';
import { fetchAcademicTerms } from '../lib/termsService';
import type { AcademicTerm, CourseOffering, CourseSlot } from '../lib/types';

const SLOT_TYPES: CourseSlot['slotType'][] = ['Lecture', 'Tutorial', 'Lab'];

const CourseAvailabilityPage: React.FC = () => {
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [termId, setTermId] = useState('');
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [offeringId, setOfferingId] = useState('');
  const [slots, setSlots] = useState<CourseSlot[]>([]);
  const [isLoadingTerms, setIsLoadingTerms] = useState(true);
  const [isLoadingOfferings, setIsLoadingOfferings] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAcademicTerms()
      .then(({ terms: loadedTerms }) => {
        if (cancelled) return;
        setTerms(loadedTerms);
        setTermId((current) => current || loadedTerms[0]?.id || '');
      })
      .catch((err) => {
        if (!cancelled) setError((err as ApiError).message);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTerms(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadOfferings = useCallback(async () => {
    if (!termId) {
      setOfferings([]);
      setOfferingId('');
      setSlots([]);
      return;
    }
    setIsLoadingOfferings(true);
    setError(null);
    setOfferingId('');
    setSlots([]);
    try {
      const response = await courseOfferingService.getOfferingsByTerm(termId);
      setOfferings(response.offerings.filter((offering) => offering.publicationStatus === 'Published'));
    } catch (err) {
      setError((err as ApiError).message);
      setOfferings([]);
    } finally {
      setIsLoadingOfferings(false);
    }
  }, [termId]);

  useEffect(() => {
    loadOfferings();
  }, [loadOfferings]);

  const loadSlots = async (id: string) => {
    setOfferingId(id);
    setSlots([]);
    if (!id) return;
    setIsLoadingSlots(true);
    setError(null);
    try {
      const response = await courseOfferingService.getOfferingDetails(id);
      setSlots(response.slots);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const selectedOffering = offerings.find((offering) => offering.id === offeringId);
  const selectedCourse =
    selectedOffering?.courseId && typeof selectedOffering.courseId === 'object'
      ? selectedOffering.courseId
      : null;

  return (
    <>
      <PageHeader
        title="Course Slot Availability"
        description="Select a published course offering to review lecture, tutorial and lab slots with live remaining capacity."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load course availability" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      <Card className="mb-5 grid gap-4 p-5 sm:grid-cols-2">
        <Select
          label="Academic Term"
          placeholder={isLoadingTerms ? 'Loading terms...' : 'Select a term...'}
          value={termId}
          onChange={(event) => setTermId(event.target.value)}
          options={terms.map((term) => ({ value: term.id, label: `${term.academicYear} ${term.season}` }))}
          disabled={isLoadingTerms}
        />
        <Select
          label="Course"
          placeholder={isLoadingOfferings ? 'Loading courses...' : 'Select a course...'}
          value={offeringId}
          onChange={(event) => loadSlots(event.target.value)}
          options={offerings.map((offering) => {
            const course =
              offering.courseId && typeof offering.courseId === 'object' ? offering.courseId : null;
            return {
              value: offering.id,
              label: course ? `${course.code} — ${course.name}` : 'Course details unavailable',
            };
          })}
          disabled={!termId || isLoadingOfferings || offerings.length === 0}
        />
      </Card>

      {isLoadingOfferings || isLoadingSlots ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-12 text-body text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading course slots...
        </Card>
      ) : offeringId && selectedCourse ? (
        <div className="space-y-5">
          <Card className="p-5">
            <p className="font-mono text-h3 font-bold text-on-surface">{selectedCourse.code}</p>
            <p className="mt-1 text-body text-on-surface-variant">{selectedCourse.name}</p>
          </Card>
          {SLOT_TYPES.map((slotType) => {
            const groupSlots = slots
              .filter((slot) => slot.slotType === slotType)
              .sort((a, b) => a.groupNumber - b.groupNumber);
            return (
              <section key={slotType}>
                <h2 className="mb-3 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                  {slotType}s ({groupSlots.length})
                </h2>
                {groupSlots.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {groupSlots.map((slot) => {
                      const remaining = Math.max(0, slot.maxCapacity - slot.assignedCount);
                      return (
                        <Card key={slot.id} className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-on-surface">Group {slot.groupNumber}</p>
                              <p className="mt-1 text-body text-on-surface-variant">
                                {slot.dayOfWeek}, {slot.startTime}–{slot.endTime}
                              </p>
                              <p className="text-body text-on-surface-variant">Room {slot.roomId}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-h3 font-bold ${remaining ? 'text-success' : 'text-error'}`}>
                                {remaining} remaining
                              </p>
                              <p className="text-caption text-on-surface-variant">
                                {slot.assignedCount} assigned · {slot.maxCapacity} capacity
                              </p>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-body text-on-surface-variant">
                    No {slotType.toLowerCase()} slots for this course.
                  </p>
                )}
              </section>
            );
          })}
          {slots.length === 0 && (
            <EmptyState
              icon={<BookOpen className="h-5 w-5" aria-hidden />}
              title="No slots defined"
              description="This published course offering does not have any lecture, tutorial or lab slots yet."
            />
          )}
        </div>
      ) : !isLoadingTerms && !isLoadingOfferings && termId && offerings.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" aria-hidden />}
          title="No published courses for this term"
          description="Published offerings with course slots will appear here."
        />
      ) : null}
    </>
  );
};

export default CourseAvailabilityPage;
