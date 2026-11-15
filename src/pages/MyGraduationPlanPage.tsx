import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, GraduationCap, Loader2, MessageSquare, UserRound } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { ApiError } from '../lib/api';
import { fetchMyExitExamRequests } from '../lib/exitExamRequestsService';
import { fetchMyGraduationPlan } from '../lib/graduationPlansService';
import { formatDate } from '../lib/studentsService';
import type { ExitExamRequestSummary, GraduationPlanDetail } from '../lib/types';

/**
 * Req 114: an Advising Student sees their graduation plan only after the
 * Coordinator accepts it. The API returns nothing for a draft or a plan still
 * awaiting a decision, so an unaccepted plan cannot leak through this page.
 */
const MyGraduationPlanPage: React.FC = () => {
  const [plan, setPlan] = useState<GraduationPlanDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exitExamRequests, setExitExamRequests] = useState<ExitExamRequestSummary[]>([]);
  const [exitExamError, setExitExamError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    fetchMyExitExamRequests()
      .then((response) => {
        if (!cancelled) setExitExamRequests(response.requests);
      })
      .catch((err: ApiError) => {
        if (!cancelled) setExitExamError(err.message);
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
      <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
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

      <section className="mb-5">
        <h2 className="mb-3 text-body-lg font-semibold text-on-surface">My exit-exam requests</h2>
        {exitExamError ? (
          <AlertBanner tone="error" title="Could not load exit-exam requests">
            {exitExamError}
          </AlertBanner>
        ) : exitExamRequests.length === 0 ? (
          <Card className="p-4 text-body text-on-surface-variant">
            You do not have any exit-exam requests.
          </Card>
        ) : (
          <div className="space-y-3">
            {exitExamRequests.map((request) => (
              <Card key={request.id} tone="raised" className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-on-surface">
                      {request.course?.code ?? 'Failed course'} — {request.course?.name ?? 'Course'}
                    </h3>
                    <p className="mt-1 text-caption text-on-surface-variant">
                      Submitted {formatDate(request.submittedAt)}
                      {request.decidedAt ? ` · Decided ${formatDate(request.decidedAt)}` : ''}
                    </p>
                  </div>
                  <Badge
                    tone={
                      request.status === 'Approved'
                        ? 'emerald'
                        : request.status === 'Rejected'
                          ? 'rose'
                          : 'amber'
                    }
                    dot
                  >
                    {request.status === 'Pending' ? 'Awaiting Coordinator decision' : request.status}
                  </Badge>
                </div>
                <div className="mt-3 space-y-2 text-body">
                  <p className="text-on-surface">
                    <span className="font-medium text-on-surface">Advisor's explanation: </span>
                    {request.reason}
                  </p>
                  {request.responseNote && (
                    <p className="whitespace-pre-wrap text-on-surface">
                      <span className="font-medium text-on-surface">Coordinator's response: </span>
                      {request.responseNote}
                    </p>
                  )}
                  {request.decidedBy && (
                    <p className="text-caption text-on-surface-variant">Reviewed by {request.decidedBy.fullName}</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {plan && (
        <>
          <Card tone="raised" className="mb-5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-on-surface">
                <UserRound className="h-4 w-4 text-on-surface-variant" aria-hidden />
                <span className="text-body">
                  Prepared by <span className="font-medium text-on-surface">{plan.advisor?.fullName ?? 'your Advisor'}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="emerald" dot>
                  Accepted
                </Badge>
                {plan.decidedAt && (
                  <span className="text-caption text-on-surface-variant">Accepted {formatDate(plan.decidedAt)}</span>
                )}
              </div>
            </div>

            {plan.responseNote && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-success bg-success-container px-3 py-2.5 text-body text-success">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
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
                  <div className="flex items-center gap-2 text-on-surface">
                    <CalendarRange className="h-4 w-4 text-on-surface-variant" aria-hidden />
                    <h2 className="text-body font-semibold">{term.label}</h2>
                  </div>
                  <span className="text-caption text-on-surface-variant">{hours} hrs</span>
                </div>

                {courses.length === 0 ? (
                  <p className="mt-4 text-body text-on-surface-variant">No courses assigned to this term.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {courses.map((course) => (
                      <li
                        key={course.id}
                        className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2"
                      >
                        <p className="font-mono text-caption font-semibold text-primary">{course.code}</p>
                        <p className="text-body text-on-surface">{course.name}</p>
                        <p className="mt-0.5 text-caption text-on-surface-variant">{course.creditHours} credit hours</p>
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
