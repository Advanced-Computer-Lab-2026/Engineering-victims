# Task 119 — work log

Branch: `feature/task-119` (nothing committed, pushed, or merged)
Date: 2026-11-21

## Requirement

Req 119 (depends on Req 5, already complete): an Advisor receives notifications when
1. they are assigned an advising student,
2. an assigned student submits a slot-change request,
3. an assigned student withdraws a slot-change request.

## Part 1 — implementation

The durable notification pipeline (`NotificationEvent` queue + worker) already declared
`advisor.assigned`, `slot_change.submitted` and `slot_change.withdrawn` with
audience `advisor` (resolved to the student's active assigned Advisor only), and
producers already existed. Gaps fixed:

| File | Change |
| --- | --- |
| `server/controllers/studentController.js` | No notification when the same Advisor is re-saved; deterministic occurrence `<advisorId>:<lastUpdateAt ms>`; link to `/students/:id` |
| `server/controllers/slotChangeRequestController.js` | Advisor submit/withdraw notifications link to `/slot-change-review` (where Advisors act), not the read-only `/schedule/:id`. Coordinator fallback unchanged |
| `src/pages/NotificationsPage.tsx` | "Open" action (ghost button) for notifications with a local, non-`/notifications` link; marks read, then navigates |
| `server/__tests__/advisorAssignmentNotification.test.js` | New — 10 route tests for the assignment producer |
| `server/__tests__/notificationEvents.test.js` | +6 tests — all three Req 119 events reach only the active assigned Advisor, nobody for a Normal Student |
| `server/__tests__/slotChangeRequest.test.js` | Two link assertions updated |

## Part 2 — the three failing suites and the 38 skipped tests

### Root causes

| Suite | Cause | Fix |
| --- | --- | --- |
| `stripeWebhook.test.js` | `stripe` declared in `server/package.json` and pinned in `server/package-lock.json`, but absent from `server/node_modules` | `npm ci` in `server/` |
| `extraHoursFinance.test.js` | `mongodb-memory-server-core` (devDependency) likewise not installed | `npm ci` in `server/` |
| `extraHoursPayment.integration.test.js` | same as above | `npm ci` in `server/` |
| `slotChangeDecision.replset.test.js` (38 skipped) | Opt-in by design: `describe.skip` unless `MONGO_REPLSET_URI` is set; the suite refuses anything but a credential-free replica set `rs0` at exactly `127.0.0.1:27017` | Ran a temporary single-node replica set `rs0` on 127.0.0.1:27017 with a throwaway dbpath, set `MONGO_REPLSET_URI` |

No test was skipped, disabled, or excluded. No application code or test code was
changed to make these pass. `package.json` and `package-lock.json` are unchanged
(`npm ci` installs exactly the lockfile).

### Environment handling

- The developer's standalone `mongod` (`/opt/homebrew/etc/mongod.conf`, dbPath
  `/opt/homebrew/var/mongodb`) was stopped, NOT converted to a replica set.
- Temporary replica set: `mongod --replSet rs0 --port 27017 --bind_ip 127.0.0.1 --dbpath <scratchpad>/rs0-db`,
  initiated with `replSetInitiate {_id:'rs0', members:[{_id:0, host:'127.0.0.1:27017'}]}`.
- After the run the temporary replica set was stopped and its data deleted; the
  standalone `mongod` and `npm run dev` were restarted with the original dev data.

### Commands

```sh
cd server
npm ci                                                     # log: task-119-npm-ci.log
npx jest __tests__/stripeWebhook.test.js __tests__/extraHoursFinance.test.js \
  __tests__/extraHoursPayment.integration.test.js          # log: task-119-three-suites-run1.log
MONGO_REPLSET_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' npx jest --verbose
                                                           # log: task-119-full-suite.log
```

### Results

| Run | Suites | Tests passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| Baseline (before any change) | 40 / 43 passed | 1007 | 3 suites failed to load | 38 |
| After Part 1 (no `npm ci`) | 41 / 44 passed | 1022 | 3 suites failed to load | 38 |
| Three suites after `npm ci` | 3 / 3 passed | 82 | 0 | 0 |
| **Full suite, final** | **44 / 44 passed** | **1142** | **0** | **0** |

Jest exit code: 0. Toolchain: Node v26.10.0, npm 11.19.1, mongod v9.0.2.

Expected noise in the log: stack traces printed by tests that deliberately inject
failures (e.g. `slotChangeDecision.replset.test.js` rollback test) — those tests pass.

### Remaining blockers / notes

- None for the test suite.
- `npm ci` reported audit advisories and that `fsevents` install scripts are not in
  `allowScripts`; neither affects the tests. Not changed (out of scope).
