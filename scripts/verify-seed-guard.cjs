/**
 * Verifies the boot-time seed guard against a throwaway database.
 *
 * The whole point of the change is that a restart must never destroy data, so
 * the test has to prove both halves of the decision:
 *
 *   1. an empty database still gets seeded on boot (a fresh clone still works);
 *   2. a populated one is skipped, and the rows already in it survive the
 *      restart untouched;
 *   3. GET /api/auth/seed — the one route that still wipes — is closed to
 *      everyone except an Administrator.
 *
 * All of it happens against a scratch database derived from MONGODB_URI, which
 * is dropped again at the end — the real database is never written to. That
 * matters most for check 3: proving an Administrator is *allowed* through
 * means actually letting it through and re-seeding.
 *
 *   node scripts/verify-seed-guard.cjs
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require(path.join(__dirname, '..', 'server', 'node_modules', 'mongoose'));

require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const ROOT = path.join(__dirname, '..');
// Not 5060: that is the SIP port and sits on the WHATWG "bad port" list, which
// undici's fetch refuses outright with `cause: bad port` — no connection is even
// attempted, so the gate checks below would fail for a reason that has nothing
// to do with the gate. Node's own http.get does not apply that list, which is
// what makes this so confusing to diagnose.
const PORT = Number(process.env.SEED_GUARD_PORT || 5080);
const SCRATCH_DB = 'eng_victims_seedguard_scratch';
const STARTUP_TIMEOUT_MS = 240_000; // a cold seed takes ~60s, the rest is margin

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Replaces the database name in a MongoDB URI, keeping auth and query intact. */
const scratchUri = (uri) => {
  const [withoutQuery, query] = uri.split('?');
  const cut = withoutQuery.lastIndexOf('/');
  const base = withoutQuery.slice(0, cut + 1); // everything up to and incl. "/"
  return query ? `${base}${SCRATCH_DB}?${query}` : `${base}${SCRATCH_DB}`;
};

/**
 * Boots the real server and resolves once it is listening, with everything it
 * printed along the way. The child is returned so the caller can stop it.
 */
const bootServer = (uri) =>
  new Promise((resolve, reject) => {
    // cwd = server/, exactly as `npm --prefix server run dev` sets it. server.js
    // calls dotenv.config() with no path, so it reads `<cwd>/.env` — spawning
    // from the repo root would silently pick up the frontend's .env instead and
    // fall back to a local MongoDB.
    const child = spawn(process.execPath, ['server.js'], {
      cwd: path.join(ROOT, 'server'),
      env: { ...process.env, MONGODB_URI: uri, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`server did not start within ${STARTUP_TIMEOUT_MS}ms\n${output}`));
    }, STARTUP_TIMEOUT_MS);

    const onData = (chunk) => {
      const text = chunk.toString();
      output += text;
      // Echo only until the server is up; the listener stays attached so the
      // child's pipe keeps draining and its later logs remain inspectable.
      if (!settled) process.stdout.write(`      | ${text.trimEnd().replace(/\n/g, '\n      | ')}\n`);

      if (/Server running on port/.test(text) && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ child, output });
      }
      if (/Startup error:|Could not connect to MongoDB/.test(text) && !settled) {
        settled = true;
        clearTimeout(timer);
        child.kill('SIGKILL');
        reject(new Error(`server failed to start\n${output}`));
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`server exited with code ${code} before listening\n${output}`));
      }
    });
  });

const stopServer = (child) =>
  new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();

    // Only force-kill if the graceful stop actually stalls. Leaving this armed
    // after the child has exited would let it fire at a recycled PID and take
    // down whatever server boots next instead.
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    force.unref();
    child.once('exit', () => {
      clearTimeout(force);
      resolve();
    });
    child.kill('SIGTERM');
  });

