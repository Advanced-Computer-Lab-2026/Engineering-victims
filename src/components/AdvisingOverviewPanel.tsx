import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchAdvisingOverview } from '../lib/advisingStudentsService';
import { ApiError } from '../lib/api';
import type { AdvisingOverview, OutstandingCourse } from '../lib/types';
import AlertBanner from './ui/AlertBanner';
import Badge, { type BadgeTone } from './ui/Badge';

interface AdvisingOverviewPanelProps {
  studentId: string;
  /** The Advisor's drawer already lists the advising reason, so it hides this one. */
  showReason?: boolean;
}

const STATE_TONE: Record<OutstandingCourse['state'], BadgeTone> = {
  Failed: 'rose',
  'In progress': 'sky',
  'Not attended': 'neutral',
};

/** An early-semester student has dozens of courses left; the drawer shows the first few. */
const LIST_LIMIT = 6;

const OutstandingList: React.FC<{ title: string; courses: OutstandingCourse[] }> = ({ title, courses }) =>
  courses.length === 0 ? null : (
    <div className="mt-3">
      <h4 className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">{title}</h4>
      <ul className="mt-1.5 space-y-1.5">
        {courses.slice(0, LIST_LIMIT).map((entry) => (
          <li key={entry.course.id} className="flex items-center justify-between gap-3 text-body">
            <span className="min-w-0 truncate text-on-surface">
              <span className="font-mono text-caption text-on-surface-variant">{entry.course.code}</span> {entry.course.name}
            </span>
            <Badge tone={STATE_TONE[entry.state]}>{entry.state}</Badge>
          </li>
        ))}
      </ul>
      {courses.length > LIST_LIMIT && (
        <p className="mt-1.5 text-caption text-on-surface-variant">
          and {courses.length - LIST_LIMIT} more — see the academic history for the full list.
        </p>
      )}
    </div>
  );

/**
 * Req 59: the system-calculated credit-hour allowance and bachelor-project
 * eligibility of one advising student, plus the advising reason where the
 * surrounding drawer does not already show it.
 *
 * Everything is read-only. The schedule status sits in the drawer's own
 * workflow section, which reads the same derived field.
 */
const AdvisingOverviewPanel: React.FC<AdvisingOverviewPanelProps> = ({ studentId, showReason = true }) => {
  const [overview, setOverview] = useState<AdvisingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOverview(null);
    setError(null);

    fetchAdvisingOverview(studentId)
      .then((response) => {
        if (!cancelled) setOverview(response.overview);
      })
      .catch((err: ApiError) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (error) {
    return (
      <AlertBanner tone="error" title="Could not load the advising overview">
        {error}
      </AlertBanner>
    );
  }

  if (!overview) {
    return (
      <section role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-outline-variant bg-surface-container-low p-6 text-body text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Calculating allowance and eligibility...
      </section>
    );
  }

  const { allowance, bachelorProject } = overview;

  return (
    <>
      <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
        <h3 className="text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">Credit-hour allowance</h3>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-h2 font-bold text-on-surface">{allowance.allowedHours}</span>
          <span className="text-body text-on-surface-variant">hours allowed</span>
          {allowance.isProbation && <Badge tone="amber">Probation, {allowance.reductionPercent}% less</Badge>}
        </div>
        <p className="mt-2 text-caption leading-relaxed text-on-surface-variant">
          {allowance.band}: the standard allowance is {allowance.standardHours} hours.{' '}
          {allowance.isProbation
            ? `Reduced by ${allowance.reductionPercent}% and rounded up for probation; no increase can be granted.`
            : 'An increase needs approved extra hours.'}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-body">
          <div>
            <dt className="text-caption uppercase tracking-eyebrow text-on-surface-variant">GPA</dt>
            <dd className="mt-0.5 text-on-surface">{allowance.gpa === null ? 'Not graded yet' : allowance.gpa.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-eyebrow text-on-surface-variant">Completed hours</dt>
            <dd className="mt-0.5 text-on-surface">{overview.completedHours}</dd>
          </div>
          {showReason && (
            <div className="col-span-2">
              <dt className="text-caption uppercase tracking-eyebrow text-on-surface-variant">Advising reason</dt>
              <dd className="mt-0.5 text-on-surface">
                {overview.advisingReason ?? <span className="text-on-surface-variant">Not recorded</span>}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">Bachelor project</h3>
          <Badge tone={bachelorProject.eligible ? 'emerald' : 'rose'} dot>
            {bachelorProject.eligible ? 'Eligible' : 'Not eligible'}
          </Badge>
        </div>
        <p className="mt-2 text-body leading-relaxed text-on-surface">{bachelorProject.explanation}</p>
        <OutstandingList title="English courses still required" courses={bachelorProject.outstandingEnglish} />
        <OutstandingList title="Semester 1-6 courses not completed" courses={bachelorProject.outstandingCourses} />
      </section>
    </>
  );
};

export default AdvisingOverviewPanel;
