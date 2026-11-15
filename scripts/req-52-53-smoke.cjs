/**
 * Read-only smoke test for req 52 (filters) and req 53 (open advising details).
 *
 *   node scripts/req-52-53-smoke.cjs
 *
 * Signs in as two Advisors: one who owns students and one who owns none, so the
 * "any Advisor may open any student from the results" rule is actually exercised.
 */
const BASE = process.env.API_BASE || 'http://localhost:5000';

let failures = 0;
const check = (label, condition, detail) => {
  if (condition) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`);
  }
};

const login = async (email, password = 'password123') => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.token || body.accessToken || body.user?.token;
};

const list = async (token, params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ''));
  const res = await fetch(`${BASE}/api/advisors/advising-students?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
};

(async () => {
  const mona = await login('mona.adel@guc.edu.eg');
  const hind = await login('hind.rashwan@guc.edu.eg');

  console.log('\nReq 52 — filter option sets');
  const base = await list(mona);
  check('list returns 200', base.status === 200, base.status);
  const opts = base.body.filterOptions ?? {};
  check('advisor options include "My assigned students" for self',
    (opts.advisors ?? []).some((o) => o.label === 'My assigned students'), opts.advisors);
  check('advisor options include an "Unassigned" choice',
    (opts.advisors ?? []).some((o) => o.value === 'none'), opts.advisors);
  check('five filter option sets present',
    ['advisors', 'majors', 'advisingReasons', 'workflowStatuses', 'pendingRequestTypes']
      .every((key) => Array.isArray(opts[key]) && opts[key].length > 0),
    Object.keys(opts));
  check('advising reasons cover all five from req 59', (opts.advisingReasons ?? []).length === 5, opts.advisingReasons);
  check('every row carries advisingReason and pendingRequest',
    (base.body.students ?? []).every((s) => 'advisingReason' in s && 'pendingRequest' in s));

  console.log('\nReq 52 — filters apply and combine');
  const total = base.body.summary.total;
  const everyOther = (res) => res.status === 200 && res.body.students.length > 0;

  const byAdvisor = await list(mona, { assignedAdvisor: 'mine' });
  check('"mine" narrows to the Advisor\'s own students', everyOther(byAdvisor)
    && byAdvisor.body.students.every((s) => s.isMine), byAdvisor.body.students?.length);

  const byNone = await list(mona, { assignedAdvisor: 'none' });
  check('Unassigned returns only students with no advisor', everyOther(byNone)
    && byNone.body.students.every((s) => !s.assignedAdvisor), byNone.body.students?.length);

  const byMajor = await list(mona, { major: 'DMET' });
  check('major filter applies', everyOther(byMajor) && byMajor.body.students.every((s) => s.major === 'DMET'));

  const byReason = await list(mona, { advisingReason: 'Probation' });
  check('advising reason filter applies', everyOther(byReason)
    && byReason.body.students.every((s) => s.advisingReason === 'Probation'), byReason.body.students);

  const noReason = await list(mona, { advisingReason: 'none' });
  check('"no advising reason" returns students without one', noReason.status === 200
    && noReason.body.students.every((s) => s.advisingReason === null), noReason.body.students);

  const byStatus = await list(mona, { workflowStatus: 'Draft' });
  check('schedule status filter applies', everyOther(byStatus)
    && byStatus.body.students.every((s) => s.workflowStatus === 'Draft'));

  const byRequest = await list(mona, { pendingRequestType: 'Slot-change request' });
  check('pending request filter applies', everyOther(byRequest)
    && byRequest.body.students.every((s) => s.pendingRequest === 'Slot-change request'),
    byRequest.body.students);

  const combined = await list(mona, { assignedAdvisor: 'mine', major: 'Computer Science' });
  check('filters combine with AND', combined.status === 200 && combined.body.students.every(
    (s) => s.isMine && s.major === 'Computer Science'), combined.body.students);

  const search = await list(mona, { search: 'laila' });
  check('search still works alongside filters', search.status === 200
    && search.body.students.every((s) => /laila/i.test(s.fullName + s.email + s.studentId)));

  check('summary totals stay constant while filters narrow',
    byMajor.body.summary.total === total, { a: byMajor.body.summary.total, total });
  check('summary matched reflects the filtered rows',
    byMajor.body.summary.matched === byMajor.body.students.length);

  console.log('\nReq 53 — open a student from the results');
  const anyStudent = base.body.students[0];
  const notHinds = base.body.students.find((s) => !s.isMine);
  const detail = await fetch(`${BASE}/api/advisors/advising-students/${anyStudent.id}`, {
    headers: { Authorization: `Bearer ${hind}` },
  });
  check('an Advisor with no students opens one assigned elsewhere', detail.status === 200,
    detail.status);
  const detailBody = await detail.json();
  check('detail carries the advising fields the drawer shows',
    Boolean(detailBody.student?.advisingReason !== undefined && detailBody.student?.pendingRequest
      && detailBody.student?.workflowStatus), detailBody.student);

  // The Advisor roster only ever holds advising students, so a Normal Student
  // id comes from the Coordinator, who can see the whole directory.
  const coordinator = await login('coordinator@guc.edu.eg');
  const directory = await fetch(`${BASE}/api/students?limit=100`, {
    headers: { Authorization: `Bearer ${coordinator}` },
  }).then((r) => r.json());
  const normal = (directory.students ?? []).find((s) => s.studentType === 'Normal Student');
  check('the directory has a Normal Student to test against', Boolean(normal));
  if (normal) {
    const blocked = await fetch(`${BASE}/api/advisors/advising-students/${normal.id}`, {
      headers: { Authorization: `Bearer ${hind}` },
    });
    check('a Normal Student cannot be opened as advising details', blocked.status === 404, blocked.status);
  }

  const badId = await fetch(`${BASE}/api/advisors/advising-students/not-an-id`, {
    headers: { Authorization: `Bearer ${hind}` },
  });
  check('a malformed id answers 400, not a crash', badId.status === 400, badId.status);

  const rosterScoped = notHinds
    ? await fetch(`${BASE}/api/students/${notHinds.id}`, { headers: { Authorization: `Bearer ${hind}` } })
    : null;
  check('the narrower /api/students/:id scope is unchanged (still 403)',
    rosterScoped === null || rosterScoped.status === 403, rosterScoped && rosterScoped.status);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Smoke test could not run:', err.message);
  process.exit(1);
});
