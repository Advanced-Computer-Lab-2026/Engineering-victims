// Req 120: Coordinators are notified in-app when a graduation plan is submitted
// or when an exit-exam, mandatory-course removal, extra-hours or
// financial-reversal request starts requiring their action.
//
// Runs the real routes, the real durable event queue and the real delivery
// worker against an in-memory MongoDB. Only the academic rule checks that are
// covered by their own suites are stubbed, so each trigger can be reached
// with a minimal fixture.
jest.setTimeout(180000);
process.env.JWT_SECRET = 'coordinator-notifications-test';

jest.mock('../services/graduationPlanService', () => {
  const actual = jest.requireActual('../services/graduationPlanService');
  return {
    ...actual,
    planInputsFor: jest.fn(async () => ({ remaining: [], gpa: 3 })),
    approvedCreditLimitFor: jest.fn(async () => null),
    approvedExitExamCourseIdsFor: jest.fn(async () => []),
    validatePlan: jest.fn(() => ({ errors: [] })),
    remainingCoursesFor: jest.fn(async () => []),
  };
});
jest.mock('../services/exitExamRequestService', () => ({
  ...jest.requireActual('../services/exitExamRequestService'),
  validateRequest: jest.fn(() => null),
}));
jest.mock('../services/mandatoryRemovalService', () => ({
  ...jest.requireActual('../services/mandatoryRemovalService'),
  validateRemovalRequest: jest.fn(() => null),
}));
jest.mock('../services/mandatoryCourseService', () => ({ buildMandatoryCandidates: jest.fn(async () => []) }));
jest.mock('../services/academicHistoryService', () => ({
  buildAcademicHistory: jest.fn(async () => ({ summary: { completedHours: 0 } })),
}));

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server-core');
const express = require('express');
const http = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Term = require('../models/AcademicTerm');
const Offering = require('../models/CourseOffering');
const Slot = require('../models/CourseSlot');
const Schedule = require('../models/StudentSchedule');
const GraduationPlan = require('../models/GraduationPlan');
const ExitExamRequest = require('../models/ExitExamRequest');
const MandatoryRemovalRequest = require('../models/MandatoryRemovalRequest');
const ExtraHoursRequest = require('../models/ExtraHoursRequest');
const Payment = require('../models/ExtraHoursPayment');
const Charge = require('../models/DeferredExtraHoursCharge');
const Notification = require('../models/Notification');
const NotificationEvent = require('../models/NotificationEvent');
require('../models/CourseRecord');
const { CATEGORIES } = require('../models/MandatoryRemovalRequest');
const { deliverNextNotificationEvent, publishNotificationEvent } = require('../services/notificationEventService');
const { prepareExtraHoursRequest } = require('../services/extraHoursService');
const { EVENTS } = require('../services/notificationEvents');

const app = express();
app.use(express.json());
app.use('/api/graduation-plans', require('../routes/graduationPlanRoutes'));
app.use('/api/exit-exam-requests', require('../routes/exitExamRequestRoutes'));
app.use('/api/mandatory-removal-requests', require('../routes/mandatoryRemovalRoutes'));
app.use('/api/extra-hours', require('../routes/extraHoursRoutes'));

const COORDINATOR_EVENTS = Object.keys(EVENTS).filter((name) => EVENTS[name].audience === 'coordinator');
const bearer = (user) => `Bearer ${jwt.sign({ userId: String(user._id), role: user.role }, process.env.JWT_SECRET)}`;
const as = (user) => ({
  post: (path, body = {}) => http(app).post(path).set('Authorization', bearer(user)).send(body),
  put: (path, body = {}) => http(app).put(path).set('Authorization', bearer(user)).send(body),
});

let repl;
let coordinator, secondCoordinator, inactiveCoordinator, admin, advisor, otherAdvisor, student, studentUser;
let term, draftCourses, extraCourse;

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(repl.getUri(), { dbName: 'coordinator_notifications_test' });
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});
afterAll(async () => {
  await mongoose.disconnect();
  if (repl) await repl.stop();
});

const user = (fullName, email, role, extra = {}) => User.create({ fullName, email, password: 'test', role, ...extra });

