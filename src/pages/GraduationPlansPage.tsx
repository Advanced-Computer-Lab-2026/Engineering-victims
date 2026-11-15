import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  GraduationCap,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import { ApiError } from '../lib/api';
import { fetchAdvisingStudents } from '../lib/advisingStudentsService';
import {
  createGraduationPlan,
  deleteGraduationPlan,
  fetchGraduationPlans,
} from '../lib/graduationPlansService';
import { formatRelative } from '../lib/studentsService';
import { EMPTY_ADVISING_FILTERS, type AdvisingStudentRow, type GraduationPlanSummary } from '../lib/types';

const STATUS_TONE: Record<string, BadgeTone> = {
  Draft: 'amber',
  Submitted: 'sky',
  Accepted: 'emerald',
};

/**
 * Req 103-107: the Advisor's graduation plans.
 *
 * Only this Advisor's plans are listed — the API scopes the query, so private
 * drafts (req 106) never appear for anyone else. A draft can be opened,
 * updated, deleted (req 104-105) or submitted (req 107); a submitted plan is
 * read-only while the Coordinator reviews it.
 */
const GraduationPlansPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState<GraduationPlanSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GraduationPlanSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(!!deleteTarget);

  // Escape closes the delete confirmation; the picker handles its own.
  useEffect(() => {
    if (!deleteTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) setDeleteTarget(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [deleteTarget, isDeleting]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchGraduationPlans();
      setPlans(response.plans);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Req 103: arriving from an advising student's details creates (or reopens)
   * that student's draft and opens the builder, so the Advisor does not have to
   * find the student twice.
   */
  const startStudentId = searchParams.get('studentId');
  const hasStarted = useRef(false);
  useEffect(() => {
    if (!startStudentId || hasStarted.current) return;
    hasStarted.current = true;
    createGraduationPlan(startStudentId)
      .then((response) => navigate(`/graduation-plans/${response.plan.id}`, { replace: true }))
      .catch((err: ApiError) => setError(err.message));
  }, [navigate, startStudentId]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteGraduationPlan(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Graduation Plans"
        description="Plan an advising student's remaining courses across the next Winter, Spring and Summer terms."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <CustomButton icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setIsPickerOpen(true)}>
            New plan
          </CustomButton>
        }
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Graduation plans" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading graduation plans...
        </Card>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-5 w-5" aria-hidden />}
          title="No graduation plans yet"
          description="Start a plan for an advising student and assign every remaining course to a term."
        />
      ) : (
        <Card tone="raised" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body">
              <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Terms</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Courses</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Updated</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {plans.map((plan) => (
                  <tr key={plan.id} className="transition-colors hover:bg-surface-container">
                    <td className="px-4 py-3">
                      {plan.student ? (
                        <>
                          <p className="font-medium text-on-surface">{plan.student.fullName}</p>
                          <p className="font-mono text-caption text-on-surface-variant">
                            {plan.student.studentId} · {plan.student.major}
                          </p>
                        </>
                      ) : (
                        <span className="text-on-surface-variant">Student not found</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {plan.terms.map((term) => (
                          <Badge key={term.label} tone="neutral">
                            {term.label}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-on-surface">{plan.assignedCount}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[plan.status] ?? 'neutral'} dot>
                        {plan.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{formatRelative(plan.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <CustomButton
                          variant="ghost"
                          size="sm"
                          icon={<ArrowRight className="h-4 w-4" aria-hidden />}
                          onClick={() => navigate(`/graduation-plans/${plan.id}`)}
                        >
                          Open
                        </CustomButton>
                        {plan.status === 'Draft' && (
                          <CustomButton
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 className="h-4 w-4" aria-hidden />}
                            onClick={() => setDeleteTarget(plan)}
                          >
                            Delete
                          </CustomButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isPickerOpen && (
        <StudentPickerDialog
          onClose={() => setIsPickerOpen(false)}
          onPicked={(planId) => navigate(`/graduation-plans/${planId}`)}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-toast flex items-center justify-center p-4">
          <div className="absolute inset-0 scrim backdrop-blur-sm" onClick={() => setDeleteTarget(null)} aria-hidden />
          <Card
            ref={trapRef}
            tone="raised"
            role="dialog"
            aria-modal="true"
            aria-label="Delete graduation draft"
            className="relative w-full max-w-md p-6"
          >
            <h2 className="text-body-lg font-bold text-on-surface">Delete this draft?</h2>
            <p className="mt-2 text-body text-on-surface-variant">
              The plan for {deleteTarget.student?.fullName ?? 'this student'} and every placement on it will be
              removed. Submitted plans cannot be deleted.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <CustomButton variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
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

interface StudentPickerProps {
  onClose: () => void;
  onPicked: (planId: string) => void;
}

/** Req 103: pick the Advising Student the new plan belongs to. */
const StudentPickerDialog: React.FC<StudentPickerProps> = ({ onClose, onPicked }) => {
  const [searchInput, setSearchInput] = useState('');
  const [students, setStudents] = useState<AdvisingStudentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  // Escape closes the picker unless a plan is being created.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creatingId) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [creatingId, onClose]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      setError(null);

      fetchAdvisingStudents({ ...EMPTY_ADVISING_FILTERS, search: searchInput.trim() })
        .then((response) => {
          if (!cancelled) setStudents(response.students);
        })
        .catch((err: ApiError) => {
          if (!cancelled) setError(err.message);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchInput]);

  const choose = async (student: AdvisingStudentRow) => {
    setCreatingId(student.id);
    setError(null);
    try {
      const response = await createGraduationPlan(student.id);
      onPicked(response.plan.id);
    } catch (err) {
      setError((err as ApiError).message);
      setCreatingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-toast flex items-center justify-center p-4">
      <div className="absolute inset-0 scrim backdrop-blur-sm" onClick={onClose} aria-hidden />
      <Card ref={trapRef} tone="raised" role="dialog" aria-modal="true" aria-label="Start a graduation plan" className="relative flex max-h-[85vh] w-full max-w-2xl flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-body-lg font-bold text-on-surface">Start a graduation plan</h2>
            <p className="mt-1 text-body text-on-surface-variant">
              Choose an advising student. An open draft for that student is reopened instead of duplicated.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" aria-hidden />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name, student ID or email"
            aria-label="Search advising students"
            className="w-full rounded-lg border border-outline-variant bg-surface-container-low py-2.5 pl-9 pr-3 text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && (
          <div className="mt-3">
            <AlertBanner tone="error" title="Could not load students">{error}</AlertBanner>
          </div>
        )}

        <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-outline-variant">
          {isLoading ? (
            <div role="status" className="flex items-center justify-center gap-2 p-10 text-body text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading advising students...
            </div>
          ) : students.length === 0 ? (
            <p className="p-10 text-center text-body text-on-surface-variant">No advising student matches that search.</p>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {students.map((student) => (
                <li key={student.id}>
                  <button
                    type="button"
                    disabled={creatingId !== null}
                    onClick={() => choose(student)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-container disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium text-on-surface">{student.fullName}</span>
                      <span className="block font-mono text-caption text-on-surface-variant">
                        {student.studentId} · {student.major} · Semester {student.currentSemester}
                      </span>
                    </span>
                    {creatingId === student.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                    ) : (
                      <ArrowRight className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
};

export default GraduationPlansPage;
