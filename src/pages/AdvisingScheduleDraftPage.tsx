import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PageHeader from '../components/PageHeader';
import Select from '../components/ui/Select';
import StudentPreferencesPanel from '../components/StudentPreferencesPanel';
import { ApiError } from '../lib/api';
import {
  addAdvisingScheduleCourse,
  assignAdvisingScheduleSlot,
  changeAdvisingScheduleSlot,
  createAdvisingScheduleDraft,
  fetchAdvisingScheduleDraft,
  fetchAdvisingScheduleValidation,
  markAdvisingScheduleReadyForReview,
  removeAdvisingScheduleCourse,
  removeAdvisingScheduleSlot,
} from '../lib/advisingScheduleDraftService';
import type {
  AdvisingScheduleSlotAssignments,
  AdvisingScheduleCourseOption,
  AdvisingScheduleDraftCourse,
  AdvisingScheduleDraftResponse,
  AdvisingScheduleValidation,
} from '../lib/types';
import { formatDate, formatRelative } from '../lib/studentsService';

const CreditHourTile: React.FC<{ label: string; value: number; detail?: string; warning?: boolean }> = ({
  label,
  value,
  detail,
  warning = false,
}) => (
  <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
    <p className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">{label}</p>
    <p className={`mt-1 text-h3 font-bold ${warning ? 'text-warning' : 'text-on-surface'}`}>{value} hours</p>
    {detail && <p className="mt-1 text-caption text-on-surface-variant">{detail}</p>}
  </div>
);

