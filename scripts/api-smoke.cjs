/**
 * End-to-end check of the Schedule Groups screen against a running server:
 * logs in as the Coordinator, replays the page's slot-picker request for every
 * term, major and semester it can select, then creates, publishes and assigns
 * a group through the API.
 *
 *   node scripts/api-smoke.cjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:5000';

const failures = [];
const report = (okFlag, label, detail = '') => {
  if (okFlag) console.log(`  PASS ${label}${detail ? ` — ${detail}` : ''}`);
  else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const call = async (path, { token, method = 'GET', body } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
};

/** Exactly what src/lib/scheduleTemplatesService.ts asks for. */
const slotOptions = async (token, termId, major, semester) => {
  const { json } = await call(`/api/offerings?termId=${encodeURIComponent(termId)}`, { token });
  const eligible = (json.offerings ?? []).filter(
    (offering) =>
      offering.publicationStatus === 'Published' &&
      (!offering.eligibleMajors?.length || offering.eligibleMajors.includes(major)) &&
      (!offering.eligibleSemesters?.length || offering.eligibleSemesters.includes(String(semester)))
  );
  const perOffering = await Promise.all(
    eligible.map((offering) =>
      call(`/api/offerings/${offering._id}`, { token }).then(({ json: detail }) => detail.slots ?? [])
    )
  );
  return perOffering.flat();
};

async function main() {
  // 1. the server answers at all
  let up = false;
  for (let attempt = 0; attempt < 60 && !up; attempt++) {
    try {
      up = (await fetch(`${BASE}/`)).ok;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (!up) throw new Error(`server not reachable at ${BASE}`);
  console.log(`\nserver is up at ${BASE}`);

  // 2. sign in as the Coordinator the Schedule Groups screen is gated on
  const login = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'coordinator@guc.edu.eg', password: 'password123' },
  });
  report(login.status === 200, 'coordinator login', `status ${login.status}`);
  const token = login.json.token;

  // 3. the page's starting state: first term and the majors it offers
  const terms = (await call('/api/terms', { token })).json.terms ?? [];
  const students = await call('/api/students?page=1&limit=1', { token });
  const majors = students.json.filterOptions?.majors ?? [];
  console.log(
    `\nterms (in page order): ${terms.map((t) => `${t.academicYear} ${t.season}`).join(', ')}`
  );
  console.log(`majors offered by the page: ${majors.join(', ')}`);
  report(terms.length > 0, 'term selector has terms');
  report(majors.length > 0, 'major selector has majors');

  // 4. the picker must never come up empty, for anything the screen can select
  console.log('\nslot picker (term x major x semester):');
  let minimum = Infinity;
  let minimumWhere = '';
  for (const term of terms) {
    for (const major of majors) {
      const perSemester = [];
      for (let semester = 1; semester <= 8; semester++) {
        const slots = await slotOptions(token, term._id, major, semester);
        perSemester.push(slots.length);
        if (slots.length < minimum) {
          minimum = slots.length;
          minimumWhere = `${term.academicYear} ${term.season} / ${major} / semester ${semester}`;
        }
      }
      console.log(
        `  ${term.academicYear} ${term.season} | ${major}: ${perSemester
          .map((count, index) => `s${index + 1}=${count}`)
          .join(' ')}`
      );
    }
  }
  report(minimum > 0, 'every selectable combination has slots', `lowest: ${minimum} at ${minimumWhere}`);

  // 5. the default view: first term, first major, semester 1
  const defaultTerm = terms[0];
  const defaultMajor = majors[0];
  const defaultSlots = await slotOptions(token, defaultTerm._id, defaultMajor, 1);
  report(
    defaultSlots.length > 0,
    'default view (first term, first major, semester 1) has slots',
    `${defaultSlots.length} slots`
  );

  // 6. groups for the default term are listed with their slots populated
  const templates = (await call(`/api/templates?termId=${defaultTerm._id}`, { token })).json.templates ?? [];
  report(templates.length > 0, 'schedule groups exist for the default term', `${templates.length} groups`);
  report(
    templates.every((t) => t.slots?.every((slot) => slot && typeof slot === 'object')),
    'group slots come back populated',
    templates[0] ? `${templates[0].major} sem ${templates[0].semester} ${templates[0].studyGroup}: ${templates[0].slots.length} slots` : ''
  );

  // 7. create -> publish -> assign, the flow the screen performs
  const list = (await call('/api/students?page=1&limit=50', { token })).json.students ?? [];
  const normal = list.find((s) => s.studentType === 'Normal Student');
  report(!!normal, 'found a Normal Student to assign');
  if (!normal) return;

  // assignToGroup resolves the group by the *student's* major and semester, so
  // the new group has to be for a cohort that has students in the roster.
  const chosenSlots = defaultSlots.slice(0, 6).map((slot) => slot._id);
  const created = await call('/api/templates', {
    token,
    method: 'POST',
    body: {
      major: normal.major,
      semester: normal.currentSemester,
      studyGroup: 'G2',
      termId: defaultTerm._id,
      slots: chosenSlots,
    },
  });
  report(
    created.status === 201 || created.status === 409,
    `create group G2 for ${normal.major} sem ${normal.currentSemester}`,
    `status ${created.status}: ${created.json.message ?? ''}`
  );

  const current = (await call(`/api/templates?termId=${defaultTerm._id}`, { token })).json.templates ?? [];
  // Same cohort as the create above, and the raw lean docs carry `_id`.
  const createdTemplate = current.find(
    (t) =>
      t.studyGroup === 'G2' &&
      t.major === normal.major &&
      Number(t.semester) === Number(normal.currentSemester)
  );
  if (createdTemplate) {
    const templateId = createdTemplate.id ?? createdTemplate._id;
    const published = await call(`/api/templates/${templateId}/publish`, {
      token,
      method: 'PATCH',
      body: { publicationStatus: 'Published' },
    });
    report(published.status === 200, 'publish G2 (re-runs slot validation)', `status ${published.status}: ${published.json.message ?? ''}${published.json.error ? ` (${published.json.error})` : ''}`);

    // The API serializes students as `id`, not `_id`.
    const studentId = normal.id ?? normal._id;
    const assigned = await call(`/api/students/${studentId}/group`, {
      token,
      method: 'PATCH',
      body: { studyGroup: 'G2', termId: defaultTerm._id },
    });
    report(
      assigned.status === 200 && assigned.json.slotsCount === chosenSlots.length,
      `assign ${normal.fullName} to G2`,
      `status ${assigned.status}, ${assigned.json.slotsCount ?? '?'} schedule rows: ${assigned.json.message ?? ''}${assigned.json.error ? ` (${assigned.json.error})` : ''}`
    );
  } else {
    report(false, 'G2 is listed for the default term');
  }

  console.log('');
  if (failures.length) {
    console.error(`${failures.length} API check(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('all API checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
