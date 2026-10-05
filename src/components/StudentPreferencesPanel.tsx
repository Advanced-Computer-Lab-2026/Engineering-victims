import React, { useEffect, useState } from 'react';
import { Clock, ListOrdered, Loader2, StickyNote } from 'lucide-react';
import { ApiError } from '../lib/api';
import { fetchStudentPreferences } from '../lib/schedulingPreferencesService';
import { formatDate, formatRelative } from '../lib/studentsService';
import type { PreferenceEntry, PreferenceKind, StudentPreferencesResponse } from '../lib/types';
import AlertBanner from './ui/AlertBanner';
import Badge, { type BadgeTone } from './ui/Badge';

interface StudentPreferencesPanelProps {
  studentId: string;
  className?: string;
}

const KIND_TONE: Record<PreferenceKind, BadgeTone> = {
  'Preferred day': 'emerald',
  'Preferred time range': 'emerald',
  'Avoided day': 'rose',
  'Avoided time range': 'rose',
  'Day off': 'amber',
  'Preferred group': 'indigo',
};

/** The detail of one entry, in the words the student chose it with. */
const describe = (entry: PreferenceEntry): string => {
  switch (entry.kind) {
    case 'Preferred time range':
    case 'Avoided time range':
      return `${entry.startTime}–${entry.endTime}`;
    case 'Preferred group':
      return entry.courseCode ? `Group ${entry.groupNumber} for ${entry.courseCode}` : `Group ${entry.groupNumber}`;
    default:
      return entry.day ?? '';
  }
};

const formatDateTime = (value: string) =>
  `${formatDate(value)}, ${new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

/**
 * Req 58: an Advising Student's latest submitted scheduling preferences, shown
 * to the Advisor or Coordinator while they create or update the draft.
 *
 * Read-only and self-loading from a student id, so any staff scheduling view
 * (the draft schedule today, the draft builder later) can drop it in. Entries
 * are listed in the stored order, which is the student's priority.
 */
const StudentPreferencesPanel: React.FC<StudentPreferencesPanelProps> = ({ studentId, className = '' }) => {
  const [data, setData] = useState<StudentPreferencesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setIsLoading(true);

    fetchStudentPreferences(studentId)
      .then((response) => {
        if (!cancelled) setData(response);
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
  }, [studentId]);

  const preference = data?.preference ?? null;

  return (
    <section
      aria-labelledby="student-preferences-heading"
      className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-4 ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 id="student-preferences-heading" className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
          <ListOrdered className="h-4 w-4 text-indigo-400" aria-hidden />
          Scheduling preferences
        </h3>
        {data?.term && <Badge tone="neutral">{data.term.label}</Badge>}
        {preference && (
          <span className="ml-auto flex items-center gap-1 text-xs text-slate-400" title={formatDateTime(preference.updatedAt)}>
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Last updated {formatRelative(preference.updatedAt)}
            <span className="text-slate-500">({formatDateTime(preference.updatedAt)})</span>
          </span>
        )}
      </div>

      {error && (
        <AlertBanner tone="error" title="Could not load scheduling preferences">
          {error}
        </AlertBanner>
      )}

      {isLoading && (
        <p className="flex items-center gap-2 py-4 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading preferences...
        </p>
      )}

      {data && !preference && (
        <p className="py-2 text-sm text-slate-400">
          This student has not submitted any scheduling preferences. A schedule can still be created for them.
        </p>
      )}

      {preference && (
        <>
          {preference.preferences.length > 0 ? (
            <ol className="divide-y divide-slate-800/70" aria-label="Preferences in priority order">
              {preference.preferences.map((entry, index) => (
                <li key={`${entry.priority ?? index + 1}-${entry.kind}`} className="flex items-center gap-3 py-2">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 font-mono text-xs text-slate-300"
                    aria-label={`Priority ${entry.priority ?? index + 1}`}
                  >
                    {entry.priority ?? index + 1}
                  </span>
                  <Badge tone={KIND_TONE[entry.kind]}>{entry.kind}</Badge>
                  <span className="text-sm text-slate-200">{describe(entry)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-2 text-sm text-slate-400">No ranked preferences, only a note.</p>
          )}

          {preference.note && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-950/50 p-3 text-sm text-slate-300">
              <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <span className="whitespace-pre-line break-words">{preference.note}</span>
            </p>
          )}

          <p className="mt-3 text-xs text-slate-500">
            Satisfy these when feasible. They never override mandatory courses, prerequisites, published offerings,
            capacity, timetable clashes, credit-hour limits or approved extra hours.
          </p>
        </>
      )}
    </section>
  );
};

export default StudentPreferencesPanel;
