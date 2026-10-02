import React, { useEffect, useState } from 'react';
import { BookOpen, CreditCard, Loader2 } from 'lucide-react';
import { ApiError, apiFetch } from '../lib/api';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import AlertBanner from '../components/ui/AlertBanner';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import { Course } from '../lib/types';

interface RegisteredCourse extends Course {
  id: string;
  code: string;
  name: string;
  creditHours: number;
}

interface MyCoursesResponse {
  courses: RegisteredCourse[];
  totalCreditHours: number;
}

const MyRegisteredCoursesPage: React.FC = () => {
  const [courses, setCourses] = useState<RegisteredCourse[]>([]);
  const [totalCredits, setTotalCredits] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCourses = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Req 32: View my registered courses and total credits
        const response = await apiFetch<MyCoursesResponse>('/api/students/my-courses');
        setCourses(response.courses);
        setTotalCredits(response.totalCreditHours);
      } catch (err) {
        setError((err as ApiError).message);
      } finally {
        setIsLoading(false);
      }
    };

    loadCourses();
  }, []);

  return (
    <>
      <PageHeader
        title="My Registered Courses"
        description="List of courses you are currently registered for this term."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
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
          Loading your courses...
        </Card>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="No registered courses"
          description="You haven't registered for any courses yet this term."
        />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Card tone="raised" className="flex items-center gap-4 p-4 bg-indigo-500/10 border-indigo-500/30">
              <div className="rounded-lg bg-indigo-500 p-2 text-white">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Registered Credits</p>
                <p className="text-2xl font-bold text-white">{totalCredits}</p>
              </div>
            </Card>
          </div>

          <Card tone="raised" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Course Code</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Course Name</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Credit Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {courses.map((course) => (
                    <tr key={course.id} className="transition-colors hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono font-semibold text-indigo-300">{course.code}</td>
                      <td className="px-4 py-3 text-slate-200">{course.name}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{course.creditHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

export default MyRegisteredCoursesPage;
