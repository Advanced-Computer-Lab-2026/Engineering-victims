/**
 * FR 117 notification fixes verification
 * Tests that the three missing notification integrations now work correctly
 */

const { buildStudentNotification, TEMPLATES } = require('../services/studentNotificationService');
const { queueStudentNotification } = require('../services/studentNotificationService');
const { publishStudentNotification } = require('../services/studentNotificationService');

describe('FR 117 notification fixes', () => {
  test('schedule.review_ready template exists and builds correctly', () => {
    expect(TEMPLATES['schedule.review_ready']).toBeDefined();
    const notification = buildStudentNotification('schedule.review_ready', {
      entityId: 'term-123',
      occurrence: 'review-456',
    });
    expect(notification.name).toBe('schedule.review_ready');
    expect(notification.title).toContain('ready for review');
    expect(notification.message).toContain('advisor');
    expect(notification.link).toBe('/schedule');
  });

  test('slot_change.decided template exists and builds with Approved decision', () => {
    expect(TEMPLATES['slot_change.decided']).toBeDefined();
    const notification = buildStudentNotification('slot_change.decided', {
      entityId: 'request-123',
      occurrence: 'decided-456',
      decision: 'Approved',
    });
    expect(notification.name).toBe('slot_change.decided');
    expect(notification.message).toContain('approved');
    expect(notification.link).toBe('/schedule');
  });

  test('slot_change.decided template builds with Rejected decision', () => {
    const notification = buildStudentNotification('slot_change.decided', {
      entityId: 'request-123',
      occurrence: 'decided-456',
      decision: 'Rejected',
    });
    expect(notification.message).toContain('rejected');
  });

  test('extra_hours.decided template exists and builds with Approved decision', () => {
    expect(TEMPLATES['extra_hours.decided']).toBeDefined();
    const notification = buildStudentNotification('extra_hours.decided', {
      entityId: 'request-123',
      occurrence: 'decided-456',
      decision: 'Approved',
    });
    expect(notification.name).toBe('extra_hours.decided');
    expect(notification.message).toContain('approved');
    expect(notification.link).toBe('/wallet');
  });

  test('extra_hours.decided template builds with Rejected decision', () => {
    const notification = buildStudentNotification('extra_hours.decided', {
      entityId: 'request-123',
      occurrence: 'decided-456',
      decision: 'Rejected',
    });
    expect(notification.message).toContain('rejected');
  });

  test('queueStudentNotification can queue schedule.review_ready notification', () => {
    const student = { _id: 'student-123', pendingNotificationEvents: [] };
    queueStudentNotification(student, 'schedule.review_ready', {
      entityId: 'term-123',
      occurrence: 'review-456',
    });
    expect(student.pendingNotificationEvents).toHaveLength(1);
    expect(student.pendingNotificationEvents[0].name).toBe('schedule.review_ready');
  });

  test('all three fixed notification types require valid inputs', () => {
    // Missing entityId
    expect(() =>
      buildStudentNotification('schedule.review_ready', { occurrence: 'test' })
    ).toThrow('persisted entity');

    // Missing occurrence
    expect(() =>
      buildStudentNotification('slot_change.decided', { entityId: 'test', decision: 'Approved' })
    ).toThrow('occurrence');

    // Invalid decision for slot_change.decided
    expect(() =>
      buildStudentNotification('slot_change.decided', {
        entityId: 'test',
        occurrence: 'test',
        decision: 'Pending',
      })
    ).toThrow('final');

    // Invalid decision for extra_hours.decided
    expect(() =>
      buildStudentNotification('extra_hours.decided', {
        entityId: 'test',
        occurrence: 'test',
        decision: 'Maybe',
      })
    ).toThrow('final');
  });
});
