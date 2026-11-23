import React, { useEffect, useState } from 'react';
import { GraduationCap, Trash2 } from 'lucide-react';
import AlertBanner from './ui/AlertBanner';
import Badge from './ui/Badge';
import ConfirmDialog from './ui/ConfirmDialog';
import CustomButton from './ui/CustomButton';
import Select from './ui/Select';
import { ApiError } from '../lib/api';
import {
  removeAdvisingScheduleBachelorProject,
  setAdvisingScheduleBachelorProject,
} from '../lib/advisingScheduleDraftService';
import type { AdvisingScheduleDraftResponse, BachelorProjectSeason } from '../lib/types';

const SEASON_OPTIONS: Array<{ value: BachelorProjectSeason; label: string }> = [
  { value: 'Winter', label: 'Winter' },
  { value: 'Spring', label: 'Spring' },
];

interface BachelorProjectPanelProps {
  studentId: string;
  termId: string;
  project: AdvisingScheduleDraftResponse['bachelorProject'];
  canEdit: boolean;
  /** Receives the refreshed draft so the page can show it without discarding staged edits. */
  onChange: (response: AdvisingScheduleDraftResponse) => void | Promise<void>;
}

/**
 * Req 60: add the bachelor project to an eligible student's draft and choose
 * whether it is taken in Winter or Spring.
 *
 * Eligibility is req 59's rule, evaluated by the API; this panel only shows the
 * answer and the reason. The four-course cap and the extra-hours treatment of
 * humanities are enforced by the API too, so its messages are shown as given.
 */
const BachelorProjectPanel: React.FC<BachelorProjectPanelProps> = ({
  studentId,
  termId,
  project,
  canEdit,
  onChange,
}) => {
  const saved = project.selection?.season ?? null;
  const [season, setSeason] = useState<BachelorProjectSeason | ''>(saved ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow the saved value when the term changes or a save lands.
  useEffect(() => {
    setSeason(saved ?? '');
    setError(null);
  }, [saved, termId]);

  const run = async (action: () => Promise<AdvisingScheduleDraftResponse>): Promise<boolean> => {
    setIsSaving(true);
    setError(null);
    try {
      await onChange(await action());
      return true;
    } catch (err) {
      setError((err as ApiError).message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const save = () => {
    if (!season) return;
    void run(() => setAdvisingScheduleBachelorProject(studentId, season, termId));
  };

  const confirmRemoval = async () => {
    const removed = await run(() => removeAdvisingScheduleBachelorProject(studentId, termId));
    if (removed) setIsConfirmingRemoval(false);
  };

  const { limits } = project;

  return (
    <section className="mt-5 border-t border-outline-variant pt-4" aria-labelledby="bachelor-project-heading">
      <div className="flex flex-wrap items-center gap-2">
        <GraduationCap className="h-4 w-4 text-on-surface-variant" aria-hidden />
        <h3
          id="bachelor-project-heading"
          className="text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant"
        >
          Bachelor project
        </h3>
        {saved && <Badge tone="indigo">Taken in {saved}</Badge>}
      </div>

      {error && (
        <div className="mt-3">
          <AlertBanner tone="error" title="Could not save the bachelor project" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {!project.eligible && !saved ? (
        <p className="mt-2 text-body text-on-surface-variant">{project.explanation}</p>
      ) : (
        <>
          <p className="mt-2 text-body text-on-surface-variant">
            With the project the student can take up to {limits.maxCourses} other courses: at most {limits.maxCore} core
            and {limits.maxHumanities} humanities (German, Seminar, Introduction to Management, Project Management).
            Humanities hours count as extra hours and need an approved extra-hours request.
          </p>

          {canEdit ? (
            // This project's `sm` breakpoint is 360px, so three controls would be crammed into
            // one row on a phone. They stack until `md` (768px) and wrap after that.
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
              <Select
                label="Season"
                className="min-w-[12rem]"
                value={season}
                onChange={(event) => setSeason(event.target.value as BachelorProjectSeason | '')}
                placeholder="Select Winter or Spring"
                options={SEASON_OPTIONS}
              />
              <CustomButton
                variant="secondary"
                onClick={save}
                isLoading={isSaving && !isConfirmingRemoval}
                disabled={!season || season === saved}
                icon={<GraduationCap className="h-4 w-4" aria-hidden />}
              >
                {saved ? 'Change season' : 'Add bachelor project'}
              </CustomButton>
              {saved && (
                <CustomButton
                  variant="danger-ghost"
                  onClick={() => setIsConfirmingRemoval(true)}
                  icon={<Trash2 className="h-4 w-4" aria-hidden />}
                >
                  Remove project
                </CustomButton>
              )}
            </div>
          ) : (
            !saved && (
              <p className="mt-2 text-caption text-on-surface-variant">
                The project can only be added while the schedule is an open draft.
              </p>
            )
          )}
        </>
      )}

      <ConfirmDialog
        open={isConfirmingRemoval}
        title="Remove the bachelor project?"
        message={`The draft will no longer include the bachelor project${
          saved ? ` for ${saved}` : ''
        }. The courses already in the draft are kept, and the four-course limit stops applying.`}
        confirmLabel="Remove project"
        isLoading={isSaving}
        onCancel={() => setIsConfirmingRemoval(false)}
        onConfirm={() => void confirmRemoval()}
      />
    </section>
  );
};

export default BachelorProjectPanel;
