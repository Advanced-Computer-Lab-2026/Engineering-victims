import React, { useEffect, useMemo, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  BookOpen,
  Building2,
  CalendarDays,
  Clock,
  GitBranch,
  GraduationCap,
  Layers,
  Pencil,
  Plus,
  Save,
  X,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { createCourse, updateCourse } from '../lib/coursesService';
import {
  COURSE_MAJORS,
  COURSE_SEASONS,
  COURSE_TYPES,
  type Course,
  type CourseDraft,
  type CourseMajor,
  type CourseType,
} from '../lib/types';
import { recommendedSemesterLabel } from '../lib/courseSemester';
import AlertBanner from './ui/AlertBanner';
import Badge, { type BadgeTone } from './ui/Badge';
import CheckboxGroup from './ui/CheckboxGroup';
import CustomButton from './ui/CustomButton';
import CustomInput from './ui/CustomInput';
import Select from './ui/Select';

export type CourseDrawerMode = 'view' | 'edit' | 'create';

interface CourseDrawerProps {
  mode: CourseDrawerMode | null;
  /** The course being viewed or edited; null when creating. */
  course: Course | null;
  /** The whole catalogue, for the prerequisite picker and "required by". */
  courses: Course[];
  onClose: () => void;
  onModeChange: (mode: CourseDrawerMode) => void;
  onSaved: (course: Course, created: boolean) => void;
}

export const COURSE_TYPE_TONE: Record<CourseType, BadgeTone> = {
  Core: 'indigo',
  Elective: 'emerald',
  Huma: 'amber',
};

const emptyDraft = (): CourseDraft => ({
  code: '',
  name: '',
  creditHours: '',
  lectureHours: '0',
  tutorialHours: '0',
  labHours: '0',
  courseType: 'Core',
  faculty: 'MET',
  majors: [...COURSE_MAJORS],
  recommendedSemester: '1',
  recommendedSemesterByMajor: [],
  offeringSeasons: ['Winter'],
  prerequisites: [],
});

const draftFrom = (course: Course): CourseDraft => ({
  code: course.code,
  name: course.name,
  creditHours: String(course.creditHours),
  lectureHours: String(course.lectureHours),
  tutorialHours: String(course.tutorialHours),
  labHours: String(course.labHours),
  courseType: course.courseType,
  faculty: course.faculty,
  majors: [...course.majors],
  recommendedSemester: String(course.recommendedSemester),
  recommendedSemesterByMajor: (course.recommendedSemesterByMajor ?? []).map((entry) => ({
    major: entry.major,
    semester: String(entry.semester),
  })),
  offeringSeasons: [...course.offeringSeasons],
  prerequisites: course.prerequisites.map((prerequisite) => prerequisite.id),
});

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

const DetailRow: React.FC<DetailRowProps> = ({ icon, label, children }) => (
  <div className="flex items-start gap-3 py-2.5">
    <span className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden>
      {icon}
    </span>
    <div className="min-w-0 flex-1">
      <dt className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">{label}</dt>
      <dd className="mt-0.5 break-words text-body text-on-surface">{children}</dd>
    </div>
  </div>
);

/**
 * Req 19 (view a course's details), with req 18 (create) and req 20 (update)
 * in the same side panel. Like the student drawer, it slides over the list so
 * closing it returns the user to the same filters and scroll position.
 */
const CourseDrawer: React.FC<CourseDrawerProps> = ({ mode, course, courses, onClose, onModeChange, onSaved }) => {
  const [draft, setDraft] = useState<CourseDraft>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLElement>(!!mode);
  const [isSaving, setIsSaving] = useState(false);

  // Reset the form whenever the panel opens on a different course or mode.
  useEffect(() => {
    setError(null);
    if (mode === 'create') setDraft(emptyDraft());
    if (mode === 'edit' && course) setDraft(draftFrom(course));
    // A save switches to view mode on purpose, so its notice survives that.
    if (mode !== 'view') setNotice(null);
  }, [mode, course?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mode, onClose]);

  const byId = useMemo(() => new Map(courses.map((item) => [item.id, item])), [courses]);

  const requiredBy = useMemo(
    () =>
      course
        ? courses.filter((item) => item.prerequisites.some((prerequisite) => prerequisite.id === course.id))
        : [],
    [course, courses]
  );

  const prerequisiteOptions = useMemo(
    () =>
      courses
        .filter((item) => item.id !== course?.id && !draft.prerequisites.includes(item.id))
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
        .map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` })),
    [courses, course?.id, draft.prerequisites]
  );

  if (!mode) return null;

  const isForm = mode !== 'view';
  const set = <K extends keyof CourseDraft>(field: K, value: CourseDraft[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const weeklyHours =
    (Number(draft.lectureHours) || 0) + (Number(draft.tutorialHours) || 0) + (Number(draft.labHours) || 0);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      if (mode === 'edit' && course) {
        const response = await updateCourse(course.id, draft);
        onSaved(response.course, false);
        setNotice(`${response.course.code} was updated.`);
      } else {
        const response = await createCourse(draft);
        onSaved(response.course, true);
        setNotice(`${response.course.code} was added to the catalogue.`);
      }
      onModeChange('view');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsSaving(false);
    }
  };

  const title =
    mode === 'create' ? 'New course' : mode === 'edit' ? `Edit ${course?.code ?? 'course'}` : course?.code ?? '';
  const subtitle = mode === 'create' ? 'Add a course to the catalogue.' : course?.name;

  return (
    <div className="fixed inset-0 z-toast flex justify-end">
      <div className="absolute inset-0 scrim backdrop-blur-sm" onClick={onClose} aria-hidden />

      <aside
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'create' ? 'New course' : 'Course details'}
        className="relative flex h-full w-full max-w-xl flex-col border-l border-outline-variant bg-surface-container-lowest shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant p-6">
          <div className="min-w-0">
            <h2 className="truncate text-h3 font-bold text-on-surface">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-body text-on-surface-variant">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {!isForm && course && (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {notice && (
                <AlertBanner tone="success" onDismiss={() => setNotice(null)}>
                  {notice}
                </AlertBanner>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={COURSE_TYPE_TONE[course.courseType]}>{course.courseType}</Badge>
                <Badge>{course.creditHours} credit hours</Badge>
              </div>

              <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
                <h3 className="mb-1 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">Course</h3>
                <dl className="divide-y divide-outline-variant">
                  <DetailRow icon={<BookOpen className="h-4 w-4" />} label="Name">
                    {course.name}
                  </DetailRow>
                  <DetailRow icon={<Building2 className="h-4 w-4" />} label="Faculty">
                    {course.faculty}
                  </DetailRow>
                  <DetailRow icon={<GraduationCap className="h-4 w-4" />} label="Majors">
                    {course.majors.join(', ')}
                  </DetailRow>
                  <DetailRow icon={<Layers className="h-4 w-4" />} label="Recommended semester">
                    {recommendedSemesterLabel(course)}
                  </DetailRow>
                  <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Offering season">
                    {course.offeringSeasons.join(', ')}
                  </DetailRow>
                  <DetailRow icon={<Clock className="h-4 w-4" />} label="Weekly hours">
                    {course.lectureHours} lecture · {course.tutorialHours} tutorial · {course.labHours} lab
                  </DetailRow>
                </dl>
              </section>

              <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
                <h3 className="mb-3 flex items-center gap-2 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                  <GitBranch className="h-3.5 w-3.5" aria-hidden />
                  Prerequisites
                </h3>
                {course.prerequisites.length === 0 ? (
                  <p className="text-body text-on-surface-variant">None. Any student can take this course.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {course.prerequisites.map((prerequisite) => (
                      <li key={prerequisite.id} className="text-body text-on-surface">
                        <span className="font-mono text-primary">{prerequisite.code}</span>{' '}
                        <span className="text-on-surface-variant">{prerequisite.name}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {requiredBy.length > 0 && (
                  <>
                    <h4 className="mb-2 mt-4 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                      Required by
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {requiredBy.map((item) => (
                        <Badge key={item.id} className="font-mono">
                          {item.code}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>

            <div className="flex justify-end border-t border-outline-variant p-4">
              <CustomButton onClick={() => onModeChange('edit')} icon={<Pencil className="h-4 w-4" aria-hidden />}>
                Edit course
              </CustomButton>
            </div>
          </>
        )}

        {isForm && (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {error && (
                <AlertBanner
                  tone="error"
                  title={mode === 'edit' ? 'Could not update the course' : 'Could not create the course'}
                  onDismiss={() => setError(null)}
                >
                  {error}
                </AlertBanner>
              )}

              <div className="grid gap-4 md:grid-cols-[10rem_minmax(0,1fr)]">
                <CustomInput
                  label="Code"
                  value={draft.code}
                  onChange={(event) => set('code', event.target.value)}
                  placeholder="CSEN 501"
                  required
                />
                <CustomInput
                  label="Name"
                  value={draft.name}
                  onChange={(event) => set('name', event.target.value)}
                  placeholder="Data Base I"
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Select
                  label="Course type"
                  value={draft.courseType}
                  onChange={(event) => set('courseType', event.target.value as CourseType)}
                  options={COURSE_TYPES.map((value) => ({ value, label: value }))}
                />
                <CustomInput
                  label="Faculty"
                  value={draft.faculty}
                  onChange={(event) => set('faculty', event.target.value)}
                  required
                />
                <Select
                  label="Recommended semester"
                  value={draft.recommendedSemester}
                  onChange={(event) => set('recommendedSemester', event.target.value)}
                  options={Array.from({ length: 10 }, (_, index) => ({
                    value: String(index + 1),
                    label: `Semester ${index + 1}`,
                  }))}
                />
              </div>

              <CheckboxGroup
                legend="Majors"
                options={COURSE_MAJORS}
                value={draft.majors}
                onChange={(value) => {
                  setDraft((current) => ({
                    ...current,
                    majors: value,
                    recommendedSemesterByMajor: current.recommendedSemesterByMajor.filter((entry) => value.includes(entry.major)),
                  }));
                }}
              />

              {draft.majors.length > 1 && (
                <div className="grid gap-4 md:grid-cols-2">
                  {draft.majors.map((major) => (
                    <Select
                      key={major}
                      label={`Semester for ${major}`}
                      placeholder={`Use default (Semester ${draft.recommendedSemester})`}
                      value={draft.recommendedSemesterByMajor.find((entry) => entry.major === major)?.semester ?? ''}
                      onChange={(event) => {
                        const semester = event.target.value;
                        setDraft((current) => ({
                          ...current,
                          recommendedSemesterByMajor: [
                            ...current.recommendedSemesterByMajor.filter((entry) => entry.major !== major),
                            ...(semester ? [{ major: major as CourseMajor, semester }] : []),
                          ],
                        }));
                      }}
                      options={Array.from({ length: 10 }, (_, index) => ({
                        value: String(index + 1),
                        label: `Semester ${index + 1}`,
                      }))}
                    />
                  ))}
                </div>
              )}

              <CheckboxGroup
                legend="Offering season"
                options={COURSE_SEASONS}
                value={draft.offeringSeasons}
                onChange={(value) => set('offeringSeasons', value)}
              />

              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <CustomInput
                  label="Lecture hrs"
                  type="number"
                  min={0}
                  max={12}
                  value={draft.lectureHours}
                  onChange={(event) => set('lectureHours', event.target.value)}
                />
                <CustomInput
                  label="Tutorial hrs"
                  type="number"
                  min={0}
                  max={12}
                  value={draft.tutorialHours}
                  onChange={(event) => set('tutorialHours', event.target.value)}
                />
                <CustomInput
                  label="Lab hrs"
                  type="number"
                  min={0}
                  max={12}
                  value={draft.labHours}
                  onChange={(event) => set('labHours', event.target.value)}
                />
                <CustomInput
                  label="Credit hours"
                  type="number"
                  min={1}
                  max={12}
                  value={draft.creditHours}
                  onChange={(event) => set('creditHours', event.target.value)}
                  hint={weeklyHours > 0 ? `${weeklyHours} weekly hours` : undefined}
                  required
                />
              </div>

              <div className="space-y-2">
                <Select
                  label="Prerequisites"
                  placeholder="Add a prerequisite..."
                  value=""
                  onChange={(event) => {
                    if (event.target.value) set('prerequisites', [...draft.prerequisites, event.target.value]);
                  }}
                  options={prerequisiteOptions}
                />
                {draft.prerequisites.length === 0 ? (
                  <p className="text-caption text-on-surface-variant">No prerequisites.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {draft.prerequisites.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary-container py-1 pl-3 pr-1.5 text-caption font-medium text-on-primary-container ring-1 ring-inset ring-primary"
                      >
                        <span className="font-mono">{byId.get(id)?.code ?? 'Removed course'}</span>
                        <button
                          type="button"
                          onClick={() => set('prerequisites', draft.prerequisites.filter((item) => item !== id))}
                          aria-label={`Remove ${byId.get(id)?.code ?? 'prerequisite'}`}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-container hover:text-on-surface"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-outline-variant p-4">
              <CustomButton
                variant="ghost"
                onClick={() => (mode === 'edit' ? onModeChange('view') : onClose())}
                type="button"
              >
                Cancel
              </CustomButton>
              <CustomButton
                type="submit"
                isLoading={isSaving}
                icon={
                  mode === 'edit' ? <Save className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />
                }
              >
                {mode === 'edit' ? 'Save changes' : 'Create course'}
              </CustomButton>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
};

export default CourseDrawer;