const readState = async (uri) => {
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 30000 }).asPromise();
  try {
    const db = conn.db;
    const [users, students, courses] = await Promise.all([
      db.collection('users').countDocuments(),
      db.collection('students').countDocuments(),
      db.collection('courses').countDocuments(),
    ]);
    const marker = await db.collection('__seed_guard_marker').findOne({ name: 'survives-restart' });
    return { users, students, courses, marker };
  } finally {
    await conn.close();
  }
};

/** The seeded password, from the README's table of demo logins. */
const DEMO_PASSWORD = 'password123';

/** Picks a live account of the given role out of the scratch database. */
const findAccount = async (uri, role) => {
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 30000 }).asPromise();
  try {
    const doc = await conn.db.collection('users').findOne({ role, isActive: true });
    return doc ? doc.email : null;
  } finally {
    await conn.close();
  }
};

const login = async (email) => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login rejected for ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()).token;
};

/**
 * Same login, but a structured result instead of an exception.
 *
 * A JWT is a string too, so "returned a string means it failed" would misread
 * a success as an error — which is exactly how this reported two valid tokens
 * as login failures.
 */
const tryLogin = async (email) => {
  try {
    return { ok: true, token: await login(email) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

/**
 * Calls the API and reports the outcome as data, so a network problem reads as
 * a failed check with a cause instead of aborting the whole run.
 */
const request = async (pathname, token) => {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}${pathname}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { ok: true, status: res.status };
  } catch (err) {
    const cause = err.cause;
    return {
      ok: false,
      status: null,
      error: `${err.message}${cause ? ` | ${cause.message}${cause.code ? ` (${cause.code})` : ''}` : ''}`,
    };
  }
};

/** The wipe route — anonymous callers only ever get a 401 out of it. */
const getSeedEndpoint = (token) => request('/api/auth/seed', token);

/** Reachability check against a route that cannot destroy anything. */
const probeServer = () => request('/api/auth/me', null);

const dropScratch = async (uri) => {
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 30000 }).asPromise();
  try {
    await conn.db.dropDatabase();
  } finally {
    await conn.close();
  }
};

/**
 * The wipe route must stay shut for everyone but an Administrator.
 *
 * This runs against the scratch database precisely because the success case
 * really does rebuild it.
 */
const checkSeedGate = async (uri, child) => {
  // Liveness first: if the server died, every later number would be a red
  // herring rather than evidence about the gate.
  check('server process is still alive', child.exitCode === null, `exitCode ${child.exitCode}`);

  const probe = await probeServer();
  check('server is still listening', probe.ok, probe.ok ? `status ${probe.status}` : probe.error);
  if (!probe.ok) return;

  const advisor = await findAccount(uri, 'Advisor');
  const admin = await findAccount(uri, 'Administrator');
  check('scratch database has an Advisor and an Administrator', Boolean(advisor && admin), `${advisor}, ${admin}`);
  if (!advisor || !admin) return;

  const anonymous = await getSeedEndpoint(null);
  check(
    'anonymous request is rejected',
    anonymous.ok && anonymous.status === 401,
    anonymous.ok ? `status ${anonymous.status}` : anonymous.error
  );

  const advisorLogin = await tryLogin(advisor);
  if (!advisorLogin.ok) {
    check('an Advisor cannot trigger the wipe', false, advisorLogin.error);
  } else {
    const asAdvisor = await getSeedEndpoint(advisorLogin.token);
    check(
      'an Advisor cannot trigger the wipe',
      asAdvisor.ok && asAdvisor.status === 403,
      asAdvisor.ok ? `status ${asAdvisor.status}` : asAdvisor.error
    );
  }

  const adminLogin = await tryLogin(admin);
  if (!adminLogin.ok) {
    check('an Administrator can still trigger it', false, adminLogin.error);
  } else {
    const asAdmin = await getSeedEndpoint(adminLogin.token);
    check(
      'an Administrator can still trigger it',
      asAdmin.ok && asAdmin.status === 200,
      asAdmin.ok ? `status ${asAdmin.status}` : asAdmin.error
    );
  }
};

