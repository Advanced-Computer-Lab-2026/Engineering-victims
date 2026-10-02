import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, Info, ListOrdered, Loader2, Lock, Plus, Save, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import { ApiError } from '../lib/api';
import { fetchMyPreferences, saveMyPreferences } from '../lib/schedulingPreferencesService';
import { formatDate, formatRelative } from '../lib/studentsService';
import type { PreferenceEntry, PreferenceKind, SchedulingPreferencesResponse, WeekDay } from '../lib/types';

const KINDS: PreferenceKind[] = [
  'Preferred day',
  'Avoided day',
  'Day off',
  'Preferred time range',
  'Avoided time range',
  'Preferred group',
];
const DAYS: WeekDay[] = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const NOTE_LIMIT = 500;

/** What each kind needs, so the row only shows the fields that matter. */
const needsDay = (kind: PreferenceKind) => ['Preferred day', 'Avoided day', 'Day off'].includes(kind);
const needsTime = (kind: PreferenceKind) => ['Preferred time range', 'Avoided time range'].includes(kind);

/** Form state keeps the group number as text while typing. */
interface DraftEntry {
  key: number;
  kind: PreferenceKind;
  day: WeekDay;
  startTime: string;
  endTime: string;
  groupNumber: string;
  courseCode: string;
}

let nextKey = 1;
const blankEntry = (kind: PreferenceKind = 'Preferred day'): DraftEntry => ({
  key: nextKey++,
  kind,
  day: 'Sunday',
  startTime: '08:30',
  endTime: '12:00',
  groupNumber: '1',
  courseCode: '',
});

const fromSaved = (entry: PreferenceEntry): DraftEntry => ({
  ...blankEntry(entry.kind),
  day: entry.day ?? 'Sunday',
  startTime: entry.startTime ?? '08:30',
  endTime: entry.endTime ?? '12:00',
  groupNumber: entry.groupNumber ? String(entry.groupNumber) : '1',
  courseCode: entry.courseCode ?? '',
});

/** Sends only the fields that belong to each kind, in priority order. */
const toPayload = (entries: DraftEntry[]): PreferenceEntry[] =>
  entries.map((entry) => ({
    kind: entry.kind,
    day: needsDay(entry.kind) ? entry.day : null,
    startTime: needsTime(entry.kind) ? entry.startTime : null,
    endTime: needsTime(entry.kind) ? entry.endTime : null,
    groupNumber: entry.kind === 'Preferred group' ? Number(entry.groupNumber) : null,
    courseCode: entry.kind === 'Preferred group' && entry.courseCode.trim() ? entry.courseCode.trim() : null,
  }));

/** Compared against the last save to tell whether there are unsaved changes. */
const snapshotOf = (list: DraftEntry[], text: string) => JSON.stringify({ p: toPayload(list), n: text.trim() });

const fieldClass =
  'rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 transition-colors hover:border-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Req 57: an Advising Student submits or updates ranked scheduling
 * preferences before the advising deadline. After the deadline the last
 * submission stays visible but read-only.
 */
