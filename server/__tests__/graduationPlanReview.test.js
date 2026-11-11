/**
 * Req 110-114: the review rules.
 *
 * `applyDecision` is a pure function over a plan, so the accept/reject
 * transitions can be checked without a database.
 */
const {
  RESPONSE_NOTE_LIMIT,
  applyDecision,
  clearDecision,
  matchesPlanSearch,
} = require('../services/graduationPlanService');

const submittedPlan = (overrides = {}) => ({
  status: 'Submitted',
  submittedAt: new Date('2026-10-01T09:00:00Z'),
  responseNote: '',
  decidedAt: null,
  decidedBy: null,
  ...overrides,
});

const coordinatorId = 'coordinator-1';
const now = new Date('2026-11-12T10:00:00Z');

describe('applyDecision (req 113)', () => {
  it('accepts a submitted plan with the response note', () => {
    const plan = submittedPlan();

    const error = applyDecision(plan, {
      decision: 'accept',
      note: '  Enough time to finish within one year.  ',
      coordinatorId,
      now,
    });

    expect(error).toBeNull();
    expect(plan.status).toBe('Accepted');
    expect(plan.responseNote).toBe('Enough time to finish within one year.');
    expect(plan.decidedAt).toBe(now);
    expect(plan.decidedBy).toBe(coordinatorId);
    expect(plan.submittedAt).toEqual(new Date('2026-10-01T09:00:00Z'));
  });

  it('rejects a submitted plan back to a private draft (req 107/113)', () => {
    const plan = submittedPlan();

    const error = applyDecision(plan, {
      decision: 'reject',
      note: 'Spring is over the credit limit.',
      coordinatorId,
      now,
    });

    expect(error).toBeNull();
    expect(plan.status).toBe('Draft');
    expect(plan.responseNote).toBe('Spring is over the credit limit.');
    // A returned draft is no longer submitted; the Advisor resubmits it.
    expect(plan.submittedAt).toBeNull();
  });

  it('rejects an unknown decision', () => {
    const plan = submittedPlan();
    expect(applyDecision(plan, { decision: 'maybe', note: 'Hmm', coordinatorId })).toMatch(
      /accept or reject/
    );
    expect(plan.status).toBe('Submitted');
  });

  it('only reviews a plan that is still submitted', () => {
    const plan = submittedPlan({ status: 'Accepted' });
    expect(applyDecision(plan, { decision: 'reject', note: 'Changed my mind.', coordinatorId })).toMatch(
      /only a submitted plan/i
    );
    expect(plan.status).toBe('Accepted');
  });

  it('requires a non-empty response note within the limit', () => {
    const plan = submittedPlan();

    expect(applyDecision(plan, { decision: 'accept', note: '   ', coordinatorId })).toMatch(
      /response note/i
    );
    expect(
      applyDecision(plan, {
        decision: 'accept',
        note: 'x'.repeat(RESPONSE_NOTE_LIMIT + 1),
        coordinatorId,
      })
    ).toMatch(/under 1000 characters/i);
    expect(plan.status).toBe('Submitted');
  });
});

describe('clearDecision (req 107/113)', () => {
  it('starts a resubmission with no stale response', () => {
    const plan = {
      responseNote: 'Returned for correction.',
      decidedAt: new Date(),
      decidedBy: coordinatorId,
    };

    clearDecision(plan);

    expect(plan.responseNote).toBe('');
    expect(plan.decidedAt).toBeNull();
    expect(plan.decidedBy).toBeNull();
  });
});

describe('matchesPlanSearch (req 112)', () => {
  const plan = {
    student: { studentId: '64-50034', fullName: 'Mariam Said' },
    advisor: { fullName: 'Dr. Karim Fahmy', email: 'karim.fahmy@guc.edu.eg' },
  };

  it('matches nothing when the search is blank', () => {
    expect(matchesPlanSearch(plan, '')).toBe(true);
    expect(matchesPlanSearch(plan, '   ')).toBe(true);
  });

  it('matches a student ID', () => {
    expect(matchesPlanSearch(plan, '64-50034')).toBe(true);
    expect(matchesPlanSearch(plan, '64-30010')).toBe(false);
  });

  it('matches an Advisor name or GUC email, case-insensitively', () => {
    expect(matchesPlanSearch(plan, 'karim fahmy')).toBe(true);
    expect(matchesPlanSearch(plan, 'KARIM.FAHMY@GUC.EDU.EG')).toBe(true);
    expect(matchesPlanSearch(plan, 'mona.adel')).toBe(false);
  });

  it('handles a plan whose student or Advisor could not be populated', () => {
    expect(matchesPlanSearch({}, 'anything')).toBe(false);
    expect(matchesPlanSearch({}, '')).toBe(true);
  });
});
