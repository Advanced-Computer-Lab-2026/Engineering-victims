import React, { useEffect, useState } from 'react';
import { CalendarRange, Loader2, Save } from 'lucide-react';
import AlertBanner from '../components/ui/AlertBanner';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import CustomInput from '../components/ui/CustomInput';
import PageHeader from '../components/PageHeader';
import { ApiError } from '../lib/api';
import { createAcademicTerm, fetchAcademicTerms, updateAcademicTerm } from '../lib/termsService';
import type { AcademicTerm, AcademicTermDraft } from '../lib/types';

const emptyDraft = (): AcademicTermDraft => ({
  academicYear: '',
  season: 'Winter',
  termStartDate: '',
  termEndDate: '',
  teachingStartDate: '',
  teachingEndDate: '',
  advisingDeadline: '',
  swapDeadline: '',
});

const formatDateValue = (value: string | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const AcademicTermsPage: React.FC = () => {
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AcademicTermDraft>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadTerms = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchAcademicTerms();
      setTerms(response.terms);
      if (response.terms.length > 0) {
        const latest = response.terms[0];
        setSelectedId(latest.id);
        setDraft({
          academicYear: latest.academicYear,
          season: latest.season,
          termStartDate: formatDateValue(latest.termStartDate),
          termEndDate: formatDateValue(latest.termEndDate),
          teachingStartDate: formatDateValue(latest.teachingStartDate),
          teachingEndDate: formatDateValue(latest.teachingEndDate),
          advisingDeadline: formatDateValue(latest.advisingDeadline),
          swapDeadline: formatDateValue(latest.swapDeadline),
        });
      }
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTerms();
  }, []);

  const handleSelectTerm = (term: AcademicTerm) => {
    setSelectedId(term.id);
    setDraft({
      academicYear: term.academicYear,
      season: term.season,
      termStartDate: formatDateValue(term.termStartDate),
      termEndDate: formatDateValue(term.termEndDate),
      teachingStartDate: formatDateValue(term.teachingStartDate),
      teachingEndDate: formatDateValue(term.teachingEndDate),
      advisingDeadline: formatDateValue(term.advisingDeadline),
      swapDeadline: formatDateValue(term.swapDeadline),
    });
  };

  const resetForm = () => {
    setSelectedId(null);
    setDraft(emptyDraft());
    setNotice(null);
  };

  const handleChange = (field: keyof AcademicTermDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSaving(true);

    try {
      if (selectedId) {
        const response = await updateAcademicTerm(selectedId, draft);
        setTerms((current) =>
          current.map((item) => (item.id === response.term.id ? response.term : item)).sort((a, b) => b.academicYear.localeCompare(a.academicYear) || a.season.localeCompare(b.season))
        );
        setNotice('Academic term updated successfully.');
      } else {
        const response = await createAcademicTerm(draft);
        setTerms((current) => [response.term, ...current].sort((a, b) => b.academicYear.localeCompare(a.academicYear) || a.season.localeCompare(b.season)));
        setSelectedId(response.term.id);
        setNotice('Academic term created successfully.');
      }
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Academic Terms"
        description="Create and update term dates used by advising, registration and swaps."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Term update failed">{error}</AlertBanner>
        </div>
      )}

      {notice && (
        <div className="mb-4">
          <AlertBanner tone="success" onDismiss={() => setNotice(null)}>{notice}</AlertBanner>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            <CalendarRange className="h-4 w-4 text-indigo-400" aria-hidden />
            Saved Terms
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading terms...
            </div>
          ) : terms.length === 0 ? (
            <p className="text-sm text-slate-400">No academic terms yet. Create the first one.</p>
          ) : (
            <div className="space-y-2">
              {terms.map((term) => (
                <button
                  key={term.id}
                  type="button"
                  onClick={() => handleSelectTerm(term)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    selectedId === term.id
                      ? 'border-indigo-500 bg-indigo-500/10 text-white'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{term.season}</span>
                    <span className="text-xs text-slate-400">{term.academicYear}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(term.advisingDeadline).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">
                {selectedId ? 'Edit academic term' : 'Create academic term'}
              </h2>
              {selectedId && (
                <CustomButton variant="secondary" size="sm" onClick={resetForm} type="button">
                  New term
                </CustomButton>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <CustomInput
                label="Academic year"
                value={draft.academicYear}
                onChange={(event) => handleChange('academicYear', event.target.value)}
                placeholder="2026/2027"
                required
              />

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Season</span>
                <select
                  value={draft.season}
                  onChange={(event) => handleChange('season', event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                >
                  <option value="Winter">Winter</option>
                  <option value="Spring">Spring</option>
                  <option value="Summer">Summer</option>
                </select>
              </label>

              <CustomInput
                label="Term start"
                type="date"
                value={draft.termStartDate}
                onChange={(event) => handleChange('termStartDate', event.target.value)}
                required
              />
              <CustomInput
                label="Term end"
                type="date"
                value={draft.termEndDate}
                onChange={(event) => handleChange('termEndDate', event.target.value)}
                required
              />

              <CustomInput
                label="Teaching start"
                type="date"
                value={draft.teachingStartDate}
                onChange={(event) => handleChange('teachingStartDate', event.target.value)}
                required
              />
              <CustomInput
                label="Teaching end"
                type="date"
                value={draft.teachingEndDate}
                onChange={(event) => handleChange('teachingEndDate', event.target.value)}
                required
              />

              <CustomInput
                label="Advising deadline"
                type="date"
                value={draft.advisingDeadline}
                onChange={(event) => handleChange('advisingDeadline', event.target.value)}
                required
              />
              <CustomInput
                label="Swap deadline"
                type="date"
                value={draft.swapDeadline}
                onChange={(event) => handleChange('swapDeadline', event.target.value)}
                required
              />
            </div>

            <div className="flex justify-end">
              <CustomButton type="submit" isLoading={isSaving} icon={<Save className="h-4 w-4" aria-hidden />}>
                {selectedId ? 'Save changes' : 'Create term'}
              </CustomButton>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
};

export default AcademicTermsPage;