beforeEach(async () => {
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  coordinator = await user('Coordinator One', 'coord1@guc.edu.eg', 'Coordinator');
  secondCoordinator = await user('Coordinator Two', 'coord2@guc.edu.eg', 'Coordinator');
  inactiveCoordinator = await user('Former Coordinator', 'coord3@guc.edu.eg', 'Coordinator', { isActive: false });
  admin = await user('Admin', 'admin@guc.edu.eg', 'Administrator');
  advisor = await user('Advisor One', 'advisor@guc.edu.eg', 'Advisor');
  otherAdvisor = await user('Advisor Two', 'advisor2@guc.edu.eg', 'Advisor');
  student = await Student.create({
    fullName: 'Nadia Hassan', email: 'nadia@student.guc.edu.eg', studentId: '64-12001', studentType: 'Advising Student',
    currentSemester: 7, academicStanding: 'Good Standing', major: 'Computer Science', workflowStatus: 'Draft',
    assignedAdvisor: advisor._id,
  });
  studentUser = await user(student.fullName, student.email, 'Student');

  // An advising draft with 28 hours and one eligible extra course, so an
  // extra-hours request can go through the real submission rules.
  const now = Date.now();
  term = await Term.create({
    academicYear: '2026/2027', season: 'Winter', termStartDate: new Date(now - 86400000), termEndDate: new Date(now + 60 * 86400000),
    teachingStartDate: new Date(now), teachingEndDate: new Date(now + 50 * 86400000),
    advisingDeadline: new Date(now + 86400000), swapDeadline: new Date(now + 86400000),
  });
  draftCourses = [];
  for (const [i, creditHours] of [12, 12, 4, 3].entries()) {
    const course = await Course.create({
      code: `CSEN ${801 + i}`, name: `Course ${i}`, creditHours, lectureHours: 2, courseType: 'Core',
      majors: ['Computer Science'], recommendedSemester: 7, offeringSeasons: ['Winter'],
    });
    const offering = await Offering.create({ courseId: course._id, termId: term._id, publicationStatus: 'Published' });
    const slot = await Slot.create({
      offeringId: offering._id, instructorId: advisor._id, slotType: 'Lecture', groupNumber: 1,
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'][i], startTime: '08:00', endTime: '10:00',
      roomId: `R${i}`, maxCapacity: 20, assignedCount: i < 3 ? 1 : 0,
    });
    if (i < 3) {
      draftCourses.push(course);
      await Schedule.create({ studentId: student._id, termId: term._id, slotId: slot._id, status: 'Draft' });
    } else {
      extraCourse = course;
    }
  }
});

/** Run the delivery worker until the queue is empty. */
async function deliverAll() {
  for (let i = 0; i < 50 && await deliverNextNotificationEvent(new Date(Date.now() + 1000)); i += 1);
}
const coordinatorEvents = () => NotificationEvent.find({ name: { $in: COORDINATOR_EVENTS } }).lean();
const inboxOf = (account) => Notification.find({ user: account._id }).lean();

/**
 * Exactly one delivered notification for this event, for every active
 * Coordinator, and nothing for anyone else.
 */
async function expectCoordinatorsNotifiedOnce(name, { link, type = EVENTS[name].type, title } = {}) {
  await deliverAll();
  const events = await coordinatorEvents();
  expect(events.map((event) => event.name)).toEqual([name]);
  expect(events[0].status).toBe('delivered');
  expect(events[0].recipients.map(String).sort()).toEqual([String(coordinator._id), String(secondCoordinator._id)].sort());
  for (const account of [coordinator, secondCoordinator]) {
    const inbox = await inboxOf(account);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ type, link, isRead: false, eventKey: events[0].key });
    if (title) expect(inbox[0].title).toBe(title);
  }
  // Other accounts may get their own updates (e.g. a decision), never this one.
  expect(await Notification.countDocuments({ eventKey: events[0].key })).toBe(2);
  for (const account of [inactiveCoordinator, admin, advisor, otherAdvisor, studentUser]) {
    expect(await Notification.countDocuments({ user: account._id, eventKey: events[0].key })).toBe(0);
  }
  return events[0];
}

async function draftPlan() {
  return GraduationPlan.create({
    advisor: advisor._id, student: student._id, status: 'Draft',
    terms: [{ season: 'Winter', academicYear: '2026/2027' }, { season: 'Spring', academicYear: '2026/2027' }, { season: 'Summer', academicYear: '2026/2027' }],
  });
}

