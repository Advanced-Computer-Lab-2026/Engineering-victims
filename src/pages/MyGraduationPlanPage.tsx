import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, GraduationCap, Loader2, MessageSquare, UserRound } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { ApiError } from '../lib/api';
import { fetchMyGraduationPlan } from '../lib/graduationPlansService';
import { formatDate } from '../lib/studentsService';
import type { GraduationPlanDetail } from '../lib/types';

/**
 * Req 114: an Advising Student sees their graduation plan only after the
 * Coordinator accepts it. The API returns nothing for a draft or a plan still
 * awaiting a decision, so an unaccepted plan cannot leak through this page.
 */
const MyGraduationPlanPage: React.FC = () => {
  const [plan, setPlan] = useState<GraduationPlanDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyGraduationPlan()
      .then((response) => {
        if (!cancelled) setPlan(response.plan);
      })
      .catch((err: ApiError) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const terms = useMemo(() => {
    if (!plan) return [];
    const coursesById = new Map(plan.remaining.map((course) => [course.id, course]));

    return plan.terms.map((term, index) => {
      const courses = plan.placements
        .filter((placement) => placement.termIndex === index)
        .map((placement) => coursesById.get(placement.courseId))
        .filter((course): course is NonNullable<typeof course> => Boolean(course));
      const hours = courses.reduce((total, course) => total + course.creditHours, 0);
      return { term, courses, hours };
    });
  }, [plan]);

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading your graduation plan...
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="My Graduation Plan"
        description="The plan your Advisor prepared and the Coordinator accepted."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load your graduation plan" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {!error && !plan && (
        <EmptyState
          icon={<GraduationCap className="h-5 w-5" aria-hidden />}
          title="No accepted graduation plan yet"
          description="Your plan will appear here once your Advisor submits it and the Coordinator accepts it."
        />
      )}

      {plan && (
        <>
          <Card tone="raised" className="mb-5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-300">
                <UserRound className="h-4 w-4 text-slate-500" aria-hidden />
                <span className="text-sm">
                  Prepared by <span className="font-medium text-slate-100">{plan.advisor?.fullName ?? 'your Advisor'}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="emerald" dot>
                  Accepted
                </Badge>
                {plan.decidedAt && (
                  <span className="text-xs text-slate-500">Accepted {formatDate(plan.decidedAt)}</span>
                )}
              </div>
            </div>

            {plan.responseNote && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2.5 text-sm text-emerald-200">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                <p>
                  <span className="font-semibold">Coordinator's note: </span>
                  {plan.responseNote}
                </p>
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            {terms.map(({ term, courses, hours }) => (
              <Card key={term.label} tone="raised" className="flex flex-col p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-slate-300">
                    <CalendarRange className="h-4 w-4 text-slate-500" aria-hidden />
                    <h2 className="text-sm font-semibold">{term.label}</h2>
                  </div>
                  <span className="text-xs text-slate-500">{hours} hrs</span>
                </div>

                {courses.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">No courses assigned to this term.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {courses.map((course) => (
                      <li
                        key={course.id}
                        className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
                      >
                        <p className="font-mono text-xs font-semibold text-indigo-300">{course.code}</p>
                        <p className="text-sm text-slate-200">{course.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{course.creditHours} credit hours</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
};

export default MyGraduationPlanPage;
