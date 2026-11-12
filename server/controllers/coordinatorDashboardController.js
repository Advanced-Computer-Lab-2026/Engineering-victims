const Student = require('../models/Student');
const SwapRequest = require('../models/SwapRequest');
const SlotChangeRequest = require('../models/SlotChangeRequest');
const ExitExamRequest = require('../models/ExitExamRequest');
const GraduationPlan = require('../models/GraduationPlan');
const { pendingRequestFor } = require('../services/pendingRequestService');
const { ensureSeededSwapRequests } = require('./swapRequestController');

/**
 * Req 122: Coordinator views a pending-work dashboard showing every student's
 * workflow status, blocking step and requests awaiting action, grouped by
 * student type, request type and Advisor.
 *
 * - Statuses are system-derived from completed actions and cannot be manually
 *   overwritten by an Advisor.
 * - Includes open and completed normal-student group swaps and advising-student
 *   draft, review, change-request, approval, settlement and processing states.
 */
const ADVISING_STATE_BUCKETS = {
  Draft: ['Not Started', 'Draft', 'Reopened'],
  Review: ['Ready for Student Review'],
  'Change-Request': ['Change Request Pending'],
  Approval: ['Pending Approval'],
  Settlement: ['Awaiting Payment Choice', 'Deferred to Next Installment'],
  Processing: ['Ready to Process', 'Processed'],
};

const advisingStageBucket = (status) => {
  for (const [bucket, statuses] of Object.entries(ADVISING_STATE_BUCKETS)) {
    if (statuses.includes(status)) return bucket;
  }
  return 'Draft';
};

