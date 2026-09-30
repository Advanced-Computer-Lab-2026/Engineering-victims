import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronRight, ListFilter, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import CourseDrawer, { COURSE_TYPE_TONE, type CourseDrawerMode } from '../components/CourseDrawer';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';
import { ApiError } from '../lib/api';
import { fetchCourses, deleteCourse } from '../lib/coursesService';
import { COURSE_MAJORS, COURSE_SEASONS, COURSE_TYPES, type Course } from '../lib/types';

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
  a.recommendedSemester - b.recommendedSemester || a.code.localeCompare(b.code, undefined, { numeric: true });

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
      if (filters.recommendedSemester && String(course.recommendedSemester) !== filters.recommendedSemester) {
        return false;
      }
      if (filters.offeringSeason && !course.offeringSeasons.includes(filters.offeringSeason as Course['offeringSeasons'][number])) {
        return false;
      }
      return true;
    });
  }, [courses, search, filters]);

  const semesters = useMemo(
    () => [...new Set(courses.map((course) => course.recommendedSemester))].sort((a, b) => a - b),
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

  // Req 21: delete a course from the catalogue (the server flags it inactive).
  const handleDelete = async (course: Course, event: React.MouseEvent) => {
    event.stopPropagation();
    if (
      !window.confirm(
        `Are you sure you want to delete course ${course.code}? This action will mark the course as inactive.`
      )
    ) {
      return;
    }
    try {
      await deleteCourse(course.id);
      await loadCourses();
    } catch (err) {
      setError((err as ApiError).message);
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
          <CustomButton onClick={openCreate} icon={<Plus className="h-4 w-4" aria-hidden />}>
            New course
          </CustomButton>
        }
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load the catalogue" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by course code or name"
              aria-label="Search courses"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/70 py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 transition-colors hover:border-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
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
                <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px] font-semibold">
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
          <div className="mt-4 grid gap-3 border-t border-slate-800/70 pt-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
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
          <p className="mb-2 text-xs text-slate-500">
            {visibleCourses.length === courses.length
              ? `${courses.length} courses`
              : `${visibleCourses.length} of ${courses.length} courses`}
          </p>
          <Card tone="raised" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
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
                <tbody className="divide-y divide-slate-800/60">
                  {visibleCourses.map((course) => (
                    <tr
                      key={course.id}
                      onClick={() => openCourse(course)}
                      className="cursor-pointer transition-colors hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono text-sm font-semibold text-indigo-300">{course.code}</div>
                        <div className="text-xs text-slate-400">{course.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={COURSE_TYPE_TONE[course.courseType]}>{course.courseType}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{course.creditHours}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {course.majors.length === COURSE_MAJORS.length ? 'Both' : course.majors.join(', ')}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{course.recommendedSemester}</td>
                      <td className="px-4 py-3 text-slate-300">{course.offeringSeasons.join(', ')}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
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
                            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
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
                            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
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
    </>
  );
};

export default CourseCataloguePage;
