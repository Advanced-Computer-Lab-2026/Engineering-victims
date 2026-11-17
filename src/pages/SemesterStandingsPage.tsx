import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import AlertBanner from '../components/ui/AlertBanner';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import PageHeader from '../components/PageHeader';
import Select from '../components/ui/Select';
import { ApiError } from '../lib/api';
import { fetchAcademicTerms } from '../lib/termsService';
import { fetchStudents } from '../lib/studentsService';
import { EMPTY_FILTERS, type AcademicTerm, type StudentSummary } from '../lib/types';
import {
  fetchSemesterStandings,
  finalizeSemesterStanding,
  type SemesterStandingsResponse,
} from '../lib/semesterStandingsService';

const SemesterStandingsPage: React.FC = () => {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [studentId, setStudentId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [gpa, setGpa] = useState('');
  const [revision, setRevision] = useState('0');
  const [history, setHistory] = useState<SemesterStandingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [studentResponse, termResponse] = await Promise.all([
        fetchStudents({ ...EMPTY_FILTERS, studentType: 'Advising Student', search }, 1, 100),
        fetchAcademicTerms(),
      ]);
      setStudents(studentResponse.students);
      setTerms(termResponse.terms.filter((term) =>
        ['Winter', 'Spring'].includes(term.season) && new Date(term.termEndDate) < new Date()
      ));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    if (!studentId) {
      setHistory(null);
      setLoadingHistory(false);
      return;
    }
    let active = true;
    setHistory(null);
    setError(null);
    setLoadingHistory(true);
    void fetchSemesterStandings(studentId)
      .then((response) => {
        if (!active) return;
        setHistory(response);
        const current = response.history.find((item) => item.term === selectedTerm);
        setRevision(String(current?.revision ?? 0));
      })
      .catch((err: ApiError) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoadingHistory(false); });
    return () => { active = false; };
  }, [studentId]);

  const termOptions = useMemo(() => terms.map((term) => ({
    value: term.id,
    label: `${term.academicYear} ${term.season}`,
  })), [terms]);

  const handleFinalize = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!studentId || !selectedTerm || !gpa) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await finalizeSemesterStanding(studentId, selectedTerm, Number(gpa), Number(revision));
      setNotice(result.message);
      const next = await fetchSemesterStandings(studentId);
      setHistory(next);
      setRevision(String(result.standing.revision));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Semester Standings"
        description="Review an advising student's finalized Winter and Spring standings, and record an authoritative semester-close GPA."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={<CustomButton variant="secondary" size="sm" onClick={() => void load()} isLoading={loading} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>Refresh</CustomButton>}
      />
      {error && <div className="mb-4"><AlertBanner tone="error" title="Could not complete the request">{error}</AlertBanner></div>}
      {notice && <div className="mb-4"><AlertBanner tone="success">{notice}</AlertBanner></div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold text-on-surface">Finalize a semester</h2>
          <label className="flex flex-col gap-1.5 text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">
            Find student
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, student ID or email"
              className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-body normal-case tracking-normal text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <Select
            label="Advising student"
            value={studentId}
            onChange={(event) => {
              setStudentId(event.target.value);
              setSelectedTerm('');
              setGpa('');
              setRevision('0');
              setNotice(null);
            }}
            placeholder="Choose a student"
            options={students.map((student) => ({ value: student.id, label: `${student.fullName} · ${student.studentId}` }))}
            disabled={loading}
          />
          <form onSubmit={handleFinalize} className="space-y-4">
            <Select
              label="Winter or Spring term"
              value={selectedTerm}
              onChange={(event) => {
                setSelectedTerm(event.target.value);
                const current = history?.history.find((item) => item.term === event.target.value);
                setRevision(String(current?.revision ?? 0));
              }}
              placeholder="Choose a completed term"
              options={termOptions}
              disabled={!studentId || loading || loadingHistory}
            />
            <p className="text-caption text-on-surface-variant">Current revision for this student and term: {revision}</p>
            <label className="flex flex-col gap-1.5 text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">
              Cumulative GPA at semester close
              <input
                type="number"
                min="0.70"
                max="5"
                step="0.01"
                required
                value={gpa}
                onChange={(event) => setGpa(event.target.value)}
                className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-body text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <p className="text-caption text-on-surface-variant">Probation is determined by the server's 3.70 GPA threshold. Revisions require the current revision shown below.</p>
            <CustomButton type="submit" disabled={!studentId || !selectedTerm || !gpa || saving} isLoading={saving} icon={<Save className="h-4 w-4" aria-hidden />}>Finalize standing</CustomButton>
          </form>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-on-surface">Standing history</h2>
              {history && <p className="mt-1 text-body text-on-surface-variant">
                Current: {history.summary.standing ?? 'Not finalized'}
                {history.summary.isProbation && ` · ${history.summary.consecutiveProbationSemesters} consecutive semester(s)`}
              </p>}
            </div>
            {(loading || loadingHistory) && <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" aria-label="Loading" />}
          </div>
          {!studentId ? <p className="text-body text-on-surface-variant">Choose a student to view their finalized standing history.</p>
            : loadingHistory || !history ? <p className="text-body text-on-surface-variant">Loading standing history…</p>
              : history.history.length === 0 ? <p className="text-body text-on-surface-variant">No semesters have been finalized.</p>
                : <div className="overflow-x-auto">
                  <table className="w-full text-left text-body">
                    <thead className="text-caption uppercase tracking-eyebrow text-on-surface-variant">
                      <tr><th className="py-2 pr-3">Term</th><th className="py-2 pr-3">GPA</th><th className="py-2 pr-3">Standing</th><th className="py-2">Revision</th></tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {history.history.map((item) => <React.Fragment key={item._id}>
                        <tr>
                          <td className="py-3 pr-3 text-on-surface">{item.academicYear} {item.season}</td>
                          <td className="py-3 pr-3 text-on-surface">{item.cumulativeGpa.toFixed(2)}</td>
                          <td className="py-3 pr-3 text-on-surface">{item.standing}</td>
                          <td className="py-3 text-on-surface-variant">{item.revision}</td>
                        </tr>
                        {(item.previousVersions ?? []).map((version) => <tr key={`${item._id}-${version.revision}`} className="text-caption text-on-surface-variant">
                          <td className="pb-2 pr-3 pl-3">{item.academicYear} {item.season} · prior</td>
                          <td className="pb-2 pr-3">{version.cumulativeGpa.toFixed(2)}</td>
                          <td className="pb-2 pr-3">{version.standing}</td>
                          <td className="pb-2">Revision {version.revision}</td>
                        </tr>)}
                      </React.Fragment>)}
                    </tbody>
                  </table>
                </div>}
        </Card>
      </div>
    </>
  );
};

export default SemesterStandingsPage;
