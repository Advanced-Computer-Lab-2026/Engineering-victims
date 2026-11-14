import React, { useEffect, useState } from 'react';
import { CalendarRange, Loader2, Pencil, Plus, Save } from 'lucide-react';
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
  const formRef = React.useRef<HTMLFormElement>(null);

  const loadTerms = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchAcademicTerms();
      // The form stays in create mode until a term is picked from the list, so
      // saving never quietly edits a term the user did not choose.
      setTerms(response.terms);
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
    setError(null);
    setNotice(null);
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

    // Below the xl breakpoint the form sits under the list, so bring the
    // editor into view instead of leaving the click looking unanswered.
    if (window.innerWidth < 1280) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const resetForm = () => {
    setSelectedId(null);
    setDraft(emptyDraft());
    setNotice(null);
  };

  const selectedTerm = terms.find((term) => term.id === selectedId) ?? null;

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
        description="Create a term, or select a saved term on the left to edit its registration and advising-season dates."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      {error && (
        <div className="mb-4">
          <AlertBanner
            tone="error"
            title={selectedId ? 'Could not update the term' : 'Could not create the term'}
            onDismiss={() => setError(null)}
          >
            {error}
          </AlertBanner>
        </div>
      )}

      {notice && (
        <div className="mb-4">
          <AlertBanner tone="success" onDismiss={() => setNotice(null)}>{notice}</AlertBanner>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-body font-semibold uppercase tracking-eyebrow text-on-surface-variant">
              <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
              Saved Terms
            </div>
            <CustomButton
              variant="secondary"
              size="sm"
              onClick={resetForm}
              disabled={!selectedId}
              icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
            >
              New term
            </CustomButton>
          </div>

          {!isLoading && terms.length > 0 && (
            <p className="mb-3 mt-2 text-caption text-on-surface-variant">
              Select a term to edit its dates.
            </p>
          )}

          {isLoading ? (
            <div role="status" className="flex items-center justify-center gap-2 py-10 text-body text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading terms...
            </div>
          ) : terms.length === 0 ? (
            <p className="text-body text-on-surface-variant">No academic terms yet. Create the first one.</p>
          ) : (
            <div className="space-y-2">
              {terms.map((term) => {
                const isSelected = selectedId === term.id;

                return (
                  <button
                    key={term.id}
                    type="button"
                    onClick={() => handleSelectTerm(term)}
                    aria-label={`Edit the ${term.season} ${term.academicYear} term`}
                    aria-pressed={isSelected}
                    className={`group w-full rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary-container text-on-surface'
                        : 'border-outline-variant bg-surface-container-low text-on-surface hover:border-outline-variant'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{term.season}</span>
                      <span className="text-caption text-on-surface-variant">{term.academicYear}</span>
                    </div>
                    <p className="mt-1 text-caption text-on-surface-variant">
                      {new Date(term.advisingDeadline).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                    <span
                      className={`mt-2 inline-flex items-center gap-1.5 text-caption font-medium ${
                        isSelected ? 'text-primary' : 'text-primary group-hover:text-primary'
                      }`}
                    >
                      <Pencil className="h-3 w-3" aria-hidden />
                      {isSelected ? 'Editing this term' : 'Edit'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-h3 font-semibold text-on-surface">
                  {selectedTerm
                    ? `Edit ${selectedTerm.season} ${selectedTerm.academicYear}`
                    : 'Create academic term'}
                </h2>
                <p className="mt-0.5 text-body text-on-surface-variant">
                  {selectedTerm
                    ? 'Change the dates below, then save your updates.'
                    : 'Set the registration and advising dates for a new term.'}
                </p>
              </div>
              {selectedTerm && (
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
                <span className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">Season</span>
                <select
                  value={draft.season}
                  onChange={(event) => handleChange('season', event.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-body text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
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
