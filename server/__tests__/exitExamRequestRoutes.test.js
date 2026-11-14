process.env.JWT_SECRET = 'test_secret';

jest.mock('../services/graduationPlanService', () => ({
  remainingCoursesFor: jest.fn(),
}));
jest.mock('../services/notificationService', () => ({
  notify: jest.fn().mockResolvedValue([]),
  notifyRole: jest.fn().mockResolvedValue([]),
}));
jest.mock('../services/notificationEventService', () => ({
  publishNotificationEvent: jest.fn().mockResolvedValue({}),
}));
jest.mock('../services/studentNotificationService', () => ({
  publishStudentNotification: jest.fn().mockResolvedValue({}),
}));

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const Course = require('../models/Course');
const ExitExamRequest = require('../models/ExitExamRequest');
const GraduationPlan = require('../models/GraduationPlan');
const Student = require('../models/Student');
const User = require('../models/User');
const { remainingCoursesFor } = require('../services/graduationPlanService');
const { publishNotificationEvent } = require('../services/notificationEventService');
const { publishStudentNotification } = require('../services/studentNotificationService');
const exitExamRequestRoutes = require('../routes/exitExamRequestRoutes');

const app = express();
app.use(express.json());
app.use('/api/exit-exam-requests', exitExamRequestRoutes);

const oid = () => new mongoose.Types.ObjectId();
const tokenFor = (role, userId = oid()) =>
  `Bearer ${jwt.sign({ userId: String(userId), role }, process.env.JWT_SECRET)}`;

