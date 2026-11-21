// Regression: an Advisor's tab showed "You are signed in as Administrator" on a
// role-gated page while the dashboard still said Advisor. The token is kept in
// localStorage (shared by every tab) but the user was cached per tab, so the
// cache and the token could describe two different accounts.
//   npm test        (or: node --test src/lib/sessionStore.test.mjs)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from './sessionStore.ts';

const MONA = { email: 'mona.adel@guc.edu.eg', role: 'Advisor' };
const ADMIN = { email: 'admin@guc.edu.eg', role: 'Administrator' };

/** A localStorage shared by "tabs" and a /me endpoint answering per token. */
const browser = (accounts = { 'mona-token': MONA, 'admin-token': ADMIN }) => {
  const shared = { token: null };
  const pending = [];
  let manual = false;
  const fetchUser = (token) => {
    const answer = () => (accounts[token] ? Promise.resolve(accounts[token]) : Promise.reject({ status: 401 }));
    if (!manual) return answer();
    return new Promise((resolve, reject) => pending.push({ token, release: () => answer().then(resolve, reject) }));
  };
  const tab = () => createSessionStore({
    readToken: () => shared.token,
    clearToken: () => { shared.token = null; },
    fetchUser,
  });
  return { shared, tab, pending, holdResponses: () => { manual = true; } };
};

describe('session store (role/session mismatch regression)', () => {
  it('a tab re-reads its identity when another tab signs in as someone else', async () => {
    const { shared, tab } = browser();
    shared.token = 'mona-token';
    const monaTab = tab();
    await monaTab.load();
    assert.equal(monaTab.getSnapshot().user.role, 'Advisor');

    // Another tab signs in as an Administrator: the shared token changes.
    shared.token = 'admin-token';
    assert.equal(monaTab.isCurrent(), false, 'the cached Advisor no longer matches the token requests send');
    await monaTab.ensureCurrent(); // what the storage event / next mount triggers
    assert.equal(monaTab.getSnapshot().user.role, 'Administrator', 'the tab shows the account its requests really use');

    // Mona signs in again: the same tab follows, and the Advisor routes open.
    shared.token = 'mona-token';
    await monaTab.ensureCurrent();
    assert.deepEqual(monaTab.getSnapshot(), { user: MONA, isLoading: false });
  });

  it('never presents a cached user for a different token while the new one is checked', async () => {
    const { shared, tab, pending, holdResponses } = browser();
    shared.token = 'admin-token';
    const store = tab();
    await store.load();
    holdResponses();
    shared.token = 'mona-token';
    const seen = [];
    store.subscribe((snapshot) => seen.push(snapshot.user?.role ?? (snapshot.isLoading ? 'loading' : 'signed-out')));
    const loading = store.load();
    assert.deepEqual(store.getSnapshot(), { user: null, isLoading: true });
    pending.shift().release();
    await loading;
    assert.deepEqual(seen, ['loading', 'Advisor']);
  });

  it('discards a slow /me answer for a token that was replaced meanwhile', async () => {
    const { shared, tab, pending, holdResponses } = browser();
    holdResponses();
    shared.token = 'admin-token';
    const store = tab();
    const first = store.load();          // /me for the Administrator token is slow…
    shared.token = 'mona-token';         // …and Mona signs in before it answers.
    pending.shift().release();           // the stale Administrator answer arrives
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(pending[0].token, 'mona-token', 'the stale answer triggers a read of the current token');
    pending.shift().release();
    await first;
    assert.equal(store.getSnapshot().user.role, 'Advisor');
    assert.equal(store.isCurrent(), true);
  });

  it('keeps the cache and makes no request while the token is unchanged', async () => {
    const { shared, tab } = browser();
    let calls = 0;
    const store = createSessionStore({ readToken: () => shared.token, clearToken: () => {}, fetchUser: async () => { calls += 1; return MONA; } });
    shared.token = 'mona-token';
    await store.ensureCurrent();
    await store.ensureCurrent();
    await Promise.all([store.ensureCurrent(), store.ensureCurrent()]);
    assert.equal(calls, 1);
    assert.ok(tab);
  });

  it('signing out elsewhere or a rejected token leaves no user, so guards send to sign-in', async () => {
    const { shared, tab } = browser();
    shared.token = 'mona-token';
    const store = tab();
    await store.load();
    shared.token = null;
    await store.ensureCurrent();
    assert.deepEqual(store.getSnapshot(), { user: null, isLoading: false });

    shared.token = 'revoked-token';
    await store.load();
    assert.equal(shared.token, null, 'a 401 clears the dead token');
    assert.deepEqual(store.getSnapshot(), { user: null, isLoading: false });
  });
});
