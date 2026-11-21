/**
 * Req 119: an Advisor is notified when a Coordinator or Administrator assigns
 * them an Advising Student (PATCH /api/students/:id/advisor).
 *
 * The real route, auth middleware and controller run on a bare Express app;
 * model queries are stubbed and the durable event publisher is mocked, so no
 * MongoDB is needed. Who receives the event is policy inside the publisher
 * (see notificationEvents.test.js); this file checks the producer.
 */
process.env.JWT_SECRET = 'test_secret';

jest.mock('../services/notificationEventService', () => ({
  publishNotificationEvent: jest.fn().mockResolvedValue({}),
}));

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../models/User');
const Student = require('../models/Student');
const studentRoutes = require('../routes/studentRoutes');
const { publishNotificationEvent } = require('../services/notificationEventService');

const app = express();
app.use(express.json());
app.use('/api/students', studentRoutes);

const oid = () => new mongoose.Types.ObjectId();
const tokenFor = (role) => `Bearer ${jwt.sign({ userId: String(oid()), role }, process.env.JWT_SECRET)}`;

const makeStudent = (overrides = {}) => {
  const student = {
    _id: oid(),
    fullName: 'Salma Ibrahim',
    email: 'salma.ibrahim@student.guc.edu.eg',
    studentId: '52-1234',
    studentType: 'Advising Student',
    isActive: true,
    assignedAdvisor: null,
    ...overrides,
  };
  student.save = jest.fn().mockResolvedValue(student);
  student.populate = jest.fn().mockResolvedValue(student);
  return student;
};

const stub = ({ student = makeStudent(), advisor = { _id: oid(), role: 'Advisor' } } = {}) => {
  jest.spyOn(Student, 'findById').mockResolvedValue(student);
  jest.spyOn(User, 'findById').mockResolvedValue(advisor);
  return { student, advisor };
};

const assign = (student, advisorId, role = 'Coordinator') =>
  request(app)
    .patch(`/api/students/${student._id}/advisor`)
    .set('Authorization', tokenFor(role))
    .send({ advisorId: String(advisorId) });

beforeEach(() => {
  jest.restoreAllMocks();
  publishNotificationEvent.mockReset();
  publishNotificationEvent.mockResolvedValue({});
});

describe('Req 119: advisor-assignment notification', () => {
  it.each(['Coordinator', 'Administrator'])('notifies the newly assigned Advisor when a %s assigns them', async (role) => {
    const { student, advisor } = stub();

    const res = await assign(student, advisor._id, role);

    expect(res.status).toBe(200);
    expect(student.save).toHaveBeenCalledTimes(1);
    expect(publishNotificationEvent).toHaveBeenCalledTimes(1);
    const event = publishNotificationEvent.mock.calls[0][0];
    expect(event).toEqual(expect.objectContaining({
      name: 'advisor.assigned',
      entityId: student._id,
      studentId: student._id,
      title: 'A student was assigned to you',
      link: `/students/${student._id}`,
    }));
    expect(event.message).toBe('Salma Ibrahim (52-1234) is now on your advising roster.');
    expect(event.occurrence).toMatch(new RegExp(`^${advisor._id}:\\d+$`));
    // Recipients are never chosen by the producer.
    expect(event.recipients).toBeUndefined();
  });

  it('publishes only after the assignment is saved', async () => {
    const { student, advisor } = stub();
    const order = [];
    student.save.mockImplementation(async () => { order.push('save'); return student; });
    publishNotificationEvent.mockImplementation(async () => { order.push('publish'); return {}; });

    await assign(student, advisor._id);

    expect(order).toEqual(['save', 'publish']);
  });

  it('notifies the new Advisor on a reassignment', async () => {
    const { student, advisor } = stub({ student: makeStudent({ assignedAdvisor: oid() }) });

    const res = await assign(student, advisor._id);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reassigned/);
    expect(publishNotificationEvent).toHaveBeenCalledTimes(1);
    expect(publishNotificationEvent.mock.calls[0][0].occurrence).toMatch(new RegExp(`^${advisor._id}:`));
  });

  it('sends nothing when the same Advisor is saved again', async () => {
    const advisor = { _id: oid(), role: 'Advisor' };
    const { student } = stub({ student: makeStudent({ assignedAdvisor: advisor._id }), advisor });

    const res = await assign(student, advisor._id);

    expect(res.status).toBe(200);
    expect(publishNotificationEvent).not.toHaveBeenCalled();
  });

  it('still assigns when the notification cannot be queued', async () => {
    const { student, advisor } = stub();
    publishNotificationEvent.mockRejectedValue(new Error('notifications down'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await assign(student, advisor._id);

    expect(res.status).toBe(200);
    expect(student.save).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
  });

  it('sends nothing when the assignment is rejected', async () => {
    const normal = makeStudent({ studentType: 'Normal Student' });
    stub({ student: normal });
    const notAdvisor = makeStudent();
    jest.spyOn(Student, 'findById').mockResolvedValueOnce(normal).mockResolvedValueOnce(notAdvisor);

    const normalRes = await assign(normal, oid());
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: oid(), role: 'Coordinator' });
    const notAdvisorRes = await assign(notAdvisor, oid());

    expect(normalRes.status).toBe(400);
    expect(notAdvisorRes.status).toBe(404);
    expect(normal.save).not.toHaveBeenCalled();
    expect(notAdvisor.save).not.toHaveBeenCalled();
    expect(publishNotificationEvent).not.toHaveBeenCalled();
  });

  it.each(['Advisor', 'Student'])('does not let a %s assign advisors or trigger the notification', async (role) => {
    const { student, advisor } = stub();

    const res = await assign(student, advisor._id, role);

    expect(res.status).toBe(403);
    expect(student.save).not.toHaveBeenCalled();
    expect(publishNotificationEvent).not.toHaveBeenCalled();
  });
});