const SchedulingPreferencesPage: React.FC = () => {
  const [data, setData] = useState<SchedulingPreferencesResponse | null>(null);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [note, setNote] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const apply = useCallback((response: SchedulingPreferencesResponse) => {
    const list = (response.preference?.preferences ?? []).map(fromSaved);
    const text = response.preference?.note ?? '';
    setData(response);
    setEntries(list);
    setNote(text);
    setSavedSnapshot(snapshotOf(list, text));
  }, []);

  useEffect(() => {
    fetchMyPreferences()
      .then(apply)
      .catch((err: ApiError) => setLoadError(err))
      .finally(() => setIsLoading(false));
  }, [apply]);

  const isOpen = Boolean(data?.term?.isOpen);
  const maxPreferences = data?.options?.maxPreferences ?? 15;
  const isDirty = useMemo(() => snapshotOf(entries, note) !== savedSnapshot, [entries, note, savedSnapshot]);

  const update = (key: number, changes: Partial<DraftEntry>) =>
    setEntries((current) => current.map((entry) => (entry.key === key ? { ...entry, ...changes } : entry)));

  const move = (index: number, by: number) =>
    setEntries((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setNotice(null);
    try {
      const response = await saveMyPreferences(toPayload(entries), note);
      apply({ ...response, options: data?.options });
      setNotice(response.message);
    } catch (err) {
      setSaveError((err as ApiError).message);
    } finally {
      setIsSaving(false);
    }
  };

  const header = (
    <PageHeader
      title="Scheduling Preferences"
      description="Tell your advisor which days, times and groups suit you, ranked from most to least important."
      onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading your preferences...
        </Card>
      </>
    );
  }

  if (loadError || !data) {
    return (
      <>
        {header}
        <AlertBanner
          tone={loadError?.status === 403 ? 'info' : 'error'}
          title={loadError?.status === 403 ? 'Not available on this account' : 'Could not load your preferences'}
        >
          {loadError?.message ?? 'Something went wrong.'}
        </AlertBanner>
      </>
    );
  }

  if (!data.term) {
    return (
      <>
        {header}
        <EmptyState
          icon={<CalendarClock className="h-5 w-5" />}
          title="No advising term yet"
          description="Preferences open once an academic term with an advising deadline exists."
        />
      </>
    );
  }

  return (
    <>
      {header}

      <div className="max-w-4xl space-y-4">
        {isOpen ? (
          <AlertBanner tone="info" title={`Open for ${data.term.label}`}>
            You can submit and change your preferences until the advising deadline,{' '}
            <span className="font-semibold">{formatDate(data.term.advisingDeadline)}</span> (end of day).
          </AlertBanner>
        ) : (
          <AlertBanner tone="error" title="The advising deadline has passed">
            Preferences for {data.term.label} closed on {formatDate(data.term.advisingDeadline)}. What you submitted is
            shown below and can no longer be changed.
          </AlertBanner>
        )}

        <p className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs leading-relaxed text-slate-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          Preferences are not guaranteed. Your advisor tries to meet them when possible, but they cannot override
          mandatory courses, prerequisites, published offerings, capacity, timetable clashes, credit-hour limits or
          approved extra-hour rules.
        </p>

        {notice && (
          <AlertBanner tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </AlertBanner>
        )}
        {saveError && (
          <AlertBanner tone="error" title="Not saved" onDismiss={() => setSaveError(null)}>
            {saveError}
          </AlertBanner>
        )}

        <Card tone="raised" className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
              <ListOrdered className="h-4 w-4 text-indigo-400" aria-hidden />
              Your preferences
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
                {entries.length}/{maxPreferences}
              </span>
            </h2>
            <p className="text-xs text-slate-500">#1 is the most important. Use the arrows to change the order.</p>
          </div>

          {entries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700/70 px-4 py-8 text-center text-sm text-slate-400">
              {isOpen ? 'No preferences yet. Add your first one below.' : 'No preferences were submitted.'}
            </p>
          ) : (
            <ol className="space-y-2">
              {entries.map((entry, index) => (
                <li
                  key={entry.key}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600/80 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <select
                    aria-label={`Preference ${index + 1} type`}
                    value={entry.kind}
                    disabled={!isOpen}
                    onChange={(event) => update(entry.key, { kind: event.target.value as PreferenceKind })}
                    className={fieldClass}
                  >
                    {KINDS.map((kind) => (
                      <option key={kind} value={kind} className="bg-slate-900">
                        {kind}
                      </option>
                    ))}
                  </select>

                  {needsDay(entry.kind) && (
                    <select
                      aria-label={`Preference ${index + 1} day`}
                      value={entry.day}
                      disabled={!isOpen}
                      onChange={(event) => update(entry.key, { day: event.target.value as WeekDay })}
                      className={fieldClass}
                    >
                      {DAYS.map((day) => (
                        <option key={day} value={day} className="bg-slate-900">
                          {day}
                        </option>
                      ))}
                    </select>
                  )}

                  {needsTime(entry.kind) && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <input
                        type="time"
                        aria-label={`Preference ${index + 1} start time`}
                        value={entry.startTime}
                        disabled={!isOpen}
                        onChange={(event) => update(entry.key, { startTime: event.target.value })}
                        className={fieldClass}
                      />
                      to
                      <input
                        type="time"
                        aria-label={`Preference ${index + 1} end time`}
                        value={entry.endTime}
                        disabled={!isOpen}
                        onChange={(event) => update(entry.key, { endTime: event.target.value })}
                        className={fieldClass}
                      />
                    </span>
                  )}

                  {entry.kind === 'Preferred group' && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      Group
                      <input
                        type="number"
                        min={1}
                        max={99}
                        aria-label={`Preference ${index + 1} group number`}
                        value={entry.groupNumber}
                        disabled={!isOpen}
                        onChange={(event) => update(entry.key, { groupNumber: event.target.value })}
                        className={`${fieldClass} w-20`}
                      />
                      for
                      <input
                        type="text"
                        placeholder="Any course (e.g. CSEN 501)"
                        aria-label={`Preference ${index + 1} course code (optional)`}
                        value={entry.courseCode}
                        disabled={!isOpen}
                        onChange={(event) => update(entry.key, { courseCode: event.target.value })}
                        className={`${fieldClass} w-52`}
                      />
                    </span>
                  )}

                  {isOpen && (
                    <span className="ml-auto flex gap-1">
                      <IconButton label={`Move preference ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </IconButton>
                      <IconButton
                        label={`Move preference ${index + 1} down`}
                        disabled={index === entries.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden />
                      </IconButton>
                      <IconButton
                        label={`Remove preference ${index + 1}`}
                        onClick={() => setEntries((current) => current.filter((item) => item.key !== entry.key))}
                        danger
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </IconButton>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}

          {isOpen && (
            <CustomButton
              variant="secondary"
              size="sm"
              className="mt-3"
              disabled={entries.length >= maxPreferences}
              onClick={() => setEntries((current) => [...current, blankEntry()])}
              icon={<Plus className="h-4 w-4" aria-hidden />}
            >
              Add preference
            </CustomButton>
          )}

          <label className="mt-5 block">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Note to your advisor (optional)</span>
            <textarea
              value={note}
              maxLength={NOTE_LIMIT}
              disabled={!isOpen}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Anything else your advisor should know, e.g. work or commute times."
              className={`${fieldClass} mt-1.5 w-full resize-y`}
            />
            <span className="mt-1 block text-right text-[11px] text-slate-500">
              {note.length}/{NOTE_LIMIT}
            </span>
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
            {isOpen ? (
              <CustomButton
                variant="primary"
                size="md"
                onClick={handleSave}
                isLoading={isSaving}
                disabled={!isDirty}
                icon={<Save className="h-4 w-4" aria-hidden />}
              >
                {data.preference ? 'Save changes' : 'Submit preferences'}
              </CustomButton>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-slate-400">
                <Lock className="h-4 w-4" aria-hidden />
                Read-only after the deadline
              </span>
            )}
            {isOpen && isDirty && <span className="text-xs text-amber-300">You have unsaved changes.</span>}
            {data.preference && (
              <span className="ml-auto text-xs text-slate-500">
                Last updated {formatRelative(data.preference.updatedAt)} ({formatDate(data.preference.updatedAt)})
              </span>
            )}
          </div>
        </Card>
      </div>
    </>
  );
};

const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, danger, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className={`rounded-lg p-2 text-slate-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-30 ${
      danger ? 'hover:bg-rose-950/50 hover:text-rose-300' : 'hover:bg-slate-800 hover:text-white'
    }`}
  >
    {children}
  </button>
);

export default SchedulingPreferencesPage;
