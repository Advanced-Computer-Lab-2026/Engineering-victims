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
      <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h4>
      <ul className="mt-1.5 space-y-1.5">
        {courses.slice(0, LIST_LIMIT).map((entry) => (
          <li key={entry.course.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-200">
              <span className="font-mono text-xs text-slate-400">{entry.course.code}</span> {entry.course.name}
            </span>
            <Badge tone={STATE_TONE[entry.state]}>{entry.state}</Badge>
          </li>
        ))}
      </ul>
      {courses.length > LIST_LIMIT && (
        <p className="mt-1.5 text-xs text-slate-500">
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
      <section className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Calculating allowance and eligibility...
      </section>
    );
  }

  const { allowance, bachelorProject } = overview;

  return (
    <>
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credit-hour allowance</h3>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-2xl font-bold text-white">{allowance.allowedHours}</span>
          <span className="text-sm text-slate-400">hours allowed</span>
          {allowance.isProbation && <Badge tone="amber">Probation, {allowance.reductionPercent}% less</Badge>}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          {allowance.band}: the standard allowance is {allowance.standardHours} hours.{' '}
          {allowance.isProbation
            ? `Reduced by ${allowance.reductionPercent}% and rounded up for probation; no increase can be granted.`
            : 'An increase needs approved extra hours.'}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">GPA</dt>
            <dd className="mt-0.5 text-slate-200">{allowance.gpa === null ? 'Not graded yet' : allowance.gpa.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Completed hours</dt>
            <dd className="mt-0.5 text-slate-200">{overview.completedHours}</dd>
          </div>
          {showReason && (
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Advising reason</dt>
              <dd className="mt-0.5 text-slate-200">
                {overview.advisingReason ?? <span className="text-slate-500">Not recorded</span>}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bachelor project</h3>
          <Badge tone={bachelorProject.eligible ? 'emerald' : 'rose'} dot>
            {bachelorProject.eligible ? 'Eligible' : 'Not eligible'}
          </Badge>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{bachelorProject.explanation}</p>
        <OutstandingList title="English courses still required" courses={bachelorProject.outstandingEnglish} />
        <OutstandingList title="Semester 1-6 courses not completed" courses={bachelorProject.outstandingCourses} />
      </section>
    </>
  );
};

export default AdvisingOverviewPanel;
