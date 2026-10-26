// Member privacy: email and dues payment claims live in the private record
// (/memberPrivate/{league}/{uid}); pages fall back to the old public fields
// until the one-time move has run. Rules themselves: tests/rules/.
const test = require('node:test');
const assert = require('node:assert');
const { read, fn, load } = require('./extract');

const LEAGUE = read('league.html');
const H = load([fn(LEAGUE, 'emailOf'), fn(LEAGUE, 'claimOf')], ['emailOf', 'claimOf']);

test('email: private record first, old public field as fallback', () => {
  assert.strictEqual(H.emailOf({ email: 'old@x.com' }, { email: 'new@x.com' }), 'new@x.com');
  assert.strictEqual(H.emailOf({ email: 'old@x.com' }, null), 'old@x.com');
  assert.strictEqual(H.emailOf({}, undefined), '');
});

test('dues claim: private record first, old public field as fallback', () => {
  const claim = { method: 'Venmo', paidOn: '2026-10-20' };
  assert.strictEqual(H.claimOf({}, { duesClaimedAt: 5, duesClaim: claim }).at, 5);
  assert.strictEqual(H.claimOf({ duesClaimedAt: 7 }, {}).at, 7);
  assert.strictEqual(H.claimOf({}, {}).at, 0);
});

test('no page writes email onto the public member record', () => {
  // The member-record writes in each signup/join/create flow: none may carry email.
  const memberWrites = (src) => [...src.matchAll(/(?:dbSet|frDbSet|FR\.fb\.put)\([^)]*?members\/[^{]*\{([\s\S]*?)\}\)/g)].map(m => m[1]);
  for (const f of ['js/auth.js', 'league-setup.html', 'index.html']) {
    const writes = memberWrites(read(f));
    assert.ok(writes.length > 0, `${f}: found the member writes`);
    writes.forEach(w => assert.ok(!/\bemail\s*:/.test(w), `${f} writes email: ${w.slice(0, 80)}`));
  }
});

test('dues claim is saved to the private record, with a fallback before the rules are live', () => {
  const s = read('js/dues-alert.js');
  assert.ok(s.includes('FR.fb.patch(privPath, body)'));
  assert.ok(s.includes('return FR.fb.patch(FR.paths.member(user.uid), body)'));
});

test('league-context exposes the private paths and an authenticated read', () => {
  const s = read('league-context.js');
  assert.ok(s.includes("return '/memberPrivate/' + ctx().leagueId;"));
  assert.ok(/getAuth: function\(path\)/.test(s));
});
