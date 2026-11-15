import React, { useEffect, useState } from 'react';
import { BookOpen, CreditCard, Loader2, Eye } from 'lucide-react';
import { ApiError, apiFetch } from '../lib/api';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import AlertBanner from '../components/ui/AlertBanner';
import EmptyState from '../components/ui/EmptyState';
import CustomButton from '../components/ui/CustomButton';
import CourseDetailDrawer from '../components/CourseDetailDrawer';
import { Course, SlotChangeEligibility } from '../lib/types';
import { useSession } from '../hooks/useSession';
import { fetchSlotChangeEligibility } from '../lib/slotChangeRequestsService';
import { formatDate } from '../lib/studentsService';

interface RegisteredCourse extends Course {
  id: string;
  code: string;
  name: string;
  creditHours: number;
}

interface MyCoursesResponse {
  courses: RegisteredCourse[];
  totalCreditHours: number;
  /** The term the registration belongs to, so the page can say which one. */
  term: { id: string; academicYear: string; season: string } | null;
}

const MyRegisteredCoursesPage: React.FC = () => {
  const [courses, setCourses] = useState<RegisteredCourse[]>([]);
  const [totalCredits, setTotalCredits] = useState(0);
  const [term, setTerm] = useState<{ academicYear: string; season: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourseName, setSelectedCourseName] = useState<string>('');

  // Req 40: tell an Advising Student under review that slot changes can be
  // requested from a course's details, and until when.
  const { user } = useSession();
  const isAdvisingStudent = user?.role === 'Student' && user.studentType === 'Advising Student';
  const [eligibility, setEligibility] = useState<SlotChangeEligibility | null>(null);

  useEffect(() => {
    if (!isAdvisingStudent) return;
    let cancelled = false;
    fetchSlotChangeEligibility()
      .then((result) => {
        if (!cancelled) setEligibility(result);
      })
      .catch(() => {
        if (!cancelled) setEligibility(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdvisingStudent]);

  useEffect(() => {
    const loadCourses = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Req 32: View my registered courses and total credits
        const response = await apiFetch<MyCoursesResponse>('/api/students/my-courses');
        setCourses(response.courses);
        setTotalCredits(response.totalCreditHours);
        setTerm(response.term);
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
        description={
          term
            ? `Courses you are registered for in ${term.academicYear} ${term.season}.`
            : 'List of courses you are currently registered for this term.'
        }
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Error" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {eligibility?.canRequest && eligibility.term && courses.length > 0 && (
        <div className="mb-4">
          <AlertBanner tone="info" title="Your schedule is ready for review">
            Open a course's details to request a change to one of its lecture, tutorial or lab slots. Requests close on{' '}
            <span className="font-semibold">{formatDate(eligibility.term.advisingDeadline)}</span> (end of day).
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
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
            <Card tone="raised" className="flex items-center gap-4 p-4 bg-primary-container border-primary">
              <div className="rounded-lg bg-primary p-2 text-on-primary">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">Total Registered Credits</p>
                <p className="text-h2 font-bold text-on-surface">{totalCredits}</p>
              </div>
            </Card>
          </div>

          <Card tone="raised" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body">
                <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Course Code</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Course Name</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Credit Hours</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {courses.map((course) => (
                    <tr key={course.id} className="transition-colors hover:bg-surface-container">
                      <td className="px-4 py-3 font-mono font-semibold text-primary">{course.code}</td>
                      <td className="px-4 py-3 text-on-surface">{course.name}</td>
                      <td className="px-4 py-3 text-right text-on-surface">{course.creditHours}</td>
                      <td className="px-4 py-3 text-right">
                        <CustomButton
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedCourseId(course.id);
                            setSelectedCourseName(`${course.code} - ${course.name}`);
                          }}
                          icon={<Eye className="h-4 w-4" />}
                        >
                          View Details
                        </CustomButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Req 33: Course Detail Drawer */}
      {selectedCourseId && (
        <CourseDetailDrawer
          courseId={selectedCourseId}
          courseName={selectedCourseName}
          onClose={() => {
            setSelectedCourseId(null);
            setSelectedCourseName('');
          }}
        />
      )}
    </>
  );
};

export default MyRegisteredCoursesPage;
