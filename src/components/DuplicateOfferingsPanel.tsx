import React, { useEffect, useMemo, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { AlertTriangle, CheckCircle2, Layers, X } from 'lucide-react';
import { ApiError } from '../lib/api';
import {
  courseOfferingService,
  type DuplicateOfferingsResponse,
} from '../lib/courseOfferingService';
import type { AcademicTerm } from '../lib/types';
import AlertBanner from './ui/AlertBanner';
import Badge from './ui/Badge';
import Card from './ui/Card';
import CustomButton from './ui/CustomButton';
import Select from './ui/Select';

interface DuplicateOfferingsPanelProps {
  terms: AcademicTerm[];
  defaultTargetTermId?: string;
  onDuplicated: (targetTermId: string, message: string) => void;
  onClose: () => void;
}

/**
 * Req 24: Administrator selects a source academic year and season (or source
 * term) and an existing target term to duplicate course offerings into.
 *
 * Every copy is created as an unpublished Draft with assignedCount reset to 0,
 * existing offerings in the target term are skipped, and room/instructor
 * conflicts are flagged for review before publication.
 */
const DuplicateOfferingsPanel: React.FC<DuplicateOfferingsPanelProps> = ({
  terms,
  defaultTargetTermId = '',
  onDuplicated,
  onClose,
}) => {
  const academicYears = useMemo(
    () => [...new Set(terms.map((t) => t.academicYear))].sort(),
    [terms]
  );

  const [sourceAcademicYear, setSourceAcademicYear] = useState<string>(academicYears[0] ?? '');
  const [sourceSeason, setSourceSeason] = useState<string>('Winter');
  const [targetTermId, setTargetTermId] = useState<string>(defaultTargetTermId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  // Escape closes the panel unless the duplicate request is in flight.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isSubmitting, onClose]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DuplicateOfferingsResponse | null>(null);

  const availableSeasonsForYear = useMemo(() => {
    const matching = terms
      .filter((t) => !sourceAcademicYear || t.academicYear === sourceAcademicYear)
      .map((t) => t.season);
    return matching.length > 0 ? [...new Set(matching)] : ['Winter', 'Spring', 'Summer'];
  }, [terms, sourceAcademicYear]);

  const matchedSourceTerm = useMemo(
    () =>
      terms.find(
        (t) => t.academicYear === sourceAcademicYear && t.season === sourceSeason
      ) ?? null,
    [terms, sourceAcademicYear, sourceSeason]
  );

  const handleYearChange = (year: string) => {
    setSourceAcademicYear(year);
    const firstMatch = terms.find((t) => t.academicYear === year);
    if (firstMatch) setSourceSeason(firstMatch.season);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sourceAcademicYear || !sourceSeason) {
      setError('Select the source academic year and season.');
      return;
    }
    if (!targetTermId) {
      setError('Select an existing target academic term.');
      return;
    }
    if (matchedSourceTerm && matchedSourceTerm.id === targetTermId) {
      setError('The source term and target term must be different.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await courseOfferingService.duplicateOfferings({
        sourceTermId: matchedSourceTerm?.id,
        sourceAcademicYear,
        sourceSeason,
        targetTermId,
      });
      setResult(response);
      onDuplicated(targetTermId, response.message);
    } catch (err) {
      setError((err as ApiError).message || 'Could not duplicate course offerings.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-toast flex items-center justify-center p-4">
      <div className="absolute inset-0 scrim backdrop-blur-sm" onClick={onClose} aria-hidden />

      <Card
        ref={trapRef}
        tone="raised"
        role="dialog"
        aria-modal="true"
        aria-label="Duplicate course offerings"
        className="relative z-sticky max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6"
      >
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
              <Layers className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-h3 font-bold text-on-surface">Duplicate Course Offerings</h2>
              <p className="text-caption text-on-surface-variant">
                Copy offerings and slot structures from a previous term into a target term as Drafts.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close duplicate offerings dialog"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <AlertBanner tone="info" title="Duplication Rules">
            Copied offerings are created as unpublished <strong>Drafts</strong> with{' '}
            <strong>0 assigned students</strong> and full remaining capacity. Courses already
            offered in the target term are skipped without overwriting, and room or instructor
            conflicts are flagged for review.
          </AlertBanner>

          <div className="grid gap-4 md:grid-cols-3">
            <Select
              label="Source Academic Year"
              placeholder="Select year..."
              value={sourceAcademicYear}
              onChange={(e) => handleYearChange(e.target.value)}
              options={academicYears.map((yr) => ({ value: yr, label: yr }))}
            />

            <Select
              label="Source Season"
              value={sourceSeason}
              onChange={(e) => {
                setSourceSeason(e.target.value);
                setError(null);
              }}
              options={['Winter', 'Spring', 'Summer'].map((season) => ({
                value: season,
                label: availableSeasonsForYear.includes(season as AcademicTerm['season'])
                  ? season
                  : `${season} (no term found)`,
              }))}
            />

            <Select
              label="Target Academic Term"
              placeholder="Select target term..."
              value={targetTermId}
              onChange={(e) => {
                setTargetTermId(e.target.value);
                setError(null);
              }}
              options={terms.map((t) => ({
                value: t.id,
                label: `${t.academicYear} ${t.season}`,
              }))}
            />
          </div>

          {error && (
            <AlertBanner tone="error" title="Could not duplicate offerings" onDismiss={() => setError(null)}>
              {error}
            </AlertBanner>
          )}

          {result && (
            <div className="space-y-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <div className="flex items-center gap-2 text-body font-semibold text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                <span>{result.message}</span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                  <div className="text-h2 font-bold text-success">{result.copiedCount}</div>
                  <div className="text-caption text-on-surface-variant">Copied as Drafts</div>
                </div>
                <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                  <div className="text-h2 font-bold text-on-surface">{result.skippedCount}</div>
                  <div className="text-caption text-on-surface-variant">Skipped (Existing)</div>
                </div>
                <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                  <div className="text-h2 font-bold text-warning">{result.conflictCount}</div>
                  <div className="text-caption text-on-surface-variant">Conflicts Flagged</div>
                </div>
              </div>

              {result.copiedOfferings.length > 0 && (
                <div>
                  <h3 className="mb-2 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                    Copied Draft Offerings
                  </h3>
                  <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                    {result.copiedOfferings.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-caption"
                      >
                        <div>
                          <span className="font-mono font-semibold text-on-surface">{item.courseCode}</span>{' '}
                          <span className="text-on-surface">{item.courseName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone="amber">Draft</Badge>
                          <span className="text-on-surface-variant">
                            {item.slotsCopied} slots · {item.totalRemainingCapacity} seats free
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.skippedOfferings.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                    Skipped Offerings (Already in Target Term)
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {result.skippedOfferings.map((item) => (
                      <Badge key={item.courseId} tone="neutral">
                        {item.courseCode}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {result.conflicts.length > 0 && (
                <div className="rounded-xl border border-warning bg-warning-container p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-caption font-semibold text-warning">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                    <span>Room & Instructor Conflicts to Resolve Before Publishing</span>
                  </div>
                  <ul className="max-h-36 space-y-1 overflow-y-auto text-caption text-warning">
                    {result.conflicts.map((conflict, idx) => (
                      <li key={idx}>• {conflict.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-outline-variant pt-4">
            <CustomButton variant="secondary" size="sm" onClick={onClose}>
              Close
            </CustomButton>
            <CustomButton
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              icon={<Layers className="h-4 w-4" aria-hidden />}
            >
              Duplicate Offerings
            </CustomButton>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default DuplicateOfferingsPanel;
