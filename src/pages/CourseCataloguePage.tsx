import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronRight, ListFilter, Loader2, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import CourseDrawer, { COURSE_TYPE_TONE, type CourseDrawerMode } from '../components/CourseDrawer';
import CourseImportDialog from '../components/CourseImportDialog';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';
import { ApiError } from '../lib/api';
import { fetchCourses, deleteCourse } from '../lib/coursesService';
import { recommendedSemesterFor, recommendedSemesterLabel } from '../lib/courseSemester';
import { COURSE_MAJORS, COURSE_SEASONS, COURSE_TYPES, type Course, type CourseImportResult } from '../lib/types';

interface CourseFilters {
  courseType: string;
  major: string;
  recommendedSemester: string;
  offeringSeason: string;
}

const EMPTY_COURSE_FILTERS: CourseFilters = {
  courseType: '',
  major: '',
  recommendedSemester: '',
  offeringSeason: '',
};

const byCatalogueOrder = (a: Course, b: Course) =>
  Math.min(...a.majors.map((major) => recommendedSemesterFor(a, major))) -
    Math.min(...b.majors.map((major) => recommendedSemesterFor(b, major))) ||
  a.code.localeCompare(b.code, undefined, { numeric: true });

/**
 * Req 18-20: the Administrator's course catalogue. The whole catalogue is a
 * few dozen rows, so it is loaded once and searched and filtered in the browser.
 */
