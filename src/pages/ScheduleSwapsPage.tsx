import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  MapPin,
  RotateCcw,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import {
  completeSwapRequest,
  getEligibleOpenSwaps,
  getMySwapRequests,
  submitSwapRequest,
  withdrawSwapRequest,
  type EligibleOpenSwapRequest,
  type MySwapRequest,
  type SwapRequestStatus,
  type SwapSlotSnapshot,
} from '../lib/swapsService';
import type { EligibleSwapGroupsResponse } from '../lib/types';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';

const STATUS_TONE: Record<SwapRequestStatus, BadgeTone> = {
  Open: 'indigo',
  Completed: 'emerald',
  Withdrawn: 'neutral',
  Expired: 'amber',
};

const SLOT_TONE: Record<SwapSlotSnapshot['slotType'], BadgeTone> = {
  Lecture: 'indigo',
  Tutorial: 'sky',
  Lab: 'emerald',
};

/**
 * Req 35–39: Whole-Schedule Swaps for Normal Students.
 *
 * - Req 35: Auto-populates current group & complete current schedule (read-only)
 *           and submits a swap request for one or more eligible desired groups
 *           before the deadline (at most one active Open request).
 * - Req 36: Lists open swap requests the student is eligible to complete
 *           (anonymized: shows requester's group, complete schedule, and desired
 *           groups without revealing the requester's identity).
 * - Req 37: Completes an eligible open swap request atomically.
 * - Req 38: Lists the student's own submitted or completed swap requests with
 *           group details and statuses (Open, Completed, Withdrawn, Expired).
 * - Req 39: Withdraws the student's own Open swap request.
 */
