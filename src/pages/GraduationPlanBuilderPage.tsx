import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  GraduationCap,
  Loader2,
  Save,
  Send,
  Trash2,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import { ApiError } from '../lib/api';
import { useSession } from '../hooks/useSession';
import {
  decideGraduationPlan,
  deleteGraduationPlan,
  fetchGraduationPlan,
  saveGraduationPlan,
  submitGraduationPlan,
} from '../lib/graduationPlansService';
import { formatDate, formatRelative } from '../lib/studentsService';
import type { GraduationPlanDetail, GraduationPlanPlacement } from '../lib/types';

const STATUS_TONE: Record<string, BadgeTone> = {
  Draft: 'amber',
  Submitted: 'sky',
  Accepted: 'emerald',
};

/** Term index as a select value; '' is "unassigned". */
type AssignmentMap = Record<string, string>;

const assignmentsFrom = (plan: GraduationPlanDetail): AssignmentMap =>
  Object.fromEntries(plan.placements.map((placement) => [placement.courseId, String(placement.termIndex)]));

const placementsFrom = (assignments: AssignmentMap): GraduationPlanPlacement[] =>
  Object.entries(assignments)
    .filter(([, termIndex]) => termIndex !== '')
    .map(([courseId, termIndex]) => ({ courseId, termIndex: Number(termIndex) }));

/**
 * Req 103-107: build, save, submit and delete one graduation plan.
 *
 * Drafts may be unfinished (req 106) and are private to this Advisor. The
 * server re-checks every rule, so the page shows its messages rather than
 * pretending to be the authority; submitting (req 107) makes the plan
 * read-only until the Coordinator decides.
 */
