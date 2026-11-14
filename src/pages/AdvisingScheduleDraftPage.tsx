import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import AlertBanner from '../components/ui/AlertBanner';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/PageHeader';
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
  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-xl font-semibold ${warning ? 'text-amber-300' : 'text-slate-100'}`}>{value} hours</p>
    {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
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
        <p className="flex items-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading draft schedule...
        </p>
      ) : data ? (
        <div className="space-y-4">
          <StudentPreferencesPanel studentId={data.student.id} />

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">
                  {data.student.studentId} · {data.student.major} · Semester {data.student.currentSemester}
                </p>
                {data.draft && (
                  <p className="mt-1 text-xs text-slate-500" title={formatDate(data.draft.updatedAt)}>
                    Draft saved {formatRelative(data.draft.updatedAt)} ({formatDate(data.draft.updatedAt)})
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-400">
                Term
                <select
                  value={selectedTermId}
                  onChange={(event) => {
                    const termId = event.target.value;
                    setSelectedTermId(termId);
                    setSelectedCourseId('');
                    load(termId);
                  }}
                  aria-label="Schedule term"
                  className="min-h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
                >
                  {data.terms.map((term) => (
                    <option key={term.id} value={term.id}>{term.label}</option>
                  ))}
                </select>
              </label>
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
                  <h3 className="mb-3 text-sm font-semibold text-slate-200">Courses in this draft</h3>
                  {draftCourses.length ? (
                    <ul className="divide-y divide-slate-800">
                      {draftCourses.map((course) => (
                        <li key={course.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <span className="font-medium text-slate-100">{course.code}</span>
                            <span className="ml-2 text-sm text-slate-400">{course.name}</span>
                            <span className="ml-2 text-xs text-slate-500">{course.creditHours} credits</span>
                            {course.mandatory && (
                              <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                                Mandatory
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
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <select
                      value={selectedCourseId}
                      onChange={(event) => setSelectedCourseId(event.target.value)}
                      aria-label="Eligible non-mandatory course"
                      className="min-h-10 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
                    >
                      <option value="">Select an eligible course</option>
                      {courseOptions.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.code} — {course.name} ({course.creditHours} credits)
                        </option>
                      ))}
                    </select>
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
                  <p className="mt-2 text-xs text-slate-500">
                    No courses match this term&apos;s published offerings and semester progression. Completed or
                    in-progress courses, courses with unmet prerequisites, and courses not offered this season are
                    excluded.
                  </p>
                )}
                <p className="mt-4 flex items-center gap-2 text-xs text-emerald-300">
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
