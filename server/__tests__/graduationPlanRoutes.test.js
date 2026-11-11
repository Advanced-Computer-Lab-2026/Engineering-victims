/**
 * Req 103-107: route-level rules. The rule maths is covered in
 * graduationPlan.test.js; here the real router, auth middleware and controller
 * run with only the plan lookup stubbed.
 */
process.env.JWT_SECRET = 'test_secret';

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const GraduationPlan = require('../models/GraduationPlan');
const graduationPlanRoutes = require('../routes/graduationPlanRoutes');

const app = express();
app.use(express.json());
app.use('/api/graduation-plans', graduationPlanRoutes);

const oid = () => new mongoose.Types.ObjectId();
const tokenFor = (role, userId = oid()) =>
  `Bearer ${jwt.sign({ userId: String(userId), role }, process.env.JWT_SECRET)}`;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('graduation plan access (req 103-107)', () => {
  it('requires a session', async () => {
    await request(app).get('/api/graduation-plans').expect(401);
  });

  it.each(['Coordinator', 'Administrator', 'Student'])('stays closed to a %s', async (role) => {
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