const ScheduleSwapsPage: React.FC = () => {
  const navigate = useNavigate();
  const [eligibleGroupsData, setEligibleGroupsData] = useState<EligibleSwapGroupsResponse | null>(null);
  const [mySchedule, setMySchedule] = useState<SwapSlotSnapshot[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [openRequests, setOpenRequests] = useState<EligibleOpenSwapRequest[]>([]);
  const [myRequests, setMyRequests] = useState<MySwapRequest[]>([]);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [swapDeadline, setSwapDeadline] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const [showCurrentSchedule, setShowCurrentSchedule] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const [groupsRes, openRes, mineRes] = await Promise.all([
        apiFetch<EligibleSwapGroupsResponse>('/api/students/eligible-swap-groups'),
        getEligibleOpenSwaps(),
        getMySwapRequests(),
      ]);

      setEligibleGroupsData(groupsRes);
      setMySchedule(openRes.mySchedule ?? []);
      setOpenRequests(openRes.requests ?? []);
      setDeadlinePassed(Boolean(openRes.deadlinePassed));
      setSwapDeadline(openRes.term?.swapDeadline ?? null);
      setMyRequests(mineRes.requests ?? []);
    } catch (err) {
      setError((err as ApiError).message || 'Could not load whole-schedule swap information.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const toggleDesiredGroup = (group: string) => {
    setSelectedGroups((current) =>
      current.includes(group) ? current.filter((g) => g !== group) : [...current, group]
    );
  };

  const handleSubmitSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGroups.length === 0) {
      setError('Select at least one desired group number before submitting.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const res = await submitSwapRequest(selectedGroups);
      setNotice(res.message);
      setSelectedGroups([]);
      await loadAll(true);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteSwap = async (requestId: string) => {
    setActingRequestId(requestId);
    setError(null);
    setNotice(null);

    try {
      const res = await completeSwapRequest(requestId);
      setNotice(res.message);
      await loadAll(true);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setActingRequestId(null);
    }
  };

  const handleWithdrawSwap = async (requestId: string) => {
    setActingRequestId(requestId);
    setError(null);
    setNotice(null);

    try {
      const res = await withdrawSwapRequest(requestId);
      setNotice(res.message);
      await loadAll(true);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setActingRequestId(null);
    }
  };

  const activeOpenRequest = myRequests.find(
    (reqItem) => reqItem.roleInSwap === 'Requester' && reqItem.status === 'Open'
  );

  return (
    <>
      <PageHeader
        title="Whole-Schedule Swaps"
        description="Submit a whole-schedule swap request, complete an eligible anonymous peer swap, or manage your swap requests."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <div className="flex items-center gap-2">
            <CustomButton
              variant="secondary"
              size="sm"
              onClick={() => navigate('/eligible-swap-groups')}
              icon={<Eye className="h-4 w-4" aria-hidden />}
            >
              Compare Group Schedules
            </CustomButton>
            <CustomButton
              variant="secondary"
              size="sm"
              onClick={() => loadAll(true)}
              isLoading={isRefreshing}
              icon={<RotateCcw className="h-4 w-4" aria-hidden />}
            >
              Refresh
            </CustomButton>
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Action could not be completed" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {notice && (
        <div className="mb-4">
          <AlertBanner tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading whole-schedule swap workspace...
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Req 35: Auto-populated Current Group & Read-Only Current Schedule + Swap Submission */}
          <Card tone="raised" className="p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                  <ArrowRightLeft className="h-5 w-5 text-indigo-400" aria-hidden />
                  Submit a Whole-Schedule Swap Request
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Your current group number and processed schedule are auto-populated from your record and cannot be edited.
                </p>
              </div>
              {swapDeadline && (
                <Badge tone={deadlinePassed ? 'rose' : 'indigo'} icon={<Calendar className="h-3.5 w-3.5" />}>
                  Swap Deadline: {new Date(swapDeadline).toISOString().slice(0, 10)}
                </Badge>
              )}
            </div>

            {eligibleGroupsData && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Badge tone="indigo" icon={<Users className="h-3.5 w-3.5" />}>
                      Current Group: {eligibleGroupsData.myGroup}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {eligibleGroupsData.myCourses.length} registered courses · {mySchedule.length} scheduled slots (read-only)
                    </span>
                  </div>
                  <CustomButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCurrentSchedule((v) => !v)}
                    icon={<Eye className="h-4 w-4" aria-hidden />}
                  >
                    {showCurrentSchedule ? 'Hide My Current Schedule' : 'View My Current Schedule'}
                  </CustomButton>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {eligibleGroupsData.myCourses.map((code) => (
                    <Badge key={code} tone="sky" className="text-[11px]">
                      {code}
                    </Badge>
                  ))}
                </div>

                {showCurrentSchedule && mySchedule.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-3 border-t border-slate-800/80">
                    {mySchedule.map((slot, idx) => (
                      <div
                        key={`${slot.slotId}-${idx}`}
                        className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-white">{slot.courseCode}</span>
                          <Badge tone={SLOT_TONE[slot.slotType]}>
                            {slot.slotType} · G{slot.groupNumber}
                          </Badge>
                        </div>
                        <p className="truncate text-slate-300">{slot.courseName}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                          <span>
                            {slot.dayOfWeek} {slot.startTime}–{slot.endTime}
                          </span>
                          <span>Room {slot.roomId}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {deadlinePassed ? (
              <AlertBanner tone="error" title="Swap Deadline Passed">
                The whole-schedule swap deadline for this term has passed. New swap requests and completions are blocked.
              </AlertBanner>
            ) : activeOpenRequest ? (
              <AlertBanner tone="info" title="Active Swap Request Open">
                You already have an open swap request from{' '}
                <strong>Group {activeOpenRequest.currentGroup}</strong> desiring{' '}
                <strong>Group(s) {activeOpenRequest.desiredGroups.join(', ')}</strong>. You may have only one active
                swap request at a time—withdraw it below if you want to change your desired groups.
              </AlertBanner>
            ) : !eligibleGroupsData || eligibleGroupsData.eligibleGroups.length === 0 ? (
              <AlertBanner tone="neutral" title="No Eligible Destination Groups">
                No other published study groups in this term have your exact registered course set.
              </AlertBanner>
            ) : (
              <form onSubmit={handleSubmitSwap} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    Select One or More Eligible Desired Groups
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {eligibleGroupsData.eligibleGroups.map((group) => {
                      const isSelected = selectedGroups.includes(group.studyGroup);
                      return (
                        <button
                          key={group.studyGroup}
                          type="button"
                          onClick={() => toggleDesiredGroup(group.studyGroup)}
                          className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-500/15 ring-1 ring-indigo-400/50'
                              : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex w-full items-center justify-between">
                            <span className="font-mono text-base font-bold text-white">
                              Group {group.studyGroup}
                            </span>
                            <Badge tone={isSelected ? 'indigo' : 'neutral'}>
                              {isSelected ? 'Selected' : `${group.slotCount} slots`}
                            </Badge>
                          </div>
                          <span className="mt-1 text-xs text-slate-400">
                            {group.major} · Semester {group.semester}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end">
                  <CustomButton
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={isSubmitting}
                    disabled={selectedGroups.length === 0}
                    icon={<ArrowRightLeft className="h-4 w-4" aria-hidden />}
                  >
                    Submit Swap Request
                  </CustomButton>
                </div>
              </form>
            )}
          </Card>

          {/* Req 36 & 37: Open Whole-Schedule Swap Requests Eligible to Complete (Anonymized) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Open Swap Requests You Are Eligible to Complete ({openRequests.length})
              </h2>
            </div>

            {openRequests.length === 0 ? (
              <EmptyState
                icon={<ArrowRightLeft className="h-5 w-5" />}
                title="No matching open swap requests right now"
                description="Open requests appear here when a peer with your exact course set lists your current group among their desired groups."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {openRequests.map((reqItem) => (
                  <Card key={reqItem.id} tone="raised" className="p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base font-bold text-white">
                            Requester’s Group: {reqItem.requesterGroup}
                          </span>
                          <Badge tone="emerald" dot>
                            Open
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
                          Desired destination group(s):{' '}
                          <span className="font-mono text-indigo-300">
                            {reqItem.desiredGroups.join(', ')}
                          </span>{' '}
                          · Identity hidden per privacy rules
                        </p>
                      </div>
                      <CustomButton
                        variant="primary"
                        size="sm"
                        isLoading={actingRequestId === reqItem.id}
                        disabled={deadlinePassed}
                        onClick={() => handleCompleteSwap(reqItem.id)}
                        icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
                      >
                        Complete Swap → Move to {reqItem.requesterGroup}
                      </CustomButton>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {reqItem.courseCodes.map((code) => (
                        <Badge key={code} tone="sky" className="text-[10px]">
                          {code}
                        </Badge>
                      ))}
                    </div>

                    <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Requester’s Complete Weekly Schedule ({reqItem.schedule.length} slots)
                      </p>
                      {reqItem.schedule.map((slot, idx) => (
                        <div
                          key={`${slot.slotId}-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-white">{slot.courseCode}</span>
                            <Badge tone={SLOT_TONE[slot.slotType]}>
                              {slot.slotType} · G{slot.groupNumber}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-slate-300">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-500" aria-hidden />
                              {slot.dayOfWeek} {slot.startTime}–{slot.endTime}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-slate-500" aria-hidden />
                              {slot.roomId}
                            </span>
                            {slot.instructorName && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <UserRound className="h-3 w-3 text-slate-500" aria-hidden />
                                {slot.instructorName}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Req 38 & 39: My Submitted or Completed Swap Requests & Withdraw Action */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              My Submitted & Completed Swap Requests ({myRequests.length})
            </h2>

            {myRequests.length === 0 ? (
              <EmptyState
                icon={<Clock className="h-5 w-5" />}
                title="No swap requests recorded yet"
                description="When you submit or complete a whole-schedule swap request, its group details and status will appear here."
              />
            ) : (
              <div className="space-y-3">
                {myRequests.map((item) => (
                  <Card key={item.id} tone="default" className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-mono text-sm font-bold text-white">
                            Group {item.currentGroup} → Desired: {item.desiredGroups.join(', ')}
                          </span>
                          <Badge tone={STATUS_TONE[item.status]} dot>
                            {item.status}
                          </Badge>
                          <Badge tone="neutral">{item.roleInSwap}</Badge>
                        </div>

                        <p className="text-xs text-slate-400">
                          {item.term
                            ? `${item.term.academicYear} ${item.term.season} · `
                            : ''}
                          Courses: {item.courseCodes.join(', ')} · Submitted{' '}
                          {new Date(item.createdAt).toLocaleString()}
                          {item.completedAt
                            ? ` · Completed ${new Date(item.completedAt).toLocaleString()}`
                            : ''}
                          {item.withdrawnAt
                            ? ` · Withdrawn ${new Date(item.withdrawnAt).toLocaleString()}`
                            : ''}
                        </p>
                      </div>

                      {item.roleInSwap === 'Requester' && item.status === 'Open' && (
                        <CustomButton
                          variant="danger"
                          size="sm"
                          isLoading={actingRequestId === item.id}
                          onClick={() => handleWithdrawSwap(item.id)}
                          icon={<XCircle className="h-4 w-4" aria-hidden />}
                        >
                          Withdraw Request
                        </CustomButton>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ScheduleSwapsPage;
