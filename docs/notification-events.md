# Workflow notification foundation (requirements 117, 119–121)

Existing `notify`, `notifyMany`, `notifyRole`, and `notifyByEmail` remain compatible.
New workflow producers should use `publishNotificationEvent` from
`server/services/notificationEventService.js`. This step provides infrastructure;
it does not implement the calendar, probation email, deadline calculation, or
missing business workflows. No HTTP endpoint accepts events or recipient lists.

## Producer contract

Authorize the actor and load the source request on the server. Derive `studentId`
from the persisted request owner, never an unchecked request body. Select a name
from `notificationEvents.js`. A group swap requires one event per affected student.
For coordinator events, publish only when coordinator action becomes necessary.

```js
await publishNotificationEvent({
  name: 'slot_change.decided',
  entityId: request._id,
  occurrence: request.decisionVersion,
  studentId: request.studentId,
  title: 'Slot-change decision',
  message: 'Your slot-change request has been approved.',
  link: '/notifications',
}, { session });
```

`occurrence` must be a persisted action/version identifier, reused on retry.
Do not generate a fresh timestamp or UUID every publish attempt. Assignment events
need an assignment action ID, not just the advisor ID (A → B → A is three actions).
Reminder occurrences should encode term, deadline version and lead-time threshold;
the scheduler must verify open status and that the deadline has not passed.
The key hashes event name, entity ID, occurrence and student ID. Retrying the same key returns
the original immutable payload and recipient snapshot.

Where MongoDB transactions are available, save the mutation and publish using the
same session. On standalone MongoDB, save first, handle an enqueue rejection and
provide reconciliation; these two writes are not atomic. Enqueue errors deliberately
propagate to the producer so failures cannot be mistaken for durable delivery.
Do not automatically repeat an already committed business action on enqueue failure.

## Recipients and delivery

Student events target only the active student's matching active Student account.
Swap events apply to Normal Students; advising-specific events apply to Advising
Students. Advisor events target the current assigned active Advisor at enqueue.
Coordinator events target active Coordinators for an active advising student.
Recipients are snapshotted and deactivated accounts are skipped at delivery.
Zero recipients is a valid delivered no-op; creating an account later does not
retroactively send historical notifications.

The startup worker polls every five seconds, at most 25 events per batch. Atomic
60-second leases allow recovery after a crash. Partial deliveries can be retried:
a partial unique `(eventKey, user)` index prevents repeated visible notifications,
including concurrent workers. Existing notification rows have no event key and
are unaffected. Both indexes must exist before processing; startup initializes
the models. Deployments disabling automatic index creation must provision indexes.

Failures use exponential backoff (capped at one hour), with eight delivery attempts
before `failed`. Inspect `NotificationEvent.status`, `attempts`, `lastError`,
`nextAttemptAt` and `deliveredAt` in MongoDB. After fixing a failed delivery, an
operator can reset that event to `pending`, `attempts: 0`, `nextAttemptAt: now`,
`leaseUntil: null`, `leaseToken: null`; keep the key and recipients unchanged.
There is no admin retry endpoint in this step. Do not delete delivered event records
without a retention/deduplication policy.

This queue currently delivers in-app notifications only. Requirement 118 email
delivery, including SMTP's at-least-once limitations, belongs to its later step.

## Verification

Run `npm test --prefix server -- --runInBand notificationEvents`.
Unit tests mock persistence and do not send mail or modify a database. A later
integration check against a disposable MongoDB must verify real unique indexes,
concurrent leases, crash recovery and optional transaction rollback before deployment.
