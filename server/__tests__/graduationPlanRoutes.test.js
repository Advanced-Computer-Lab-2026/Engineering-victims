/**
 * Req 110-114: route-level rules for the shared graduation-plan workflow.
 *
 * The rule maths is covered in graduationPlan.test.js and the review rules in
 * graduationPlanReview.test.js; here the real router, auth middleware and
 * controller run with only the database queries stubbed.
 */
process.env.JWT_SECRET = 'test_secret';

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const GraduationPlan = require('../models/GraduationPlan');
const Student = require('../models/Student');
const User = require('../models/User');
const graduationPlanRoutes = require('../routes/graduationPlanRoutes');

const app = express();
app.use(express.json());
app.use('/api/graduation-plans', graduationPlanRoutes);

const oid = () => new mongoose.Types.ObjectId();
const tokenFor = (role, userId = oid()) =>
  `Bearer ${jwt.sign({ userId: String(userId), role }, process.env.JWT_SECRET)}`;

/** The fluent query the list action builds: find().populate().populate().sort().lean(). */
const listQuery = (result) => {
  const query = {
    populate: jest.fn(() => query),
    sort: jest.fn(() => query),
    lean: jest.fn(() => Promise.resolve(result)),
  };
  return query;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('graduation plan access (req 103-107)', () => {
  it('requires a session', async () => {
    await request(app).get('/api/graduation-plans').expect(401);
  });

  it.each(['Administrator', 'Student'])('stays closed to a %s', async (role) => {
    await request(app)
      .get('/api/graduation-plans')
      .set('Authorization', tokenFor(role))
      .expect(403);
  });

  it('hides another Advisor\'s plan behind a 404, draft or not (req 106)', async () => {
    const plan = { _id: oid(), advisor: oid(), status: 'Draft' };
    jest.spyOn(GraduationPlan, 'findById').mockResolvedValue(plan);

    await request(app)
      .get(`/api/graduation-plans/${plan._id}`)
      .set('Authorization', tokenFor('Advisor'))
      .expect(404);
  });

  it('treats a malformed plan id as not found', async () => {
    await request(app)
      .get('/api/graduation-plans/not-an-id')
      .set('Authorization', tokenFor('Advisor'))
      .expect(404);
  });

  it('refuses to update a submitted plan (req 104/107)', async () => {
    const advisorId = oid();
    jest.spyOn(GraduationPlan, 'findById').mockResolvedValue({
      _id: oid(),
      advisor: advisorId,
      status: 'Submitted',
    });

    await request(app)
      .put(`/api/graduation-plans/${oid()}`)
      .set('Authorization', tokenFor('Advisor', advisorId))
      .send({ placements: [] })
      .expect(409);
  });

  it('refuses to delete a submitted plan (req 105/107)', async () => {
    const advisorId = oid();
    jest.spyOn(GraduationPlan, 'findById').mockResolvedValue({
      _id: oid(),
      advisor: advisorId,
      status: 'Submitted',
      deleteOne: jest.fn(),
    });

    await request(app)
      .delete(`/api/graduation-plans/${oid()}`)
      .set('Authorization', tokenFor('Advisor', advisorId))
      .expect(409);
  });

  it('refuses to submit a plan twice (req 107)', async () => {
    const advisorId = oid();
    jest.spyOn(GraduationPlan, 'findById').mockResolvedValue({
      _id: oid(),
      advisor: advisorId,
      status: 'Submitted',
    });

    await request(app)
      .post(`/api/graduation-plans/${oid()}/submit`)
      .set('Authorization', tokenFor('Advisor', advisorId))
      .expect(409);
  });

  it('rejects a create without a student id', async () => {
    await request(app)
      .post('/api/graduation-plans')
      .set('Authorization', tokenFor('Advisor'))
      .send({})
      .expect(400);
  });
});

describe('graduation plan review (req 110-114)', () => {
  it('lets an Advisor list only their own plans, drafts included (req 106/110)', async () => {
    const advisorId = oid();
    const query = listQuery([]);
    const find = jest.spyOn(GraduationPlan, 'find').mockReturnValue(query);

    await request(app)
      .get('/api/graduation-plans')
      .set('Authorization', tokenFor('Advisor', advisorId))
      .expect(200);

    expect(find).toHaveBeenCalledWith({ advisor: String(advisorId) });
  });

  it('shows a Coordinator every non-draft plan (req 110/111)', async () => {
    const query = listQuery([]);
    const find = jest.spyOn(GraduationPlan, 'find').mockReturnValue(query);

    await request(app)
      .get('/api/graduation-plans')
      .set('Authorization', tokenFor('Coordinator'))
      .expect(200);

    expect(find).toHaveBeenCalledWith({ status: { $in: ['Submitted', 'Accepted'] } });
    expect(query.populate).toHaveBeenCalledWith('advisor', 'fullName email');
  });

  it('refuses a Coordinator filter on private drafts (req 111)', async () => {
    await request(app)
      .get('/api/graduation-plans?status=Draft')
      .set('Authorization', tokenFor('Coordinator'))
      .expect(400);
  });

  it('applies the status, Advisor and submission-date filters (req 111)', async () => {
    const advisorId = oid();
    const query = listQuery([]);
    const find = jest.spyOn(GraduationPlan, 'find').mockReturnValue(query);

    await request(app)
      .get(
        `/api/graduation-plans?status=Accepted&advisor=${advisorId}&submittedFrom=2026-09-01&submittedTo=2026-09-30`
      )
      .set('Authorization', tokenFor('Coordinator'))
      .expect(200);

    const filter = find.mock.calls[0][0];
    expect(filter.status).toBe('Accepted');
    expect(String(filter.advisor)).toBe(String(advisorId));
    expect(filter.submittedAt.$gte.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    // A date-only upper bound covers the whole day.
    expect(filter.submittedAt.$lt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('rejects invalid and reversed submission-date filters (req 111)', async () => {
    await request(app)
      .get('/api/graduation-plans?submittedFrom=2026-02-31')
      .set('Authorization', tokenFor('Coordinator'))
      .expect(400);

    await request(app)
      .get('/api/graduation-plans?submittedFrom=2026-09-30&submittedTo=2026-09-01')
      .set('Authorization', tokenFor('Coordinator'))
      .expect(400);
  });

  it('searches the student ID or the Advisor name or email (req 112)', async () => {
    const query = listQuery([
      {
        _id: oid(),
        status: 'Submitted',
        student: { studentId: '64-50034', fullName: 'Mariam Said' },
        advisor: { fullName: 'Dr. Karim Fahmy', email: 'karim.fahmy@guc.edu.eg' },
        terms: [],
        placements: [],
      },
      {
        _id: oid(),
        status: 'Submitted',
        student: { studentId: '64-30010', fullName: 'Salma Ibrahim' },
        advisor: { fullName: 'Dr. Mona Adel', email: 'mona.adel@guc.edu.eg' },
        terms: [],
        placements: [],
      },
    ]);
    jest.spyOn(GraduationPlan, 'find').mockReturnValue(query);

    const byStudent = await request(app)
      .get('/api/graduation-plans?search=64-50034')
      .set('Authorization', tokenFor('Coordinator'))
      .expect(200);
    expect(byStudent.body.plans).toHaveLength(1);
    expect(byStudent.body.plans[0].student.fullName).toBe('Mariam Said');

    const byAdvisor = await request(app)
      .get('/api/graduation-plans?search=Mona')
      .set('Authorization', tokenFor('Coordinator'))
      .expect(200);
    expect(byAdvisor.body.plans).toHaveLength(1);

    const byEmail = await request(app)
      .get('/api/graduation-plans?search=karim.fahmy')
      .set('Authorization', tokenFor('Coordinator'))
      .expect(200);
    expect(byEmail.body.plans).toHaveLength(1);
  });

  it('hides a draft from the Coordinator but not from its Advisor (req 106/110)', async () => {
    const advisorId = oid();
    const plan = { _id: oid(), advisor: advisorId, status: 'Draft' };
    jest.spyOn(GraduationPlan, 'findById').mockResolvedValue(plan);

    await request(app)
      .get(`/api/graduation-plans/${plan._id}`)
      .set('Authorization', tokenFor('Coordinator'))
      .expect(404);
  });

  it('closes accepting and rejecting to everyone but a Coordinator (req 113)', async () => {
    for (const role of ['Advisor', 'Administrator', 'Student']) {
      await request(app)
        .post(`/api/graduation-plans/${oid()}/decision`)
        .set('Authorization', tokenFor(role))
        .send({ decision: 'accept', note: 'Looks good.' })
        .expect(403);
    }
  });

  it('requires a response note and a submitted plan (req 113)', async () => {
    jest.spyOn(GraduationPlan, 'findById').mockResolvedValue({
      _id: oid(),
      status: 'Submitted',
    });

    await request(app)
      .post(`/api/graduation-plans/${oid()}/decision`)
      .set('Authorization', tokenFor('Coordinator'))
      .send({ decision: 'accept', note: '   ' })
      .expect(400);

    jest.spyOn(GraduationPlan, 'findById').mockResolvedValue({
      _id: oid(),
      status: 'Draft',
    });

    await request(app)
      .post(`/api/graduation-plans/${oid()}/decision`)
      .set('Authorization', tokenFor('Coordinator'))
      .send({ decision: 'reject', note: 'Too many courses in Spring.' })
      .expect(409);
  });

  it('serves the accepted plan to the signed-in student only (req 114)', async () => {
    await request(app)
      .get('/api/graduation-plans/me')
      .set('Authorization', tokenFor('Advisor'))
      .expect(403);
    await request(app).get('/api/graduation-plans/me').expect(401);
  });

  it('does not expose graduation plans to Normal Students (req 114)', async () => {
    const userQuery = {
      select: jest.fn(() => userQuery),
      lean: jest.fn().mockResolvedValue({ email: 'normal@student.guc.edu.eg' }),
    };
    jest.spyOn(User, 'findById').mockReturnValue(userQuery);
    jest.spyOn(Student, 'findOne').mockResolvedValue({ studentType: 'Normal Student' });

    await request(app)
      .get('/api/graduation-plans/me')
      .set('Authorization', tokenFor('Student'))
      .expect(403);
  });
});
