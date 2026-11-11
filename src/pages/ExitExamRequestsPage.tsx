import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import { ApiError } from '../lib/api';
import {
  decideExitExamRequest,
  EXIT_EXAM_NOTE_LIMIT,
  fetchPendingExitExamRequests,
} from '../lib/exitExamRequestsService';
import { formatDate } from '../lib/studentsService';
import type { ExitExamRequestSummary } from '../lib/types';

const ExitExamRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState<ExitExamRequestSummary[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchPendingExitExamRequests();
      setRequests(response.requests);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (request: ExitExamRequestSummary, decision: 'approve' | 'reject') => {
    const note = notes[request.id] ?? '';
    setBusyRequestId(request.id);
    setError(null);
    setNotice(null);
    try {
      const response = await decideExitExamRequest(request.id, decision, note);
      setRequests((current) => current.filter((entry) => entry.id !== request.id));
      setNotice(response.message);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusyRequestId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Exit-exam requests"
        description="Review requests for a single remaining failed course and provide a response note."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Exit-exam requests" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <AlertBanner tone="success" title="Decision recorded" onDismiss={() => setNotice(null)}>
            {notice}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading exit-exam requests...
        </Card>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
          title="No pending exit-exam requests"
          description="New requests from Advisors will appear here."
        />
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id} tone="raised" className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-white">
                    {request.course?.code ?? 'Failed course'} — {request.course?.name ?? 'Course details unavailable'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {request.student?.fullName ?? 'Student unavailable'} · {request.student?.studentId ?? '—'} ·{' '}
                    {request.student?.major ?? '—'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Advisor: {request.advisor?.fullName ?? '—'} · Submitted {formatDate(request.submittedAt)}
                  </p>
                </div>
                <Badge tone="amber" dot>Pending review</Badge>
              </div>

              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Advisor's explanation
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{request.reason}</p>
              </div>

              <label
                htmlFor={`exit-exam-note-${request.id}`}
                className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400"
              >
                Response note (required)
              </label>
              <textarea
                id={`exit-exam-note-${request.id}`}
                value={notes[request.id] ?? ''}
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                }
                maxLength={EXIT_EXAM_NOTE_LIMIT}
                rows={3}
                className="mt-1.5 w-full resize-y rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                placeholder="Explain why the request is approved or rejected."
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  {(notes[request.id] ?? '').length}/{EXIT_EXAM_NOTE_LIMIT} characters
                </span>
                <div className="flex flex-wrap justify-end gap-2">
                  <CustomButton
                    variant="danger"
                    icon={<XCircle className="h-4 w-4" aria-hidden />}
                    isLoading={busyRequestId === request.id}
                    disabled={Boolean(busyRequestId) || !(notes[request.id] ?? '').trim()}
                    onClick={() => decide(request, 'reject')}
                  >
                    Reject request
                  </CustomButton>
                  <CustomButton
                    icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
                    isLoading={busyRequestId === request.id}
                    disabled={Boolean(busyRequestId) || !(notes[request.id] ?? '').trim()}
                    onClick={() => decide(request, 'approve')}
                  >
                    Approve exit exam
                  </CustomButton>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
};

export default ExitExamRequestsPage;