- `mongodb-memory-server-core` downloads a MongoDB binary on first run (cached
  afterwards), so the first run needs network access.
- `.claude/` is not in `.gitignore`; decide whether these logs should be committed.

## Part 3 — GUI check failure: "Request not sent — Could not submit your slot-change request"

Reported: Salma Ibrahim, CSEN 301 Lecture group 1 (Wednesday 09:45–11:15), note "1st slot on Monday".

### Investigation
- Backend log: `POST /api/slot-change-requests/me 500` x3 (controller does not log the error).
- Reproduced via API; eligibility was fine: `canRequest: true`, advising deadline 2026-12-15
  (moved by the tester), status Ready for Student Review, slot held, no pending duplicate.
- Response body: `{"message":"Could not submit your slot-change request","error":"Transaction numbers are only allowed on a replica set member or mongos"}`.

### Root cause
`createPendingSlotChangeRequest` (advisingScheduleWorkflowService, commit 8d0f06b, Reqs 76–82) re-checks
status/slot/duplicate and inserts inside a MongoDB transaction. The local dev `mongod` was standalone,
which cannot run transactions, so every submission failed with a generic 500. Decisions (Req 48)
already detect this and answer 503; submission did not.

### Fix (validation unchanged; transaction kept)
- `server/controllers/slotChangeRequestController.js`: on `isTransactionUnsupportedError`, answer 503 with
  a specific message (nothing written, no driver text leaked), mirroring Req 48 decisions.
- Environment: local `mongod` restarted as single-node replica set `rs0`
  (`mongod --config /opt/homebrew/etc/mongod.conf --replSet rs0` + `replSetInitiate`, host 127.0.0.1:27017).
  Same dbPath; dev data intact (25 users, 18 students). `mongod.conf` and `server/.env` not modified.
- `README.md`: troubleshooting entry for the replica-set requirement.

### Regression tests (`slotChangeRequest.test.js` › "database without transactions")
- standalone refusal (code 20) → 503, specific message, nothing created, nobody notified, session ended
  (fails without the fix — verified);
- eligibility checks (deadline) still run before the transaction;
- other DB failures stay 500.

### Verification
- Transaction write on the dev DB succeeded and was aborted on purpose — no data changed.
- Full suite: `MONGO_REPLSET_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' npx jest --verbose` →
  44/44 suites, 1145 passed, 0 failed, 0 skipped (log: task-119-slot-change-fix-full-suite.log).

## Part 4 — false "Request not sent" after a successful submission

Reported: request saved (visible in My Slot-Change Requests) and Advisor notified, yet the dialog showed
"Request not sent — Could not submit your slot-change request". No new request was submitted while investigating.

### Trace
- Frontend: `SlotChangeRequestDialog` shows `ApiError.message`; the text equals the backend's 500 message.
- Backend log: `POST /api/slot-change-requests/me 500 … - 348` (a different body than Part 3's 136-byte one).
- In `createMyRequest`: transaction commits → `notifyRequestSubmitted` (student + Advisor) →
  `res.status(201).json({ request: serializeRequest(created, course) })` throws → catch → 500.
- `serializeRequest` did `{ id, ...doc.currentSlotSnapshot }`. On a real Mongoose subdocument that spreads
  `$__parent`, `$__`, `_doc`; a document created in a transaction holds the live ClientSession there,
  so JSON.stringify throws "Converting circular structure to JSON".
- Reproduced offline with an unsaved, session-bound document (no DB writes): same error, and the resulting
  error body is exactly 348 bytes, matching the log.
- Exposed by Part 3: before the replica set, the transaction never reached this line.
  Unit tests missed it because `SlotChangeRequest.create` was stubbed with plain objects.

### Fix
- `server/controllers/slotChangeRequestController.js`: new `serializeCurrentSlot(doc)` copies
  id, groupNumber, dayOfWeek, startTime, endTime, room explicitly; used by `serializeRequest` and
  `serializeListItem`. Output shape unchanged (matches `SlotChangeRequestSummary['currentSlot']`).
  Request creation and notifications untouched.

### Regression test
`slotChangeRequest.test.js` › "response for a request created inside a transaction": `create` returns a real
`SlotChangeRequest` bound to a circular session → expects 201, plain snapshot, no Mongoose internals, one insert,
student + Advisor notified. Verified: 500 without the fix, passes with it.

### Results
- Backend: `MONGO_REPLSET_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' npx jest --verbose` →
  44/44 suites, 1146 passed, 0 failed, 0 skipped (log: task-119-false-error-fix-full-suite.log).
- Frontend: `npm test` → 12 passed, 0 failed.