describe('1. graduation plan submitted', () => {
  test('notifies every active Coordinator once, with a link to the review list', async () => {
    const plan = await draftPlan();
    const submitted = await as(advisor).post(`/api/graduation-plans/${plan._id}/submit`);
    expect(submitted.status).toBe(200);
    const event = await expectCoordinatorsNotifiedOnce('graduation_plan.submitted', {
      link: '/graduation-plans', title: 'Graduation plan submitted for review',
    });
    expect(event.entityId).toBe(String(plan._id));
  });

  test('a retried submit and unrelated updates do not notify again; a resubmission after rejection does', async () => {
    const plan = await draftPlan();
    expect((await as(advisor).post(`/api/graduation-plans/${plan._id}/submit`)).status).toBe(200);
    // Retry of the same submission: already Submitted, so rejected without a second event.
    expect((await as(advisor).post(`/api/graduation-plans/${plan._id}/submit`)).status).toBe(409);
    await expectCoordinatorsNotifiedOnce('graduation_plan.submitted', { link: '/graduation-plans' });

    // The Coordinator's own decision is not new Coordinator work.
    const rejected = await as(coordinator).post(`/api/graduation-plans/${plan._id}/decision`, { decision: 'reject', note: 'Move CSEN 801 to Spring.' });
    expect(rejected.status).toBe(200);
    await deliverAll();
    expect(await coordinatorEvents()).toHaveLength(1);

    // A corrected resubmission is a new review that needs action again.
    expect((await as(advisor).post(`/api/graduation-plans/${plan._id}/submit`)).status).toBe(200);
    await deliverAll();
    const events = await coordinatorEvents();
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.key)).size).toBe(2);
    expect(await inboxOf(coordinator)).toHaveLength(2);
  });
});

describe('2. exit-exam request requires action', () => {
  test('notifies active Coordinators once, linking to the exit-exam review queue', async () => {
    const plan = await draftPlan();
    const created = await as(advisor).post('/api/exit-exam-requests', {
      planId: String(plan._id), courseId: String(draftCourses[0]._id), reason: 'Failed once with a passing coursework grade.',
    });
    expect(created.status).toBe(201);
    const event = await expectCoordinatorsNotifiedOnce('exit_exam.action_required', {
      link: '/exit-exam-requests', title: 'Exit-exam request needs review',
    });
    expect(event.entityId).toBe(String(created.body.request.id));
    expect((await inboxOf(coordinator))[0].message).toContain('CSEN 801');
  });

  test('a retried request and the Coordinator decision do not notify Coordinators again', async () => {
    const plan = await draftPlan();
    const body = { planId: String(plan._id), courseId: String(draftCourses[0]._id), reason: 'Failed once with a passing coursework grade.' };
    const created = await as(advisor).post('/api/exit-exam-requests', body);
    expect(created.status).toBe(201);
    expect((await as(advisor).post('/api/exit-exam-requests', body)).status).toBe(409);
    expect(await ExitExamRequest.countDocuments()).toBe(1);
    const decided = await as(coordinator).post(`/api/exit-exam-requests/${created.body.request.id}/decision`, { decision: 'approve', note: 'Approved.' });
    expect(decided.status).toBe(200);
    await expectCoordinatorsNotifiedOnce('exit_exam.action_required', { link: '/exit-exam-requests' });
  });
});

describe('3. mandatory-course removal requires action', () => {
  const removal = (overrides = {}) => ({
    studentId: String(student._id), courseId: String(draftCourses[1]._id), category: CATEGORIES[0],
    reason: 'The first makeup has not been sat yet.', ...overrides,
  });

  test('notifies active Coordinators once, linking to the student record that lists the request', async () => {
    const created = await as(advisor).post('/api/mandatory-removal-requests', removal());
    expect(created.status).toBe(201);
    const event = await expectCoordinatorsNotifiedOnce('mandatory_removal.action_required', {
      link: `/academic-history/${student._id}`, title: 'Mandatory-course removal needs review',
    });
    expect(event.entityId).toBe(String(created.body.request.id));
    expect((await inboxOf(coordinator))[0].message).toContain('CSEN 802');
  });

  test('a retried request while one is pending does not notify again', async () => {
    expect((await as(advisor).post('/api/mandatory-removal-requests', removal())).status).toBe(201);
    expect((await as(advisor).post('/api/mandatory-removal-requests', removal())).status).toBe(409);
    expect(await MandatoryRemovalRequest.countDocuments()).toBe(1);
    await expectCoordinatorsNotifiedOnce('mandatory_removal.action_required', { link: `/academic-history/${student._id}` });
  });

  test('a rejected request from an unassigned Advisor notifies nobody', async () => {
    expect((await as(otherAdvisor).post('/api/mandatory-removal-requests', removal())).status).toBe(403);
    await deliverAll();
    expect(await coordinatorEvents()).toHaveLength(0);
    expect(await Notification.countDocuments()).toBe(0);
  });
});

