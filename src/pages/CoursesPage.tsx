import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Loader2,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { courseService } from '../lib/courseService';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import { type Course, type CoursesResponse } from '../lib/types';

const PAGE_SIZE = 25;

const CoursesPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CoursesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      try {
        const response = await courseService.fetchCourses();
        setData(response);
      } catch (err) {
        setError((err as ApiError).message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string, code: string) => {
    if (!window.confirm(`Are you sure you want to delete course ${code}? This action will mark the course as inactive.`)) {
      return;
    }

    try {
      await courseService.deleteCourse(id);
      await load(true);
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  const courses = data?.courses ?? [];
  const pagination = data?.pagination;

  return (
    <>
      <PageHeader
        title="Course Catalogue"
        description="Manage the available courses in the system."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <CustomButton
            variant="secondary"
            size="sm"
            onClick={() => load(true)}
            isLoading={isRefreshing}
            icon={<RotateCcw className="h-4 w-4" aria-hidden />}
          >
            Refresh
          </CustomButton>
        }
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Error" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading courses...
        </Card>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="No courses found"
          description="Courses will appear here once they are added to the catalogue."
        />
      ) : (
        <Card tone="raised" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Code</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Credits</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Description</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {courses.map((course) => (
                  <tr key={course.id} className="group transition-colors hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{course.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-100">{course.name}</td>
                    <td className="px-4 py-3 text-slate-300">{course.credits}</td>
                    <td className="px-4 py-3 text-slate-400">{course.description}</td>
                    <td className="px-4 py-3 text-right">
                      <CustomButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(course.id, course.code)}
                        icon={<Trash2 className="h-4 w-4" aria-hidden />}
                      >
                        Delete
                      </CustomButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
};

export default CoursesPage;