const GraduationPlanBuilderPage: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { user } = useSession();

  const [plan, setPlan] = useState<GraduationPlanDetail | null>(null);
  const [assignments, setAssignments] = useState<AssignmentMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ruleErrors, setRuleErrors] = useState<string[]>([]);
  const [failedAction, setFailedAction] = useState<'save' | 'submit' | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [isDeciding, setIsDeciding] = useState(false);
  /**
   * The page is long, so the outcome of Save/Submit is also shown in the
   * sticky action bar at the bottom — where the buttons are — and scrolled
   * into view. Otherwise an error at the top is easy to miss.
   */
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!error && !success) return;
    feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error, success]);

  const clearFeedback = () => {
    setError(null);
    setRuleErrors([]);
    setFailedAction(null);
  };

  const applyPlan = useCallback((next: GraduationPlanDetail) => {
    setPlan(next);
    setAssignments(assignmentsFrom(next));
  }, []);

  const load = useCallback(async () => {
    if (!planId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchGraduationPlan(planId);
      applyPlan(response.plan);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsLoading(false);
    }
  }, [applyPlan, planId]);

  useEffect(() => {
    load();
  }, [load]);

  const isDraft = plan?.status === 'Draft';
  const isCoordinator = user?.role === 'Coordinator';

  const hoursByTerm = useMemo(() => {
    if (!plan) return [];
    return plan.terms.map((_, index) =>
      plan.remaining.reduce(
        (total, course) =>
          assignments[course.id] === String(index) ? total + course.creditHours : total,
        0
      )
    );
  }, [assignments, plan]);

  const handleApiError = (err: unknown, action: 'save' | 'submit') => {
    const apiError = err as ApiError;
    const data = apiError.data as { errors?: string[] } | undefined;
    setRuleErrors(data?.errors ?? []);
    setFailedAction(action);
    setError(apiError.message);
  };

  const save = async (): Promise<GraduationPlanDetail | null> => {
    if (!planId) return null;
    setError(null);
    setRuleErrors([]);
    setFailedAction(null);
    setSuccess(null);
    try {
      const response = await saveGraduationPlan(planId, placementsFrom(assignments));
      applyPlan(response.plan);
      setSuccess('Draft saved.');
      return response.plan;
    } catch (err) {
      handleApiError(err, 'save');
      return null;
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    await save();
    setIsSaving(false);
  };

  const handleSubmit = async () => {
    if (!planId) return;
    setIsSubmitting(true);
    setError(null);
    setRuleErrors([]);
    setFailedAction(null);
    setSuccess(null);
    try {
      // Submit validates what is stored, so persist the current placements first.
      await saveGraduationPlan(planId, placementsFrom(assignments));
      const response = await submitGraduationPlan(planId);
      applyPlan(response.plan);
      setSuccess(response.message);
    } catch (err) {
      handleApiError(err, 'submit');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!planId) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteGraduationPlan(planId);
      navigate('/graduation-plans', { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
      setIsDeleting(false);
    }
  };

  const handleDecision = async (decision: 'accept' | 'reject') => {
    if (!planId) return;
    setIsDeciding(true);
    setDecisionError(null);
    try {
      const response = await decideGraduationPlan(planId, decision, decisionNote);
      navigate('/graduation-plans', {
        replace: true,
        state: { notice: response.message },
      });
    } catch (err) {
      setDecisionError((err as ApiError).message);
    } finally {
      setIsDeciding(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading graduation plan...
      </Card>
    );
  }

  if (!plan) {
    return (
      <>
        <AlertBanner tone="error" title="Graduation plan">
          {error ?? 'This graduation plan could not be opened.'}
        </AlertBanner>
        <CustomButton
          variant="secondary"
          className="mt-4"
          icon={<ArrowLeft className="h-4 w-4" aria-hidden />}
          onClick={() => navigate('/graduation-plans')}
        >
          Back to plans
        </CustomButton>
      </>
    );
  }

  const assignedCount = plan.remaining.filter(
    (course) => assignments[course.id] !== undefined && assignments[course.id] !== ''
  ).length;
  const unassignedCount = plan.remaining.length - assignedCount;

  return (
    <>
      <PageHeader
        title={plan.student.fullName}
        description={`${plan.student.studentId} · ${plan.student.major} · Semester ${plan.student.currentSemester}`}
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[plan.status] ?? 'neutral'} dot>
              {plan.status}
            </Badge>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CustomButton
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="h-4 w-4" aria-hidden />}
          onClick={() => navigate('/graduation-plans')}
        >
          All plans
        </CustomButton>
        <p className="text-xs text-slate-500">
          Updated {formatRelative(plan.updatedAt)}
          {plan.submittedAt ? ` · Submitted ${formatDate(plan.submittedAt)}` : ''}
        </p>
      </div>

      {!isDraft && (
        <div className="mb-4">
          <AlertBanner
            tone="neutral"
            title={plan.status === 'Submitted' ? 'Submitted for review' : 'Read-only plan'}
          >
            {plan.status === 'Submitted'
              ? "This plan cannot be changed while it awaits the Coordinator's decision."
              : 'This accepted plan cannot be changed.'}
          </AlertBanner>
        </div>
      )}

      {plan.advisor && (
        <Card tone="raised" className="mb-4 p-4">
          <p className="text-sm text-slate-300">
            Prepared by <span className="font-medium text-slate-100">{plan.advisor.fullName}</span>
            <span className="ml-2 text-slate-500">{plan.advisor.email}</span>
          </p>
        </Card>
      )}

      {plan.responseNote && (
        <Card tone="raised" className="mb-4 border border-indigo-800/50 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Coordinator's response</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{plan.responseNote}</p>
          {plan.decidedAt && (
            <p className="mt-2 text-xs text-slate-500">Recorded {formatDate(plan.decidedAt)}</p>
          )}
        </Card>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {plan.terms.map((term, index) => {
          const hours = hoursByTerm[index] ?? 0;
          const over = hours > plan.validation.creditLimit;
          return (
            <Card key={term.label} tone="raised" className="p-4">
              <div className="flex items-center gap-2 text-slate-400">
                <CalendarRange className="h-4 w-4" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-wide">{term.label}</span>
              </div>
              <p className={`mt-2 text-2xl font-bold ${over ? 'text-rose-300' : 'text-white'}`}>
                {hours} <span className="text-sm font-medium text-slate-500">/ {plan.validation.creditLimit} hrs</span>
              </p>
              {over && (
                <p className="mt-1 flex items-center gap-1 text-xs text-rose-300">
                  <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                  Over the credit-hour limit
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <Card tone="raised" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-white">Remaining courses</h2>
            <p className="text-xs text-slate-500">
              {assignedCount} of {plan.remaining.length} assigned · {plan.validation.creditLimit}-hour limit per term
            </p>
          </div>
          <Badge tone={assignedCount === plan.remaining.length ? 'emerald' : 'amber'}>
            {assignedCount === plan.remaining.length ? 'All assigned' : 'Incomplete'}
          </Badge>
        </div>

        {plan.remaining.length === 0 ? (
          <p className="flex items-center justify-center gap-2 p-12 text-sm text-slate-400">
            <GraduationCap className="h-4 w-4" aria-hidden />
            No remaining courses — this student's graduation requirements are complete.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Credits</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Offered in</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Prerequisites</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Term</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {plan.remaining.map((course) => {
                  const offered = plan.terms
                    .map((term, index) => ({ term, index }))
                    .filter(({ term }) => course.offeringSeasons.includes(term.season));
                  const value = assignments[course.id] ?? '';

                  return (
                    <tr key={course.id} className="transition-colors hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-indigo-300">{course.code}</p>
                        <p className="text-slate-200">{course.name}</p>
                        {course.isRetake && (
                          <Badge tone="rose" className="mt-1">
                            Retake
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">{course.creditHours}</td>
                      <td className="px-4 py-3 text-slate-400">{course.offeringSeasons.join(', ')}</td>
                      <td className="px-4 py-3">
                        {course.prerequisites.length === 0 ? (
                          <span className="text-slate-500">None</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {course.prerequisites.map((prerequisite) => (
                              <span key={prerequisite.id} title={prerequisite.passed ? 'Already passed' : 'Still owed'}>
                                <Badge tone={prerequisite.passed ? 'emerald' : 'amber'}>
                                  {prerequisite.code}
                                </Badge>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isDraft ? (
                          <select
                            aria-label={`Term for ${course.code}`}
                            value={value}
                            onChange={(event) =>
                              setAssignments((current) => ({ ...current, [course.id]: event.target.value }))
                            }
                            className={`w-full min-w-[11rem] rounded-lg border bg-slate-900/70 px-2.5 py-2 text-sm transition-colors focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 ${
                              value === ''
                                ? 'border-amber-700/60 text-amber-200'
                                : 'border-slate-700 text-slate-200 hover:border-slate-600'
                            }`}
                          >
                            <option value="">Unassigned</option>
                            {offered.map(({ term, index }) => (
                              <option key={term.label} value={index}>
                                {term.label}
                              </option>
                            ))}
                          </select>
                        ) : value === '' ? (
                          <span className="text-slate-500">Unassigned</span>
                        ) : (
                          <span className="text-slate-200">{plan.terms[Number(value)]?.label ?? 'Unassigned'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isCoordinator && plan.status === 'Submitted' && (
        <Card tone="raised" className="mt-5 p-4">
          <h2 className="text-sm font-bold text-white">Coordinator decision</h2>
          <p className="mt-1 text-sm text-slate-400">
            Acceptance confirms the remaining graduation requirements can be completed within one year.
            Rejection returns this plan to the Advisor as a private draft.
          </p>
          <label
            htmlFor="graduation-plan-response"
            className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400"
          >
            Response note (required)
          </label>
          <textarea
            id="graduation-plan-response"
            value={decisionNote}
            onChange={(event) => setDecisionNote(event.target.value)}
            maxLength={1000}
            rows={4}
            className="mt-1.5 w-full resize-y rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            placeholder="Explain the decision to the Advisor."
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500">{decisionNote.length}/1000 characters</span>
            {decisionError && (
              <span role="alert" className="text-xs text-rose-300">
                {decisionError}
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <CustomButton
              variant="danger"
              icon={<XCircle className="h-4 w-4" aria-hidden />}
              isLoading={isDeciding}
              disabled={!decisionNote.trim()}
              onClick={() => handleDecision('reject')}
            >
              Reject and return to Advisor
            </CustomButton>
            <CustomButton
              icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
              isLoading={isDeciding}
              disabled={!decisionNote.trim()}
              onClick={() => handleDecision('accept')}
            >
              Accept plan
            </CustomButton>
          </div>
        </Card>
      )}

      {isDraft || error || success ? (
        <div
          ref={feedbackRef}
          className="sticky bottom-0 z-20 mt-5 max-h-[55vh] space-y-3 overflow-y-auto border-t border-slate-800/80 bg-slate-950/95 pb-1 pt-3 backdrop-blur"
        >
          {error && (
            <AlertBanner
              tone="error"
              title={
                failedAction === 'submit'
                  ? 'Plan not submitted — fix the issues below'
                  : failedAction === 'save'
                    ? 'Draft not saved — fix the issues below'
                    : 'Something went wrong'
              }
              onDismiss={clearFeedback}
            >
              <p>{error}</p>
              {ruleErrors.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {ruleErrors.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              )}
            </AlertBanner>
          )}

          {success && (
            <AlertBanner tone="success" title="Plan updated" onDismiss={() => setSuccess(null)}>
              {success}
            </AlertBanner>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              aria-live="polite"
              className={`flex items-center gap-1.5 text-xs font-semibold ${
                error ? 'text-rose-300' : unassignedCount === 0 ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {error ? (
                <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
              ) : unassignedCount === 0 ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
              )}
              {error
                ? `${failedAction === 'submit' ? 'NOT SUBMITTED' : 'NOT SAVED'} · ${Math.max(
                    ruleErrors.length,
                    1
                  )} ${Math.max(ruleErrors.length, 1) === 1 ? 'issue' : 'issues'}`
                : unassignedCount === 0
                  ? 'All courses assigned'
                  : `${unassignedCount} course${unassignedCount === 1 ? '' : 's'} still unassigned`}
            </p>

            {isDraft && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <CustomButton
                  variant="ghost"
                  icon={<Trash2 className="h-4 w-4" aria-hidden />}
                  onClick={() => setShowDelete(true)}
                  disabled={isSaving || isSubmitting}
                >
                  Delete draft
                </CustomButton>
                <CustomButton
                  variant="secondary"
                  icon={<Save className="h-4 w-4" aria-hidden />}
                  isLoading={isSaving}
                  disabled={isSubmitting}
                  onClick={handleSave}
                >
                  Save draft
                </CustomButton>
                <CustomButton
                  icon={<Send className="h-4 w-4" aria-hidden />}
                  isLoading={isSubmitting}
                  disabled={isSaving}
                  onClick={handleSubmit}
                >
                  Submit plan
                </CustomButton>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDelete(false)} aria-hidden />
          <Card tone="raised" className="relative w-full max-w-md p-6">
            <h2 className="text-base font-bold text-white">Delete this draft?</h2>
            <p className="mt-2 text-sm text-slate-400">
              The plan and every placement on it will be removed. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <CustomButton variant="secondary" disabled={isDeleting} onClick={() => setShowDelete(false)}>
                Cancel
              </CustomButton>
              <CustomButton variant="danger" isLoading={isDeleting} onClick={handleDelete}>
                Delete draft
              </CustomButton>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

export default GraduationPlanBuilderPage;