describe('4. extra-hours request requires action', () => {
  const submission = (submissionKey = '6f1c1e0e-7d1a-4b5e-9c55-0a1f3e2b9d10') => ({
    studentId: String(student._id), termId: String(term._id), submissionKey,
    items: [{ courseId: String(extraCourse._id), requestedHours: 3 }],
  });

  test('notifies active Coordinators once, linking straight to the request', async () => {
    const created = await as(advisor).post('/api/extra-hours', submission());
    expect(created.status).toBe(201);
    const id = created.body.request.id;
    const event = await expectCoordinatorsNotifiedOnce('extra_hours.action_required', {
      link: `/extra-hours-requests?requestId=${id}`, title: 'Extra-hours request needs review',
    });
    expect(event.entityId).toBe(String(id));
    expect((await inboxOf(coordinator))[0].message).toContain(created.body.request.reference);
  });

  test('a replayed submission and the Coordinator decision do not notify Coordinators again', async () => {
    const created = await as(advisor).post('/api/extra-hours', submission());
    expect(created.status).toBe(201);
    const replay = await as(advisor).post('/api/extra-hours', submission());
    expect(replay.status).toBe(200);
    expect(await ExtraHoursRequest.countDocuments()).toBe(1);
    const decided = await as(coordinator).post(`/api/extra-hours/review/${created.body.request.id}/decision`, { decision: 'Approved', responseNote: 'Approved for graduation.' });
    expect(decided.status).toBe(200);
    // A replay after approval must not announce work that no longer exists.
    expect((await as(advisor).post('/api/extra-hours', submission())).status).toBe(200);
    await expectCoordinatorsNotifiedOnce('extra_hours.action_required', { link: `/extra-hours-requests?requestId=${created.body.request.id}` });
  });

  test('a replay recovers a notification whose first enqueue was lost, without duplicating it', async () => {
    expect((await as(advisor).post('/api/extra-hours', submission())).status).toBe(201);
    await NotificationEvent.deleteMany({}); // the first enqueue never reached the queue
    expect((await as(advisor).post('/api/extra-hours', submission())).status).toBe(200);
    expect((await as(advisor).post('/api/extra-hours', submission())).status).toBe(200);
    await expectCoordinatorsNotifiedOnce('extra_hours.action_required', { link: expect.stringMatching(/^\/extra-hours-requests\?requestId=/) });
  });

  test('a withdrawn request is never announced by a later replay', async () => {
    const created = await as(advisor).post('/api/extra-hours', submission());
    await NotificationEvent.deleteMany({});
    expect((await as(advisor).post(`/api/extra-hours/${created.body.request.id}/withdraw`, {})).status).toBe(200);
    expect((await as(advisor).post('/api/extra-hours', submission())).status).toBe(200);
    await deliverAll();
    expect(await coordinatorEvents()).toHaveLength(0);
  });
});