const CourseCataloguePage: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<CourseFilters>(EMPTY_COURSE_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<CourseDrawerMode | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCourses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchCourses();
      setCourses(response.courses);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const filtersActive = search.trim() !== '' || Object.values(filters).some(Boolean);

  const visibleCourses = useMemo(() => {
    const term = search.trim().toLowerCase();
    const compactTerm = term.replace(/\s+/g, '');

    return courses.filter((course) => {
      if (
        term &&
        !course.code.toLowerCase().replace(/\s+/g, '').includes(compactTerm) &&
        !course.name.toLowerCase().includes(term)
      ) {
        return false;
      }
      if (filters.courseType && course.courseType !== filters.courseType) return false;
      if (filters.major && !course.majors.includes(filters.major as Course['majors'][number])) return false;
      if (
        filters.recommendedSemester &&
        !(filters.major
          ? [filters.major as Course['majors'][number]].some(
              (major) => String(recommendedSemesterFor(course, major)) === filters.recommendedSemester
            )
          : course.majors.some((major) => String(recommendedSemesterFor(course, major)) === filters.recommendedSemester))
      ) {
        return false;
      }
      if (filters.offeringSeason && !course.offeringSeasons.includes(filters.offeringSeason as Course['offeringSeasons'][number])) {
        return false;
      }
      return true;
    });
  }, [courses, search, filters]);

  const semesters = useMemo(
    () => [...new Set(courses.flatMap((course) => course.majors.map((major) => recommendedSemesterFor(course, major))))].sort((a, b) => a - b),
    [courses]
  );

  const selectedCourse = courses.find((course) => course.id === selectedId) ?? null;

  const clearFilters = () => {
    setSearch('');
    setFilters(EMPTY_COURSE_FILTERS);
  };

  const openCourse = (course: Course) => {
    setSelectedId(course.id);
    setDrawerMode('view');
  };

  const openCreate = () => {
    setSelectedId(null);
    setDrawerMode('create');
  };

  const closeDrawer = useCallback(() => setDrawerMode(null), []);
  const closeImport = useCallback(() => setImportOpen(false), []);

  // Req 128: show the counts and reload, since an import can touch many rows at once.
  const handleImported = async (result: CourseImportResult) => {
    setImportOpen(false);
    setImportNotice(result.message);
    await loadCourses();
  };

  // Req 21: delete a course from the catalogue (the server flags it inactive).
  const handleDelete = (course: Course, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeleteTarget(course);
  };

  const performDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await deleteCourse(deleteTarget.id);
      setDeleteTarget(null);
      await loadCourses();
    } catch (err) {
      setError((err as ApiError).message);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaved = (saved: Course, created: boolean) => {
    setCourses((current) => {
      // Other courses show this one's code as a prerequisite, so a renamed
      // code has to be reflected there too.
      const summary = { id: saved.id, code: saved.code, name: saved.name };
      const next = (created ? [...current, saved] : current.map((item) => (item.id === saved.id ? saved : item))).map(
        (item) =>
          item.prerequisites.some((prerequisite) => prerequisite.id === saved.id)
            ? {
                ...item,
                prerequisites: item.prerequisites.map((prerequisite) =>
                  prerequisite.id === saved.id ? summary : prerequisite
                ),
              }
            : item
      );
      return next.sort(byCatalogueOrder);
    });
    setSelectedId(saved.id);
  };

  return (
    <>
      <PageHeader
        title="Course Catalogue"
        description="Every course students can be scheduled into. Select a course to see its details or edit it."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <div className="flex flex-wrap gap-2">
            <CustomButton
              variant="secondary"
              onClick={() => setImportOpen(true)}
              icon={<Upload className="h-4 w-4" aria-hidden />}
            >
              Import CSV
            </CustomButton>
            <CustomButton onClick={openCreate} icon={<Plus className="h-4 w-4" aria-hidden />}>
              New course
            </CustomButton>
          </div>
        }
      />

      {importNotice && (
        <div className="mb-4">
          <AlertBanner tone="success" title="Import complete" onDismiss={() => setImportNotice(null)}>
            {importNotice}
          </AlertBanner>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load the catalogue" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by course code or name"
              aria-label="Search courses"
              className="w-full rounded-lg border border-outline-variant bg-surface-container-low py-2.5 pl-9 pr-3 text-body text-on-surface placeholder:text-on-surface-variant transition-colors hover:border-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-2">
            <CustomButton
              variant={showFilters ? 'primary' : 'secondary'}
              onClick={() => setShowFilters((current) => !current)}
              icon={<ListFilter className="h-4 w-4" aria-hidden />}
              aria-expanded={showFilters}
            >
              Filters
              {Object.values(filters).some(Boolean) && (
                <span className="ml-1 rounded-full bg-primary-container px-1.5 text-caption font-semibold text-on-primary-container">
                  {Object.values(filters).filter(Boolean).length}
                </span>
              )}
            </CustomButton>
            {filtersActive && (
              <CustomButton variant="ghost" onClick={clearFilters} icon={<X className="h-4 w-4" aria-hidden />}>
                Clear
              </CustomButton>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 grid gap-3 border-t border-outline-variant pt-4 md:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Course type"
              placeholder="All types"
              value={filters.courseType}
              onChange={(event) => setFilters((current) => ({ ...current, courseType: event.target.value }))}
              options={COURSE_TYPES.map((value) => ({ value, label: value }))}
            />
            <Select
              label="Major"
              placeholder="All majors"
              value={filters.major}
              onChange={(event) => setFilters((current) => ({ ...current, major: event.target.value }))}
              options={COURSE_MAJORS.map((value) => ({ value, label: value }))}
            />
            <Select
              label="Recommended semester"
              placeholder="All semesters"
              value={filters.recommendedSemester}
              onChange={(event) => setFilters((current) => ({ ...current, recommendedSemester: event.target.value }))}
              options={semesters.map((value) => ({ value: String(value), label: `Semester ${value}` }))}
            />
            <Select
              label="Offering season"
              placeholder="All seasons"
              value={filters.offeringSeason}
              onChange={(event) => setFilters((current) => ({ ...current, offeringSeason: event.target.value }))}
              options={COURSE_SEASONS.map((value) => ({ value, label: value }))}
            />
          </div>
        )}
      </Card>

      {isLoading ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading courses...
        </Card>
      ) : visibleCourses.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title={filtersActive ? 'No courses match these criteria' : 'The catalogue is empty'}
          description={
            filtersActive
              ? 'Try a different search term, or clear the filters to see every course.'
              : 'Add the first course to start building the catalogue.'
          }
          action={
            filtersActive
              ? { label: 'Clear all filters', onClick: clearFilters }
              : { label: 'New course', onClick: openCreate }
          }
        />
      ) : (
        <>
          <p className="mb-2 text-caption text-on-surface-variant">
            {visibleCourses.length === courses.length
              ? `${courses.length} courses`
              : `${visibleCourses.length} of ${courses.length} courses`}
          </p>
          <Card tone="raised" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-body">
                <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                    <th scope="col" className="px-4 py-3 font-semibold">CH</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Majors</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Sem.</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Season</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Prerequisites</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {visibleCourses.map((course) => (
                    <tr
                      key={course.id}
                      onClick={() => openCourse(course)}
                      className="cursor-pointer transition-colors hover:bg-surface-container"
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono text-body font-semibold text-primary">{course.code}</div>
                        <div className="text-caption text-on-surface-variant">{course.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={COURSE_TYPE_TONE[course.courseType]}>{course.courseType}</Badge>
                      </td>
                      <td className="px-4 py-3 text-on-surface">{course.creditHours}</td>
                      <td className="px-4 py-3 text-on-surface">
                        {course.majors.length === COURSE_MAJORS.length ? 'Both' : course.majors.join(', ')}
                      </td>
                      <td className="px-4 py-3 text-on-surface">{recommendedSemesterLabel(course)}</td>
                      <td className="px-4 py-3 text-on-surface">{course.offeringSeasons.join(', ')}</td>
                      <td className="px-4 py-3 font-mono text-caption text-on-surface-variant">
                        {course.prerequisites.length === 0
                          ? '—'
                          : course.prerequisites.map((prerequisite) => prerequisite.code).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(event) => handleDelete(course, event)}
                            aria-label={`Delete ${course.code}`}
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error-container hover:text-error"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openCourse(course);
                            }}
                            aria-label={`View ${course.code}`}
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                          >
                            <ChevronRight className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <CourseDrawer
        mode={drawerMode}
        course={selectedCourse}
        courses={courses}
        onClose={closeDrawer}
        onModeChange={setDrawerMode}
        onSaved={handleSaved}
      />

      <CourseImportDialog open={importOpen} onClose={closeImport} onImported={handleImported} />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this course?"
        message={
          <>
            <span className="font-medium text-on-surface">{deleteTarget?.code}</span> will be marked
            inactive and removed from the catalogue. Existing offerings keep their records.
          </>
        }
        confirmLabel="Delete course"
        tone="danger"
        isLoading={isDeleting}
        onConfirm={performDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
};

export default CourseCataloguePage;