const main = async () => {
  const base = process.env.MONGODB_URI;
  if (!base) throw new Error('MONGODB_URI is not set — run this from the repo root with server/.env present');

  const uri = scratchUri(base);
  console.log(`Scratch database: ${SCRATCH_DB} (the real one is not touched)\n`);

  // Start from a guaranteed-empty state.
  await dropScratch(uri);

  let firstRun;
  let secondRun;
  let thirdRun;

  try {
    console.log('\n[1/5] First boot against an EMPTY database');
    firstRun = await bootServer(uri);
    check('empty database is seeded on boot', /Seeded \d+ users/.test(firstRun.output), 'logged "Seeded ..."');
    check('boot reports a seed, not a skip', !/seed skipped/.test(firstRun.output));

    const afterFirst = await readState(uri);
    check(
      'seed produced core data',
      afterFirst.users > 0 && afterFirst.students > 0 && afterFirst.courses > 0,
      `${afterFirst.users} users, ${afterFirst.students} students, ${afterFirst.courses} courses`
    );
    await stopServer(firstRun.child);
    firstRun = null;

    // A marker standing in for anything a user created at runtime.
    const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 30000 }).asPromise();
    await conn.db.collection('__seed_guard_marker').insertOne({ name: 'survives-restart', createdAt: new Date() });
    const before = {
      users: await conn.db.collection('users').countDocuments(),
      students: await conn.db.collection('students').countDocuments(),
      courses: await conn.db.collection('courses').countDocuments(),
    };
    await conn.close();
    console.log(`\n      marker inserted; counts before restart: ${JSON.stringify(before)}`);

    console.log('\n[2/5] Second boot against the POPULATED database');
    secondRun = await bootServer(uri);
    check('populated database skips the seed', /seed skipped/.test(secondRun.output), 'logged "seed skipped"');
    check('second boot does not re-seed', !/Seeded \d+ users/.test(secondRun.output));

    const after = await readState(uri);
    check(
      'row counts are unchanged after restart',
      after.users === before.users && after.students === before.students && after.courses === before.courses,
      `${after.users}/${after.students}/${after.courses} vs ${before.users}/${before.students}/${before.courses}`
    );
    check('runtime data survives the restart', Boolean(after.marker), 'marker still present');
    await stopServer(secondRun.child);
    secondRun = null;

    console.log('\n[3/5] Third boot — restarts must be idempotent');
    thirdRun = await bootServer(uri);
    check('third boot also skips', /seed skipped/.test(thirdRun.output));
    const afterThird = await readState(uri);
    check('marker survives a second restart', Boolean(afterThird.marker));

    // Reuses the still-running third boot; the Administrator case re-seeds the
    // scratch database, which is the last thing that touches it before the drop.
    console.log('\n[4/5] GET /api/auth/seed — the route that still wipes');
    await checkSeedGate(uri, thirdRun.child);
    await stopServer(thirdRun.child);
    thirdRun = null;
  } finally {
    await stopServer(firstRun?.child);
    await stopServer(secondRun?.child);
    await stopServer(thirdRun?.child);
    console.log('\n[5/5] Dropping the scratch database');
    await dropScratch(uri);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.error('FAILURES:\n' + failed.map((f) => `  - ${f.name}: ${f.detail}`).join('\n'));
    process.exit(1);
  }
  console.log('Seed guard verified: empty database seeds, populated database is left alone,');
  console.log('and only an Administrator can reach the wipe route.');
};

main().catch((err) => {
  // Report whatever did run before dying, so a failure points at a check
  // rather than at a bare stack trace.
  const failed = results.filter((r) => !r.ok);
  if (results.length) {
    console.log(`\n${results.length - failed.length}/${results.length} checks passed before the error`);
    if (failed.length) console.error('FAILURES:\n' + failed.map((f) => `  - ${f.name}: ${f.detail}`).join('\n'));
  }
  console.error(`\n${err.message}`);
  process.exit(1);
});
