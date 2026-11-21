// Req 120: Coordinator notifications must offer an Open action to the page that
// needs their attention; unsafe or self links must not.
//   npm test        (or: node --test src/lib/notificationLinks.test.mjs)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { notificationDestination } from './notificationLinks.ts';

const require = createRequire(import.meta.url);
const id = '6b01a65fa4c2cb7e2532ddab';

describe('notification Open destinations', () => {
  it('opens each Req 120 Coordinator destination exactly as the server sends it', () => {
    const coordinatorLinks = [
      '/graduation-plans',                                         // graduation_plan.submitted
      '/exit-exam-requests',                                       // exit_exam.action_required
      `/academic-history/${id}`,                                   // mandatory_removal.action_required
      `/extra-hours-requests?requestId=${id}`,                     // extra_hours.action_required
      `/extra-hours-finance?recordKind=payment&recordId=${id}`,    // financial_reversal.action_required (refund)
      `/extra-hours-finance?recordKind=deferred&recordId=${id}`,   // financial_reversal.action_required (cancel)
    ];
    for (const link of coordinatorLinks) assert.equal(notificationDestination(link), link, link);
  });

  it('opens the student templates too (Req 117)', () => {
    const { TEMPLATES } = require('../../server/services/studentNotificationService.js');
    for (const [name, template] of Object.entries(TEMPLATES)) {
      const expected = template.link === '/notifications' ? null : template.link;
      assert.equal(notificationDestination(template.link), expected, name);
    }
  });

  it('offers no Open action for missing, self or non-local links', () => {
    for (const link of [null, undefined, '', '   ', '/notifications', '/notifications/', 'notifications',
      'https://evil.example/x', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)', '/a b', '/x\nSet-Cookie: y']) {
      assert.equal(notificationDestination(link), null, JSON.stringify(link));
    }
  });

  it('keeps the query and hash, and normalises dot segments to an in-app path', () => {
    assert.equal(notificationDestination('/extra-hours-finance?recordKind=payment&recordId=1#detail'), '/extra-hours-finance?recordKind=payment&recordId=1#detail');
    assert.equal(notificationDestination('/x/../graduation-plans'), '/graduation-plans');
  });
});