const fluentQuery = (result) => {
  const query = {
    select: jest.fn(() => query),
    populate: jest.fn(() => query),
    sort: jest.fn(() => query),
    lean: jest.fn(() => Promise.resolve(result)),
  };
  return query;
};

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('exit-exam request access (reqs 108, 109, 115)', () => {
  it('requires the correct role for each operation', async () => {
    await request(app).get('/api/exit-exam-requests').expect(401);
    await request(app)
      .get('/api/exit-exam-requests')
      .set('Authorization', tokenFor('Advisor'))
      .expect(403);
    await request(app)
      .get('/api/exit-exam-requests/mine')
      .set('Authorization', tokenFor('Advisor'))
      .expect(403);
    await request(app)
      .post('/api/exit-exam-requests')
      .set('Authorization', tokenFor('Coordinator'))
      .send({})
      .expect(403);
    await request(app)
      .post(`/api/exit-exam-requests/${oid()}/decision`)
      .set('Authorization', tokenFor('Advisor'))
      .send({ decision: 'approve', note: 'Looks good.' })
      .expect(403);
  });

  it('rejects malformed plan and course ids before looking up records', async () => {
    const findPlan = jest.spyOn(GraduationPlan, 'findById');
    await request(app)
      .post('/api/exit-exam-requests')
      .set('Authorization', tokenFor('Advisor'))
      .send({ planId: 'bad-id', courseId: 'bad-id', reason: 'Not offered.' })
      .expect(400);
    expect(findPlan).not.toHaveBeenCalled();
  });

  it('does not expose another student\'s requests to a Normal Student', async () => {
    const userQuery = fluentQuery({ email: 'normal@student.guc.edu.eg' });
    const findRequests = jest.spyOn(ExitExamRequest, 'find');
    jest.spyOn(User, 'findById').mockReturnValue(userQuery);
    jest.spyOn(Student, 'findOne').mockResolvedValue({ studentType: 'Normal Student' });

    await request(app)
      .get('/api/exit-exam-requests/mine')
      .set('Authorization', tokenFor('Student'))
      .expect(403);

    expect(findRequests).not.toHaveBeenCalled();
  });

  it('submits a request for the single failed course in the Advisor-owned draft', async () => {
    const advisorId = oid();
    const studentId = oid();
    const courseId = oid();
    const planId = oid();
    const advisor = { _id: advisorId, fullName: 'Dr. Advisor', email: 'advisor@guc.edu.eg' };
    const student = {
      _id: studentId,
      studentType: 'Advising Student',
      fullName: 'A Student',
      studentId: '64-12345',
      major: 'Computer Science',
    };
    const course = { _id: courseId, code: 'CSEN 301', name: 'Data Structures' };

    jest.spyOn(GraduationPlan, 'findById').mockResolvedValue({
      _id: planId,
      advisor: advisorId,
      student: studentId,
      status: 'Draft',
    });
    jest.spyOn(Student, 'findById').mockResolvedValue(student);
    remainingCoursesFor.mockResolvedValue([{ id: String(courseId), isRetake: true }]);
    jest.spyOn(Course, 'findById').mockReturnValue(fluentQuery(course));
    jest.spyOn(ExitExamRequest, 'findOne').mockReturnValue(fluentQuery(null));
    jest.spyOn(ExitExamRequest, 'create').mockResolvedValue({
      _id: oid(),
      status: 'Pending',
      reason: 'The course is not offered before graduation.',
      responseNote: '',
      createdAt: new Date('2026-11-11T10:00:00Z'),
      decidedAt: null,
      decidedBy: null,
      toObject() {
        return this;
      },
    });
    jest.spyOn(User, 'findById').mockReturnValue(fluentQuery(advisor));

    const response = await request(app)
      .post('/api/exit-exam-requests')
      .set('Authorization', tokenFor('Advisor', advisorId))
      .send({
        planId: String(planId),
        courseId: String(courseId),
        reason: '  The course is not offered before graduation.  ',
      })
      .expect(201);

    expect(response.body.request.status).toBe('Pending');
    expect(response.body.request.reason).toBe('The course is not offered before graduation.');
    expect(publishNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: 'exit_exam.action_required',
      studentId,
      link: '/exit-exam-requests',
    }));
    expect(ExitExamRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ student: studentId, advisor: String(advisorId), course: courseId })
    );
  });

  it('lists only pending requests for Coordinator review', async () => {
    const pending = {
      _id: oid(),
      status: 'Pending',
      student: { _id: oid(), fullName: 'A Student', studentId: '64-12345', major: 'CS' },
      advisor: { _id: oid(), fullName: 'Dr. Advisor', email: 'advisor@guc.edu.eg' },
      course: { _id: oid(), code: 'CSEN 301', name: 'Data Structures' },
      reason: 'The course is not offered before graduation.',
      responseNote: '',
      createdAt: new Date('2026-11-11T10:00:00Z'),
      decidedAt: null,
      decidedBy: null,
    };
    const query = fluentQuery([pending]);
    const find = jest.spyOn(ExitExamRequest, 'find').mockReturnValue(query);

    const response = await request(app)
      .get('/api/exit-exam-requests')
      .set('Authorization', tokenFor('Coordinator'))
      .expect(200);

    expect(find).toHaveBeenCalledWith({ status: 'Pending' });
    expect(response.body.requests).toHaveLength(1);
    expect(response.body.requests[0].course.code).toBe('CSEN 301');
  });

  it('shows an Advising Student only their request status and Coordinator response', async () => {
    const student = { _id: oid(), studentType: 'Advising Student' };
    const entry = {
      _id: oid(),
      status: 'Rejected',
      student: { _id: student._id, fullName: 'A Student', studentId: '64-12345', major: 'CS' },
      advisor: { _id: oid(), fullName: 'Dr. Advisor', email: 'advisor@guc.edu.eg' },
      course: { _id: oid(), code: 'CSEN 301', name: 'Data Structures' },
      reason: 'The course is not offered before graduation.',
      responseNote: 'Place the course in the next available term.',
      createdAt: new Date('2026-11-11T10:00:00Z'),
      decidedAt: new Date('2026-11-12T10:00:00Z'),
      decidedBy: { _id: oid(), fullName: 'Nour Coordinator' },
    };
    const userQuery = fluentQuery({ email: 'student@student.guc.edu.eg' });
    const query = fluentQuery([entry]);
    jest.spyOn(User, 'findById').mockReturnValue(userQuery);
    jest.spyOn(Student, 'findOne').mockResolvedValue(student);
    const find = jest.spyOn(ExitExamRequest, 'find').mockReturnValue(query);

    const response = await request(app)
      .get('/api/exit-exam-requests/mine')
      .set('Authorization', tokenFor('Student'))
      .expect(200);

    expect(find).toHaveBeenCalledWith({ student: student._id });
    expect(response.body.requests[0]).toMatchObject({
      status: 'Rejected',
      responseNote: 'Place the course in the next available term.',
      decidedBy: { fullName: 'Nour Coordinator' },
    });
  });

  it('records a Coordinator decision only while the request is pending', async () => {
    const requestId = oid();
    const studentId = oid();
    const advisorId = oid();
    const courseId = oid();
    const coordinatorId = oid();
    const pending = {
      _id: requestId,
      student: studentId,
      advisor: advisorId,
      course: courseId,
      status: 'Pending',
      responseNote: '',
    };
    const updated = {
      _id: requestId,
      student: studentId,
      advisor: advisorId,
      course: courseId,
      status: 'Approved',
      responseNote: 'Approved because no valid placement remains.',
      decidedBy: coordinatorId,
      decidedAt: new Date(),
    };
    const populated = {
      ...updated,
      student: { _id: studentId, fullName: 'A Student', studentId: '64-12345', major: 'CS' },
      advisor: { _id: advisorId, fullName: 'Dr. Advisor', email: 'advisor@guc.edu.eg' },
      course: { _id: courseId, code: 'CSEN 301', name: 'Data Structures' },
      decidedBy: { _id: coordinatorId, fullName: 'Nour Coordinator' },
    };

    jest
      .spyOn(ExitExamRequest, 'findById')
      .mockResolvedValueOnce(pending)
      .mockReturnValueOnce(fluentQuery(populated));
    const update = jest.spyOn(ExitExamRequest, 'findOneAndUpdate').mockResolvedValue(updated);
    jest.spyOn(Student, 'findById').mockReturnValue(fluentQuery({
      fullName: 'A Student',
      studentId: '64-12345',
      email: 'student@student.guc.edu.eg',
    }));
    jest.spyOn(Course, 'findById').mockReturnValue(fluentQuery({ code: 'CSEN 301' }));
    jest.spyOn(User, 'findOne').mockReturnValue(fluentQuery({ _id: oid() }));

    const response = await request(app)
      .post(`/api/exit-exam-requests/${requestId}/decision`)
      .set('Authorization', tokenFor('Coordinator', coordinatorId))
      .send({ decision: 'approve', note: 'Approved because no valid placement remains.' })
      .expect(200);

    expect(update).toHaveBeenCalledWith(
      { _id: requestId, status: 'Pending' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'Approved',
          responseNote: 'Approved because no valid placement remains.',
        }),
      }),
      { new: true, runValidators: true }
    );
    expect(response.body.request.status).toBe('Approved');
    expect(publishStudentNotification).toHaveBeenCalledWith('exit_exam.decided', expect.objectContaining({
      studentId,
      decision: 'Approved',
      reference: 'CSEN 301',
    }));
  });
});