exports.getPendingWorkDashboard = async (req, res) => {
  try {
    await ensureSeededSwapRequests();

    const [students, swapRequests, slotChangeRequests, exitExamRequests, graduationPlans] =
      await Promise.all([
        Student.find({})
          .populate('assignedAdvisor', 'fullName email')
          .sort({ lastUpdateAt: -1, fullName: 1 })
          .lean(),
        SwapRequest.find({ status: { $in: ['Open', 'Completed'] } })
          .populate('requesterId', 'fullName studentId major currentSemester studyGroup')
          .populate('completedBy', 'fullName studentId studyGroup')
          .sort({ createdAt: -1 })
          .lean(),
        SlotChangeRequest.find({ status: 'Pending' })
          .populate('student', 'fullName studentId major currentSemester assignedAdvisor')
          .populate('course', 'code name')
          .sort({ createdAt: -1 })
          .lean(),
        ExitExamRequest.find({ status: 'Pending' })
          .populate('student', 'fullName studentId major currentSemester assignedAdvisor')
          .populate('course', 'code name')
          .populate('advisor', 'fullName email')
          .sort({ createdAt: -1 })
          .lean(),
        GraduationPlan.find({ status: 'Submitted' })
          .populate('student', 'fullName studentId major currentSemester assignedAdvisor')
          .populate('advisor', 'fullName email')
          .sort({ submittedAt: -1, createdAt: -1 })
          .lean(),
      ]);

    const formatStudent = (s) => ({
      id: String(s._id),
      studentId: s.studentId,
      fullName: s.fullName,
      email: s.email,
      studentType: s.studentType,
      major: s.major,
      currentSemester: s.currentSemester,
      studyGroup: s.studyGroup ?? null,
      academicStanding: s.academicStanding,
      workflowStatus: s.workflowStatus,
      blockingStep: s.blockingStep ?? null,
      stateCategory:
        s.studentType === 'Advising Student'
          ? advisingStageBucket(s.workflowStatus)
          : s.workflowStatus,
      awaitingRequest:
        s.studentType === 'Advising Student'
          ? pendingRequestFor(s.workflowStatus)
          : s.workflowStatus === 'Swap Request Open'
          ? 'Open group swap'
          : 'None',
      assignedAdvisor: s.assignedAdvisor
        ? {
            id: String(s.assignedAdvisor._id),
            fullName: s.assignedAdvisor.fullName,
            email: s.assignedAdvisor.email,
          }
        : null,
      isActive: s.isActive,
      lastUpdateAt: s.lastUpdateAt,
    });

    const formattedStudents = students.map(formatStudent);

    // 1. Grouped by Student Type
    const byStudentType = {
      'Advising Student': formattedStudents.filter((s) => s.studentType === 'Advising Student'),
      'Normal Student': formattedStudents.filter((s) => s.studentType === 'Normal Student'),
    };

    const advisingStateBreakdown = {
      Draft: byStudentType['Advising Student'].filter((s) => s.stateCategory === 'Draft'),
      Review: byStudentType['Advising Student'].filter((s) => s.stateCategory === 'Review'),
      'Change-Request': byStudentType['Advising Student'].filter(
        (s) => s.stateCategory === 'Change-Request'
      ),
      Approval: byStudentType['Advising Student'].filter((s) => s.stateCategory === 'Approval'),
      Settlement: byStudentType['Advising Student'].filter((s) => s.stateCategory === 'Settlement'),
      Processing: byStudentType['Advising Student'].filter((s) => s.stateCategory === 'Processing'),
    };

    // 2. Grouped by Request Type
    const openSwaps = swapRequests
      .filter((r) => r.status === 'Open' && r.requesterId)
      .map((r) => ({
        id: String(r._id),
        studentObjectId: String(r.requesterId._id),
        studentId: r.requesterId.studentId,
        studentName: r.requesterId.fullName,
        detail: `Group ${r.currentGroup} → Desired: ${r.desiredGroups.join(', ')}`,
        status: 'Open',
        createdAt: r.createdAt,
      }));

    const completedSwaps = swapRequests
      .filter((r) => r.status === 'Completed' && r.requesterId)
      .map((r) => ({
        id: String(r._id),
        studentObjectId: String(r.requesterId._id),
        studentId: r.requesterId.studentId,
        studentName: r.requesterId.fullName,
        detail: `Swapped Group ${r.currentGroup} (${r.desiredGroups.join(', ')})`,
        status: 'Completed',
        createdAt: r.completedAt || r.createdAt,
      }));

    const slotChangeItems = slotChangeRequests
      .filter((r) => r.student)
      .map((r) => ({
        id: String(r._id),
        studentObjectId: String(r.student._id),
        studentId: r.student.studentId,
        studentName: r.student.fullName,
        detail: `${r.course?.code || 'Course'} (${r.slotType})`,
        status: r.status,
        createdAt: r.createdAt,
      }));

    // Include advising students in Change Request Pending if they don't have a separate row yet
    for (const s of byStudentType['Advising Student']) {
      if (
        s.workflowStatus === 'Change Request Pending' &&
        !slotChangeItems.some((item) => item.studentObjectId === s.id)
      ) {
        slotChangeItems.push({
          id: `wf-sc-${s.id}`,
          studentObjectId: s.id,
          studentId: s.studentId,
          studentName: s.fullName,
          detail: `Blocking step: ${s.blockingStep || 'Advisor to resolve the request'}`,
          status: 'Pending',
          createdAt: s.lastUpdateAt,
        });
      }
    }

    const extraHoursAndSettlementItems = byStudentType['Advising Student']
      .filter((s) =>
        ['Pending Approval', 'Awaiting Payment Choice', 'Deferred to Next Installment'].includes(
          s.workflowStatus
        )
      )
      .map((s) => ({
        id: `wf-eh-${s.id}`,
        studentObjectId: s.id,
        studentId: s.studentId,
        studentName: s.fullName,
        detail: `${s.awaitingRequest} (${s.blockingStep || s.workflowStatus})`,
        status: s.workflowStatus,
        createdAt: s.lastUpdateAt,
      }));

    const gradPlanItems = graduationPlans
      .filter((p) => p.student)
      .map((p) => ({
        id: String(p._id),
        studentObjectId: String(p.student._id),
        studentId: p.student.studentId,
        studentName: p.student.fullName,
        detail: `Submitted by ${p.advisor?.fullName || 'Advisor'}`,
        status: p.status,
        createdAt: p.submittedAt || p.createdAt,
      }));

    const exitExamItems = exitExamRequests
      .filter((e) => e.student)
      .map((e) => ({
        id: String(e._id),
        studentObjectId: String(e.student._id),
        studentId: e.student.studentId,
        studentName: e.student.fullName,
        detail: `${e.course?.code || 'Course'} — ${e.reason}`,
        status: e.status,
        createdAt: e.createdAt,
      }));

    const byRequestType = [
      {
        requestType: 'Normal-Student Group Swaps (Open)',
        count: openSwaps.length,
        items: openSwaps,
      },
      {
        requestType: 'Normal-Student Group Swaps (Completed)',
        count: completedSwaps.length,
        items: completedSwaps,
      },
      {
        requestType: 'Advising Slot-Change Requests',
        count: slotChangeItems.length,
        items: slotChangeItems,
      },
      {
        requestType: 'Extra-Hours Approval & Settlement Requests',
        count: extraHoursAndSettlementItems.length,
        items: extraHoursAndSettlementItems,
      },
      {
        requestType: 'Submitted Graduation Plans',
        count: gradPlanItems.length,
        items: gradPlanItems,
      },
      {
        requestType: 'Exit-Exam Requests',
        count: exitExamItems.length,
        items: exitExamItems,
      },
    ];

    // 3. Grouped by Advisor
    const advisorGroupsMap = new Map();
    for (const s of byStudentType['Advising Student']) {
      const key = s.assignedAdvisor ? s.assignedAdvisor.id : 'unassigned';
      if (!advisorGroupsMap.has(key)) {
        advisorGroupsMap.set(key, {
          advisorId: s.assignedAdvisor ? s.assignedAdvisor.id : null,
          advisorName: s.assignedAdvisor ? s.assignedAdvisor.fullName : 'Unassigned Advising Students',
          advisorEmail: s.assignedAdvisor ? s.assignedAdvisor.email : null,
          students: [],
        });
      }
      advisorGroupsMap.get(key).students.push(s);
    }

    const byAdvisor = [...advisorGroupsMap.values()].sort((a, b) => {
      if (!a.advisorId) return 1;
      if (!b.advisorId) return -1;
      return a.advisorName.localeCompare(b.advisorName);
    });

    return res.status(200).json({
      summary: {
        totalStudents: formattedStudents.length,
        normalStudents: byStudentType['Normal Student'].length,
        advisingStudents: byStudentType['Advising Student'].length,
        openSwaps: openSwaps.length,
        completedSwaps: completedSwaps.length,
        awaitingActionCount:
          openSwaps.length +
          slotChangeItems.length +
          extraHoursAndSettlementItems.length +
          gradPlanItems.length +
          exitExamItems.length,
      },
      byStudentType,
      advisingStateBreakdown,
      byRequestType,
      byAdvisor,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not load pending-work dashboard.',
      error: error.message,
    });
  }
};
