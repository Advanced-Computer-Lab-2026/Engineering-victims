import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, ExternalLink, Loader2, RotateCcw, ScrollText } from 'lucide-react';
import { ApiError } from '../lib/api';
import {
  getStudentScheduleHistory,
  processAdvisingStudentSchedule,
  reopenAdvisingStudentSchedule,
  type ScheduleActivityEntry,
} from '../lib/scheduleActivityService';
import type { Role } from '../lib/types';
import AlertBanner from './ui/AlertBanner';
import Badge from './ui/Badge';
import CustomButton from './ui/CustomButton';
import CustomInput from './ui/CustomInput';

interface StudentScheduleHistorySectionProps {
  studentObjectId: string;
  workflowStatus?: string;
  role?: Role | null;
  onWorkflowChanged?: () => void;
}

/**
 * Req 123: Embedded inside a selected student's advising details drawer to
 * display that student's automatically recorded history of schedule processing
 * and reopening actions (student ID, action, schedule version, staff member's
 * full name, GUC email and role, date and time, and reopening reason when
 * applicable).
 */
const StudentScheduleHistorySection: React.FC<StudentScheduleHistorySectionProps> = ({
  studentObjectId,
  workflowStatus,
  role,
  onWorkflowChanged,
}) => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ScheduleActivityEntry[]>([]);
  const [currentStatus, setCurrentStatus] = useState<string | undefined>(workflowStatus);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [showReopenInput, setShowReopenInput] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setCurrentStatus(workflowStatus);
  }, [workflowStatus]);

  const loadHistory = useCallback(async () => {
    if (!studentObjectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getStudentScheduleHistory(studentObjectId);
      setLogs(res.logs ?? []);
      if (res.student?.workflowStatus) {
        setCurrentStatus(res.student.workflowStatus);
      }
    } catch (err) {
      setError((err as ApiError).message || 'Could not load schedule activity history.');
    } finally {
      setIsLoading(false);
    }
  }, [studentObjectId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const canMutateSchedule = role === 'Coordinator' || role === 'Advisor';
  const canOpenGlobalHistory = role === 'Coordinator' || role === 'Administrator';

  const handleProcess = async () => {
    setIsActing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await processAdvisingStudentSchedule(studentObjectId);
      setNotice(res.message);
      setCurrentStatus(res.workflowStatus);
      await loadHistory();
      onWorkflowChanged?.();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsActing(false);
    }
  };

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) {
      setError('A reopening reason is required.');
      return;
    }
    setIsActing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await reopenAdvisingStudentSchedule(studentObjectId, reopenReason.trim());
      setNotice(res.message);
      setReopenReason('');
      setShowReopenInput(false);
      setCurrentStatus(res.workflowStatus);
      await loadHistory();
      onWorkflowChanged?.();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsActing(false);
    }
  };

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
          <ScrollText className="h-3.5 w-3.5 text-primary" aria-hidden />
          Schedule Processing & Reopening History
        </h3>
        {canOpenGlobalHistory && (
          <button
            type="button"
            onClick={() => navigate('/schedule-history')}
            className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:text-primary"
          >
            Global history
            <ExternalLink className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>

      {error && (
        <AlertBanner tone="error" onDismiss={() => setError(null)}>
          {error}
        </AlertBanner>
      )}

      {notice && (
        <AlertBanner tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </AlertBanner>
      )}

      {/* Allow Advisor / Coordinator to process or reopen directly and record history */}
      {canMutateSchedule && (
        <div className="space-y-2 pt-1">
          {currentStatus === 'Processed' ? (
            !showReopenInput ? (
              <CustomButton
                variant="secondary"
                size="sm"
                onClick={() => setShowReopenInput(true)}
                icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
              >
                Reopen Processed Schedule
              </CustomButton>
            ) : (
              <form onSubmit={handleReopen} className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                <CustomInput
                  label="Reopening reason (required)"
                  placeholder="Explain why this schedule is being reopened..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <CustomButton type="submit" variant="primary" size="sm" isLoading={isActing}>
                    Confirm Reopen
                  </CustomButton>
                  <CustomButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowReopenInput(false);
                      setReopenReason('');
                    }}
                  >
                    Cancel
                  </CustomButton>
                </div>
              </form>
            )
          ) : currentStatus === 'Ready to Process' ? (
            <CustomButton
              variant="primary"
              size="sm"
              isLoading={isActing}
              onClick={handleProcess}
              icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
            >
              Process Schedule Now
            </CustomButton>
          ) : null}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-caption text-on-surface-variant">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading schedule activity history...
        </div>
      ) : logs.length === 0 ? (
        <p className="text-caption text-on-surface-variant">
          No schedule processing or reopening actions have been recorded for this student yet.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {logs.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-caption space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={entry.action === 'Processed' ? 'emerald' : 'amber'} dot>
                    {entry.action}
                  </Badge>
                  <span className="font-mono font-semibold text-on-surface">
                    v{entry.scheduleVersion}
                  </span>
                  <span className="font-mono text-on-surface-variant">({entry.studentId})</span>
                </div>
                <span className="flex items-center gap-1 text-on-surface-variant">
                  <Clock className="h-3 w-3" aria-hidden />
                  {new Date(entry.occurredAt).toLocaleString()}
                </span>
              </div>

              <div className="text-on-surface">
                <span className="font-medium text-on-surface">{entry.staffName}</span>{' '}
                <span className="text-on-surface-variant">({entry.staffEmail})</span> ·{' '}
                <Badge tone="neutral" className="text-caption">
                  {entry.staffRole}
                </Badge>
              </div>

              {entry.reason && (
                <div className="rounded-lg border border-warning bg-warning-container px-2.5 py-1.5 text-warning">
                  <span className="font-semibold">Reopening reason:</span> {entry.reason}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default StudentScheduleHistorySection;
