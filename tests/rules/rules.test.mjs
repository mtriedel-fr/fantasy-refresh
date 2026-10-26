// Database security rules, run against the real Firebase emulator in CI
// (.github/workflows/rules-tests.yml). Not part of `node --test tests/*.test.js`
// because it needs the emulator running.
//
// What they protect (member privacy fix, Oct 2026):
//  - email and dues payment claims live in /memberPrivate/{league}/{uid}:
//    readable only by that member and the league's commissioners
//  - the public member record can't hold email or claims, and only a
//    commissioner can mark someone Paid
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, get, set, update } from 'firebase/database';

let env;
const L = 'fr_test';
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'fr-rules-test',
    database: { rules: fs.readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9000 }
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async ctx => {
    await set(ref(ctx.database(), '/'), {
      leagues: { fr_refresh26: { settings: { commissioners: { comm: true } } }, [L]: { // shared caches use the main league's commissioners
        settings: { commissioners: { comm: true }, createdBy: 'owner', name: 'Test' },
        members: {
          alice: { uid: 'alice', teamName: 'A', duesPaid: false, email: 'legacy@x.com' }, // legacy email still public until the move
          bob: { uid: 'bob', teamName: 'B' }
        }
      } },
      memberPrivate: { [L]: {
        alice: { email: 'alice@x.com', duesClaimedAt: 1, duesClaim: { method: 'Venmo', paidOn: '2026-10-20' } },
        bob: { email: 'bob@x.com' }
      } },
      users: { alice: { leagues: { [L]: { teamName: 'A' } } } },
      computedFantasyHistory: { standard: { 2025: { 'old player': { weeks: [1], cachedAt: 1, schemaVersion: 6 }, 'current player': { weeks: [1], cachedAt: 1, schemaVersion: 7 } } } }
    });
  });
});
const db = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();
const P = uid => `memberPrivate/${L}/${uid}`;
const M = uid => `leagues/${L}/members/${uid}`;

test('public member list is still readable by anyone', async () => {
  await assertSucceeds(get(ref(db(null), `leagues/${L}/members`)));
});

test('private details: only the member and commissioners can read', async () => {
  await assertFails(get(ref(db(null), P('alice'))));
  await assertFails(get(ref(db('bob'), P('alice'))));
  await assertFails(get(ref(db('bob'), `memberPrivate/${L}`)));
  await assertSucceeds(get(ref(db('alice'), P('alice'))));
  await assertSucceeds(get(ref(db('comm'), `memberPrivate/${L}`)));
  await assertSucceeds(get(ref(db('owner'), `memberPrivate/${L}`)));
});

test('a member can save their own claim and email, not someone else\'s', async () => {
  await assertSucceeds(update(ref(db('bob'), P('bob')), { duesClaimedAt: 2, duesClaim: { method: 'PayPal', paidOn: '2026-10-21', from: '@bob' } }));
  await assertSucceeds(update(ref(db('bob'), P('bob')), { email: 'new@x.com' }));
  await assertFails(update(ref(db('bob'), P('alice')), { duesClaimedAt: 3 }));
  await assertFails(update(ref(db('bob'), P('bob')), { duesPaid: true }));            // no other fields
  await assertFails(update(ref(db('bob'), P('bob')), { duesClaim: { method: 'Venmo' } })); // incomplete claim
});

test('a commissioner can clear a claim', async () => {
  await assertSucceeds(update(ref(db('comm'), P('alice')), { duesClaimedAt: null, duesClaim: null }));
});

test('only a commissioner can mark someone Paid', async () => {
  await assertFails(set(ref(db('alice'), M('alice') + '/duesPaid'), true));
  await assertFails(update(ref(db('alice'), M('alice')), { duesPaid: true }));
  await assertSucceeds(set(ref(db('comm'), M('alice') + '/duesPaid'), true));
  await assertSucceeds(set(ref(db('owner'), M('bob') + '/duesPaid'), true));
});

test('the public member record rejects email and claims', async () => {
  await assertFails(update(ref(db('alice'), M('alice')), { email: 'a@x.com' }));
  await assertFails(update(ref(db('alice'), M('alice')), { duesClaimedAt: 5 }));
  await assertFails(update(ref(db('comm'), M('alice')), { email: 'a@x.com' }));
});

test('normal member edits still work (even before old emails are moved)', async () => {
  await assertSucceeds(update(ref(db('alice'), M('alice')), { teamName: 'Renamed' }));
  // joinLeague shape: whole record, no email
  await assertSucceeds(set(ref(db('carol'), M('carol')), { uid: 'carol', displayName: 'C', teamName: "C's Team", joined: 1, role: 'member', active: true, eliminated: false }));
  await assertFails(set(ref(db('carol'), M('bob')), { uid: 'bob', teamName: 'hijack' }));
  // the one-time move / unpaid toggle can delete old public fields
  await assertSucceeds(update(ref(db('comm'), M('alice')), { email: null, duesClaimedAt: null, duesClaim: null }));
});

test('/users never holds email', async () => {
  await assertFails(update(ref(db('alice'), 'users/alice'), { email: 'a@x.com' }));
  await assertSucceeds(update(ref(db('alice'), `users/alice/leagues/${L}`), { teamName: 'A2' }));
});

test('player-card cache: any member can fill a miss or upgrade an old entry, not overwrite a current one', async () => {
  const C = 'computedFantasyHistory/standard/2025/';
  const entry = v => ({ weeks: [{ week: 1, pts: 10 }], cachedAt: 2, schemaVersion: v });
  await assertSucceeds(set(ref(db('bob'), C + 'new player'), entry(7)));      // cache miss
  await assertSucceeds(set(ref(db('bob'), C + 'old player'), entry(7)));      // older schema → refresh
  await assertFails(set(ref(db('bob'), C + 'current player'), entry(7)));     // already current → no overwrite
  await assertFails(set(ref(db('bob'), C + 'current player'), null));         // can't delete
  await assertFails(set(ref(db(null), C + 'another'), entry(7)));             // must be signed in
  await assertFails(set(ref(db('bob'), C + 'junk'), { hello: 'x' }));         // must look like a cache entry
  await assertSucceeds(set(ref(db('comm'), C + 'current player'), entry(7))); // commissioners can always fix
});