const AdvisingScheduleDraftPage: React.FC = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const [data, setData] = useState<AdvisingScheduleDraftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedTermId, setSelectedTermId] = useState('');
  const [slotAssignments, setSlotAssignments] = useState<AdvisingScheduleSlotAssignments[]>([]);
  const [validation, setValidation] = useState<AdvisingScheduleValidation | null>(null);
  const [selectedSlotIds, setSelectedSlotIds] = useState<Record<string, string>>({});
  const [slotAction, setSlotAction] = useState<string | null>(null);
  const [isMarkingReady, setIsMarkingReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [slotRemoval, setSlotRemoval] = useState<{
    assignmentId: string;
    courseCode: string;
    slotType: string;
    groupNumber: number;
  } | null>(null);
  // Edits are staged here and only written when "Save as draft" is pressed.
  const [stagedAdds, setStagedAdds] = useState<string[]>([]);
  const [stagedRemoves, setStagedRemoves] = useState<string[]>([]);

  const load = useCallback(async (termId?: string) => {
    if (!studentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchAdvisingScheduleDraft(studentId, termId);
      setData(response);
      setSelectedTermId(response.term.id);
      setStagedAdds([]);
      setStagedRemoves([]);
      setSelectedSlotIds({});
      if (response.term.id) {
        const check = await fetchAdvisingScheduleValidation(studentId, response.term.id);
        setValidation(check.validation);
        setSlotAssignments(check.slotAssignments);
      } else {
        setValidation(null);
        setSlotAssignments([]);
      }
    } catch (err) {
      setData(null);
      setError((err as ApiError).message);
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveDraft = async () => {
    if (!studentId || !data) return;
    setIsSaving(true);
    setError(null);
    try {
      if (!data.draft) {
        await createAdvisingScheduleDraft(studentId, selectedTermId);
      }
      for (const courseId of stagedAdds) {
        await addAdvisingScheduleCourse(studentId, courseId, selectedTermId);
      }
      for (const courseId of stagedRemoves) {
        await removeAdvisingScheduleCourse(studentId, courseId, selectedTermId);
      }
      await load(selectedTermId);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsSaving(false);
    }
  };

  const runSlotAction = async (key: string, action: () => Promise<unknown>): Promise<boolean> => {
    if (!studentId || !selectedTermId) return false;
    setSlotAction(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      await load(selectedTermId);
      return true;
    } catch (err) {
      setError((err as ApiError).message);
      return false;
    } finally {
      setSlotAction(null);
    }
  };

  const confirmSlotRemoval = async () => {
    if (!studentId || !slotRemoval) return;
    const confirmedRemoval = slotRemoval;
    const succeeded = await runSlotAction(
      `${confirmedRemoval.assignmentId}-remove`,
      () => removeAdvisingScheduleSlot(studentId, confirmedRemoval.assignmentId, selectedTermId)
    );
    if (succeeded) setSlotRemoval(null);
  };

  const markReadyForReview = async () => {
    if (!studentId || !selectedTermId) return;
    setIsMarkingReady(true);
    setError(null);
    setNotice(null);
    try {
      const response = await markAdvisingScheduleReadyForReview(studentId, selectedTermId);
      setNotice(response.message);
      await load(selectedTermId);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsMarkingReady(false);
    }
  };

  const stageAdd = () => {
    if (!selectedCourseId) return;
    setStagedAdds((current) =>
      current.includes(selectedCourseId) ? current : [...current, selectedCourseId]
    );
    setSelectedCourseId('');
  };

  /** Dropping a course that was only staged takes it straight back off the list. */
  const stageRemove = (courseId: string) => {
    if (stagedAdds.includes(courseId)) {
      setStagedAdds((current) => current.filter((id) => id !== courseId));
      return;
    }
    setStagedRemoves((current) => (current.includes(courseId) ? current : [...current, courseId]));
  };

  const undoRemove = (courseId: string) => {
    setStagedRemoves((current) => current.filter((id) => id !== courseId));
  };

  const courseOptions = data?.eligibleCourses ?? [];
  const draftCourses = data?.draft?.courses ?? [];
  const hours = data?.creditHours;

  const stagedAddSet = new Set(stagedAdds);
  const stagedRemoveSet = new Set(stagedRemoves);
  const hasUnsavedChanges = stagedAdds.length > 0 || stagedRemoves.length > 0;

  // Staged additions come back as plain options, so they need the flag the
  // saved draft courses carry.
  const stagedAddCourses: AdvisingScheduleDraftCourse[] = stagedAdds
    .map((id) => courseOptions.find((course) => course.id === id))
    .filter((course): course is AdvisingScheduleCourseOption => Boolean(course))
    .map((course) => ({ ...course, mandatory: false }));

  const displayedCourses: AdvisingScheduleDraftCourse[] = [...draftCourses, ...stagedAddCourses];
  const availableOptions = courseOptions.filter((course) => !stagedAddSet.has(course.id));

  // The tiles read the saved total, so they move with the staged edits instead
  // of showing a figure the button has not written yet.
  const stagedHours =
    stagedAdds.reduce(
      (total, id) => total + (courseOptions.find((course) => course.id === id)?.creditHours ?? 0),
      0
    ) -
    stagedRemoves.reduce(
      (total, id) => total + (draftCourses.find((course) => course.id === id)?.creditHours ?? 0),
      0
    );
  const selectedHours = hours ? hours.selected + stagedHours : 0;
  const displayHours = hours
    ? {
        ...hours,
        selected: selectedHours,
        extra: Math.max(0, selectedHours - hours.allowed),
        remaining: Math.max(0, hours.allowed - selectedHours),
      }
    : undefined;

  return (
    <>
      <PageHeader
        title={data?.student ? `Draft schedule for ${data.student.fullName}` : 'Advising draft schedule'}
        description="Create and continue editing an incomplete advising schedule. Review your changes, then save them as a draft."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not update the draft schedule" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {notice && (
        <div className="mb-4">
          <AlertBanner tone="success" onDismiss={() => setNotice(null)}>{notice}</AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-12 text-body text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading draft schedule...
        </Card>
      ) : data ? (
        <div className="space-y-4">
          <StudentPreferencesPanel studentId={data.student.id} />

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-body text-on-surface-variant">
                  {data.student.studentId} · {data.student.major} · Semester {data.student.currentSemester}
                </p>
                {data.draft && (
                  <p className="mt-1 text-caption text-on-surface-variant" title={formatDate(data.draft.updatedAt)}>
                    Draft saved {formatRelative(data.draft.updatedAt)} ({formatDate(data.draft.updatedAt)})
                  </p>
                )}
                {hasUnsavedChanges && (
                  <p className="mt-1 text-caption font-medium text-warning">Unsaved changes</p>
                )}
              </div>
              <Select
                label="Term"
                className="min-w-[12rem]"
                value={selectedTermId}
                onChange={(event) => {
                  const termId = event.target.value;
                  setSelectedTermId(termId);
                  setSelectedCourseId('');
                  load(termId);
                }}
                options={data.terms.map((term) => ({ value: term.id, label: term.label }))}
              />
              {data.canEdit ? (
                <CustomButton
                  onClick={saveDraft}
                  isLoading={isSaving}
                  disabled={!hasUnsavedChanges && Boolean(data.draft)}
                  icon={<Save className="h-4 w-4" aria-hidden />}
                >
                  Save as draft
                </CustomButton>
              ) : !data.draft ? (
                <AlertBanner tone="info" title="No editable draft">
                  The student's workflow is {data.student.workflowStatus}; a new draft cannot be started in this state.
                </AlertBanner>
              ) : null}
            </div>

            {displayHours && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CreditHourTile label="Selected" value={displayHours.selected} />
                <CreditHourTile
                  label="Allowed"
                  value={displayHours.allowed}
                  detail={
                    displayHours.isProbation
                      ? `Reduced from ${displayHours.standardAllowance} for probation`
                      : 'Standard allowance'
                  }
                />
                <CreditHourTile
                  label="Extra (over allowance)"
                  value={displayHours.extra}
                  warning={displayHours.extra > 0}
                />
                <CreditHourTile label="Remaining" value={displayHours.remaining} />
              </div>
            )}

            {data.draft && (
              <>
                {!data.canEdit && (
                  <div className="mt-4">
                    <AlertBanner tone="info" title="This schedule is read-only">
                      The student's workflow is {data.student.workflowStatus}; only an open draft can be edited here.
                    </AlertBanner>
                  </div>
                )}

                <div className="mt-5">
                  <h3 className="mb-3 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                    Courses in this draft
                  </h3>
                  {displayedCourses.length ? (
                    <ul className="divide-y divide-outline-variant">
                      {displayedCourses.map((course) => {
                        const isStagedAdd = stagedAddSet.has(course.id);
                        const isPendingRemoval = stagedRemoveSet.has(course.id);
                        const courseSlots = slotAssignments.find((item) => item.courseId === course.id);
                        return (
                          <li
                            key={course.id}
                            className={`flex flex-wrap items-center justify-between gap-3 py-3 ${
                              isPendingRemoval ? 'opacity-60' : ''
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="font-mono font-medium text-on-surface">{course.code}</span>
                              <span className="ml-2 text-body text-on-surface-variant">{course.name}</span>
                              <span className="ml-2 text-caption text-on-surface-variant">
                                {course.creditHours} credits
                              </span>
                              {course.mandatory && (
                                <span className="ml-2 align-middle">
                                  <Badge tone="indigo">Mandatory</Badge>
                                </span>
                              )}
                              {isStagedAdd && (
                                <span className="ml-2 align-middle">
                                  <Badge tone="amber">Not saved yet</Badge>
                                </span>
                              )}
                              {isPendingRemoval && (
                                <span className="ml-2 align-middle">
                                  <Badge tone="rose">Will be removed</Badge>
                                </span>
                              )}
                            </div>
                            {data.canEdit && (isStagedAdd || !course.mandatory) && (
                              <CustomButton
                                variant="ghost"
                                size="sm"
                                onClick={() => (isPendingRemoval ? undoRemove(course.id) : stageRemove(course.id))}
                                icon={
                                  isPendingRemoval ? (
                                    <RotateCcw className="h-4 w-4" aria-hidden />
                                  ) : (
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                  )
                                }
                              >
                                {isPendingRemoval ? 'Undo' : 'Remove'}
                              </CustomButton>
                            )}
                            {data.canEdit && !isStagedAdd && !isPendingRemoval && (
                              <div className="w-full border-t border-outline-variant pt-3">
                                <h4 className="mb-2 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                                  Lecture, tutorial and lab slots
                                </h4>
                                {courseSlots?.components.filter((component) => component.required > 0).length ? (
                                  <div className="space-y-4">
                                    {courseSlots.components.filter((component) => component.required > 0).map((component) => {
                                      const addKey = `${course.id}-${component.slotType}-add`;
                                      const addOptions = component.options.filter(
                                        (option) => !option.assignedToStudent && option.remainingCapacity > 0 && option.clashes.length === 0
                                      );
                                      const assignedIds = new Set(component.assignments.map((assignment) => assignment.slot.id));
                                      const remainingRequired = Math.max(0, component.required - component.assignments.length);

                                      return (
                                        <div key={component.slotType} className="space-y-2">
                                          <p className="text-caption font-medium text-on-surface">
                                            {component.slotType}: {component.assignments.length} of {component.required} assigned
                                          </p>
                                          {component.assignments.map((assignment) => {
                                            const changeOptions = component.options.filter(
                                              (option) => option.id === assignment.slot.id ||
                                                (!option.assignedToStudent && option.remainingCapacity > 0 && option.clashes.length === 0)
                                            );
                                            const selectedId = selectedSlotIds[assignment.id] ?? assignment.slot.id;
                                            const details = assignment.slot;
                                            return (
                                              <div key={assignment.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                                                <Select
                                                  label={`Assigned ${component.slotType.toLowerCase()} slot`}
                                                  value={selectedId}
                                                  onChange={(event) => setSelectedSlotIds((current) => ({ ...current, [assignment.id]: event.target.value }))}
                                                  options={changeOptions.map((option) => ({
                                                    value: option.id,
                                                    label: option.id === details.id
                                                      ? `Group ${option.groupNumber} · ${option.dayOfWeek} ${option.startTime}–${option.endTime} · Room ${option.roomId} · current`
                                                      : `Group ${option.groupNumber} · ${option.dayOfWeek} ${option.startTime}–${option.endTime} · Room ${option.roomId} · ${option.remainingCapacity} seats left`,
                                                  }))}
                                                />
                                                <CustomButton
                                                  variant="secondary"
                                                  size="sm"
                                                  disabled={!selectedId || selectedId === details.id}
                                                  isLoading={slotAction === assignment.id}
                                                  onClick={() => runSlotAction(assignment.id, () => changeAdvisingScheduleSlot(studentId ?? '', assignment.id, selectedTermId, selectedId))}
                                                >
                                                  Change slot
                                                </CustomButton>
                                                <CustomButton
                                                  variant="danger-ghost"
                                                  size="sm"
                                                  isLoading={slotAction === `${assignment.id}-remove`}
                                                  onClick={() => setSlotRemoval({
                                                    assignmentId: assignment.id,
                                                    courseCode: course.code,
                                                    slotType: component.slotType,
                                                    groupNumber: details.groupNumber,
                                                  })}
                                                  icon={<Trash2 className="h-4 w-4" aria-hidden />}
                                                >
                                                  Remove slot
                                                </CustomButton>
                                              </div>
                                            );
                                          })}
                                          {remainingRequired > 0 && (
                                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                              <Select
                                                label={`Available ${component.slotType.toLowerCase()} slots`}
                                                value={selectedSlotIds[addKey] ?? ''}
                                                onChange={(event) => setSelectedSlotIds((current) => ({ ...current, [addKey]: event.target.value }))}
                                                placeholder="Select a slot with capacity and no clash"
                                                options={addOptions.filter((option) => !assignedIds.has(option.id)).map((option) => ({
                                                  value: option.id,
                                                  label: `Group ${option.groupNumber} · ${option.dayOfWeek} ${option.startTime}–${option.endTime} · Room ${option.roomId} · ${option.remainingCapacity} seats left`,
                                                }))}
                                              />
                                              <CustomButton
                                                variant="secondary"
                                                size="sm"
                                                disabled={!selectedSlotIds[addKey]}
                                                isLoading={slotAction === addKey}
                                                onClick={() => runSlotAction(addKey, () => assignAdvisingScheduleSlot(studentId ?? '', course.id, selectedTermId, component.slotType, selectedSlotIds[addKey] ?? ''))}
                                                icon={<Plus className="h-4 w-4" aria-hidden />}
                                              >
                                                Assign slot
                                              </CustomButton>
                                              {addOptions.length === 0 && (
                                                <p className="text-caption text-on-surface-variant sm:col-span-2">
                                                  No slots with remaining capacity and no timetable clash are available for this component.
                                                </p>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-caption text-on-surface-variant">
                                    {courseSlots ? 'No lecture, tutorial or lab slots are required for this course.' : 'Save this course to load its available slots.'}
                                  </p>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <EmptyState
                      icon={<BookOpen className="h-5 w-5" aria-hidden />}
                      title="No courses selected yet"
                      description="Add eligible courses, then save them as a draft to return to later."
                    />
                  )}
                </div>

                {data.canEdit && (
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Select
                      label="Eligible non-mandatory course"
                      className="flex-1"
                      value={selectedCourseId}
                      onChange={(event) => setSelectedCourseId(event.target.value)}
                      placeholder="Select an eligible course"
                      options={availableOptions.map((course) => ({
                        value: course.id,
                        label: `${course.code} — ${course.name} (${course.creditHours} credits)`,
                      }))}
                    />
                    <CustomButton
                      variant="secondary"
                      onClick={stageAdd}
                      disabled={!selectedCourseId}
                      icon={<Plus className="h-4 w-4" aria-hidden />}
                    >
                      Add course
                    </CustomButton>
                  </div>
                )}
                {data.canEdit && courseOptions.length === 0 && (
                  <p className="mt-2 text-caption text-on-surface-variant">
                    Completed or in-progress courses, courses with unmet prerequisites, and courses not offered this
                    season are excluded.
                  </p>
                )}
                {hasUnsavedChanges && (
                  <p className="mt-4 flex items-center gap-2 text-caption text-warning">
                    <Save className="h-3.5 w-3.5" aria-hidden />
                    Changes are not stored until you press Save as draft.
                  </p>
                )}
                {validation && (
                  <section className="mt-5 border-t border-outline-variant pt-4" aria-live="polite">
                    <h3 className="mb-3 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                      Draft validation
                    </h3>
                    {hasUnsavedChanges ? (
                      <AlertBanner tone="info" title="Save changes to validate the latest draft">
                        The findings below describe the last saved course and slot selections.
                      </AlertBanner>
                    ) : validation.valid ? (
                      <AlertBanner tone="success" title="No blocking issues">
                        {validation.selectedHours} credit hours selected; {validation.allowedHours} allowed or approved.
                      </AlertBanner>
                    ) : (
                      <AlertBanner tone="error" title={`${validation.issues.length} issue${validation.issues.length === 1 ? '' : 's'} to resolve`}>
                        <ul className="list-disc space-y-1 pl-5">
                          {validation.issues.map((issue, index) => <li key={`${issue.code}-${issue.courseId ?? issue.slotId ?? index}`}>{issue.message}</li>)}
                        </ul>
                      </AlertBanner>
                    )}
                  </section>
                )}
                {data.canEdit && data.draft && validation?.valid && !hasUnsavedChanges && (
                  <div className="mt-5 flex justify-end">
                    <CustomButton
                      onClick={markReadyForReview}
                      isLoading={isMarkingReady}
                      icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
                    >
                      Mark Ready for Student Review
                    </CustomButton>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(slotRemoval)}
        title="Remove assigned slot?"
        message={slotRemoval
          ? `Remove ${slotRemoval.slotType.toLowerCase()} group ${slotRemoval.groupNumber} from ${slotRemoval.courseCode}? The schedule may be incomplete until another group is assigned.`
          : ''}
        confirmLabel="Remove slot"
        isLoading={Boolean(slotRemoval && slotAction === `${slotRemoval.assignmentId}-remove`)}
        onCancel={() => setSlotRemoval(null)}
        onConfirm={() => void confirmSlotRemoval()}
      />
    </>
  );
};

export default AdvisingScheduleDraftPage;