describe('5. financial-reversal request requires action', () => {
  async function approvedRequest(settlement) {
    const request = prepareExtraHoursRequest({
      student, termId: term._id, requestingAdvisorId: advisor._id, selectedCourses: draftCourses,
      courseRequests: [{ course: extraCourse, requestedHours: 3 }], records: [],
    });
    request.decision = 'Approved'; request.decidedAt = new Date(); request.decidedBy = coordinator._id; request.responseNote = 'OK';
    request.history.push({ action: 'Submitted', actor: advisor._id }, { action: 'Approved', actor: coordinator._id });
    request.activatedAt = new Date(); request.activatedHours = 3;
    let record;
    if (settlement === 'Paid') {
      request.settlementStatus = 'Paid'; request.settlementOption = 'Wallet';
      record = await Payment.create({ request: request._id, student: student._id, method: 'Wallet', amount: request.totalCost, status: 'Succeeded', paidAt: new Date() });
      request.paymentReference = record.reference;
    } else if (settlement === 'Deferred') {
      record = await Charge.create({
        request: request._id, student: student._id, installment: new mongoose.Types.ObjectId(), installmentReference: 'INST-1',
        installmentLabel: 'Installment 1', dueDate: new Date(Date.now() + 30 * 86400000), amount: request.totalCost,
        confirmedAt: new Date(), confirmedBy: studentUser._id,
      });
      request.settlementStatus = 'Deferred to Next Installment'; request.settlementOption = 'Next Installment'; request.deferredCharge = record._id;
    } else {
      request.settlementStatus = 'Awaiting Payment Choice'; request.activatedAt = null; request.activatedHours = 0;
    }
    await request.save();
    return { request, record };
  }
  const ask = (account, request, reason = 'The student is withdrawing from the course.') =>
    as(account).post(`/api/extra-hours/${request._id}/request-cancellation`, { reason });

  test('a paid request notifies active Coordinators once, linking to the payment to refund', async () => {
    const { request, record } = await approvedRequest('Paid');
    const asked = await ask(advisor, request);
    expect(asked.status).toBe(201);
    const event = await expectCoordinatorsNotifiedOnce('financial_reversal.action_required', {
      type: 'payment', link: `/extra-hours-finance?recordKind=payment&recordId=${record._id}`,
      title: 'Extra-hours refund or cancellation needs action',
    });
    expect(event.entityId).toBe(String(request._id));
    expect((await inboxOf(coordinator))[0].message).toMatch(/refund EGP 2,400 to the student's wallet/);
    const saved = await ExtraHoursRequest.findById(request._id).lean();
    expect(saved.cancellationRequest).toMatchObject({ reason: 'The student is withdrawing from the course.', requestedBy: advisor._id });
    expect(saved.history.at(-1).action).toBe('CancellationRequested');
    // Nothing financial changes until a Coordinator acts.
    expect(saved.settlementStatus).toBe('Paid');
    expect((await Payment.findById(record._id).lean()).status).toBe('Succeeded');
  });

  test('a deferred request links to the deferred charge to cancel', async () => {
    const { request, record } = await approvedRequest('Deferred');
    expect((await ask(advisor, request)).status).toBe(201);
    await expectCoordinatorsNotifiedOnce('financial_reversal.action_required', {
      type: 'payment', link: `/extra-hours-finance?recordKind=deferred&recordId=${record._id}`,
    });
    expect((await inboxOf(coordinator))[0].message).toMatch(/remove the EGP 2,400 deferred charge/);
  });

  test('retries and the completed reversal do not notify again', async () => {
    const { request, record } = await approvedRequest('Deferred');
    expect((await ask(advisor, request)).status).toBe(201);
    const retried = await ask(advisor, request, 'A second click with another reason.');
    expect(retried.status).toBe(200);
    expect((await ExtraHoursRequest.findById(request._id).lean()).cancellationRequest.reason).toBe('The student is withdrawing from the course.');
    const reversed = await as(coordinator).post(`/api/extra-hours/finance/deferred/${record._id}/reverse`, { reason: 'Cancelled at the Advisor\'s request.' });
    expect(reversed.status).toBe(200);
    expect((await ask(advisor, request)).status).toBe(409);
    await expectCoordinatorsNotifiedOnce('financial_reversal.action_required', { type: 'payment', link: expect.any(String) });
  });

  test('unsettled, foreign and invalid requests notify nobody', async () => {
    const { request } = await approvedRequest('Awaiting');
    expect((await ask(advisor, request)).status).toBe(409);
    const { request: paid } = await approvedRequest('Paid');
    expect((await ask(otherAdvisor, paid)).status).toBe(404);
    expect((await ask(advisor, paid, 'no')).status).toBe(400);
    expect((await ask(coordinator, paid)).status).toBe(403);
    await deliverAll();
    expect(await coordinatorEvents()).toHaveLength(0);
    expect(await Notification.countDocuments()).toBe(0);
  });
});

describe('recipients', () => {
  const input = () => ({
    name: 'extra_hours.action_required', entityId: new mongoose.Types.ObjectId(), occurrence: 'submitted',
    studentId: student._id, title: 'Extra-hours request needs review', message: 'Review it.', link: '/extra-hours-requests',
  });

  test('a Coordinator deactivated before delivery is skipped; one added later is not back-filled', async () => {
    await publishNotificationEvent(input());
    await User.updateOne({ _id: secondCoordinator._id }, { $set: { isActive: false } });
    const late = await user('New Coordinator', 'coord4@guc.edu.eg', 'Coordinator');
    await deliverAll();
    expect(await inboxOf(coordinator)).toHaveLength(1);
    expect(await inboxOf(secondCoordinator)).toHaveLength(0);
    expect(await inboxOf(late)).toHaveLength(0);
  });

  test('a redelivered event (expired lease) never creates a second visible row', async () => {
    const event = await publishNotificationEvent(input());
    await deliverAll();
    await NotificationEvent.updateOne({ _id: event._id }, { $set: { status: 'pending', nextAttemptAt: new Date(0) } });
    await deliverAll();
    expect(await inboxOf(coordinator)).toHaveLength(1);
    expect(await inboxOf(secondCoordinator)).toHaveLength(1);
  });

  test('Coordinator events are not raised for Normal Students', async () => {
    await Student.updateOne({ _id: student._id }, { $set: { studentType: 'Normal Student' } });
    const event = await publishNotificationEvent(input());
    expect(event.recipients).toHaveLength(0);
    await deliverAll();
    expect(await Notification.countDocuments()).toBe(0);
  });
});
