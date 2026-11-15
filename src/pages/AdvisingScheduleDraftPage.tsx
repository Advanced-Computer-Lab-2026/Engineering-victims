import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/PageHeader';
import Select from '../components/ui/Select';
import StudentPreferencesPanel from '../components/StudentPreferencesPanel';
import { ApiError } from '../lib/api';
import {
  addAdvisingScheduleCourse,
  createAdvisingScheduleDraft,
  fetchAdvisingScheduleDraft,
  removeAdvisingScheduleCourse,
} from '../lib/advisingScheduleDraftService';
import type { AdvisingScheduleDraftResponse } from '../lib/types';
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
  const navigate = useNavigate();
  const [data, setData] = useState<AdvisingScheduleDraftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedTermId, setSelectedTermId] = useState('');

  const load = useCallback(async (termId?: string) => {
    if (!studentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchAdvisingScheduleDraft(studentId, termId);
      setData(response);
      setSelectedTermId(response.term.id);
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

  const createDraft = async () => {
    if (!studentId) return;
    setIsCreating(true);
    setError(null);
    try {
      setData(await createAdvisingScheduleDraft(studentId, selectedTermId));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsCreating(false);
    }
  };

  const addCourse = async () => {
    if (!studentId || !selectedCourseId) return;
    setIsAdding(true);
    setError(null);
    try {
      await addAdvisingScheduleCourse(studentId, selectedCourseId, selectedTermId);
      setSelectedCourseId('');
      await load(selectedTermId);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsAdding(false);
    }
  };

  const removeCourse = async (courseId: string) => {
    if (!studentId) return;
    setRemovingId(courseId);
    setError(null);
    try {
      await removeAdvisingScheduleCourse(studentId, courseId, selectedTermId);
      await load(selectedTermId);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setRemovingId(null);
    }
  };

  const courseOptions = data?.eligibleCourses ?? [];
  const draftCourses = data?.draft?.courses ?? [];
  const hours = data?.creditHours;

  return (
    <>
      <PageHeader
        title={data?.student ? `Draft schedule for ${data.student.fullName}` : 'Advising draft schedule'}
        description="Create and continue editing an incomplete advising schedule. Changes are saved as a draft as you make them."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <CustomButton
            variant="secondary"
            size="sm"
            onClick={() => navigate(-1)}
            icon={<ArrowLeft className="h-4 w-4" aria-hidden />}
          >
            Back
          </CustomButton>
        }
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not update the draft schedule" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
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
              {!data.draft && data.canEdit ? (
                <CustomButton onClick={createDraft} isLoading={isCreating} icon={<Plus className="h-4 w-4" aria-hidden />}>
                  Create open draft
                </CustomButton>
              ) : !data.draft ? (
                <AlertBanner tone="info" title="No editable draft">
                  The student's workflow is {data.student.workflowStatus}; a new draft cannot be started in this state.
                </AlertBanner>
              ) : null}
            </div>

            {hours && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CreditHourTile label="Selected" value={hours.selected} />
                <CreditHourTile
                  label="Allowed"
                  value={hours.allowed}
                  detail={hours.isProbation ? `Reduced from ${hours.standardAllowance} for probation` : 'Standard allowance'}
                />
                <CreditHourTile label="Extra (over allowance)" value={hours.extra} warning={hours.extra > 0} />
                <CreditHourTile label="Remaining" value={hours.remaining} />
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
                  {draftCourses.length ? (
                    <ul className="divide-y divide-outline-variant">
                      {draftCourses.map((course) => (
                        <li key={course.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
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
                          </div>
                          {!course.mandatory && data.canEdit && (
                            <CustomButton
                              variant="ghost"
                              size="sm"
                              onClick={() => removeCourse(course.id)}
                              isLoading={removingId === course.id}
                              disabled={Boolean(removingId)}
                              icon={<Trash2 className="h-4 w-4" aria-hidden />}
                            >
                              Remove
                            </CustomButton>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      icon={<BookOpen className="h-5 w-5" aria-hidden />}
                      title="No courses selected yet"
                      description="This incomplete draft is saved. Add eligible courses now or return later to continue."
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
                      options={courseOptions.map((course) => ({
                        value: course.id,
                        label: `${course.code} — ${course.name} (${course.creditHours} credits)`,
                      }))}
                    />
                    <CustomButton
                      onClick={addCourse}
                      disabled={!selectedCourseId || isAdding}
                      isLoading={isAdding}
                      icon={<Plus className="h-4 w-4" aria-hidden />}
                    >
                      Add course
                    </CustomButton>
                  </div>
                )}
                {data.canEdit && courseOptions.length === 0 && (
                  <p className="mt-2 text-caption text-on-surface-variant">
                    No courses match this term&apos;s published offerings and semester progression. Completed or
                    in-progress courses, courses with unmet prerequisites, and courses not offered this season are
                    excluded.
                  </p>
                )}
                <p className="mt-4 flex items-center gap-2 text-caption text-success">
                  <Save className="h-3.5 w-3.5" aria-hidden />
                  The draft and each course change are saved automatically; you can return to edit it later.
                </p>
              </>
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
};

export default AdvisingScheduleDraftPage;
