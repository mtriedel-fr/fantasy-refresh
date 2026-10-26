// Dues pop-up (js/dues-alert.js): who sees it, and the trackers show "Says paid".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/dues-alert.js'), 'utf8'), ctx);
const { shouldShow, feeText, dayKey } = ctx.FRDuesAlert;

const NOW = new Date(2026, 9, 26, 12).getTime();
const settings = { commissioners: { comm1: true }, createdBy: 'owner', entryFee: 100 };

test('unpaid member sees the dues pop-up', () => {
  assert.strictEqual(shouldShow({ teamName: 'A' }, 'u1', settings, null, NOW), true);
  assert.strictEqual(shouldShow({ teamName: 'A', duesPaid: false }, 'u1', settings, null, NOW), true);
});

test('paid members, "I\'ve paid" claims and commissioners do not', () => {
  assert.strictEqual(shouldShow({ duesPaid: true }, 'u1', settings, null, NOW), false);
  assert.strictEqual(shouldShow({ duesClaimedAt: NOW - 1000 }, 'u1', settings, null, NOW), false);
  assert.strictEqual(shouldShow({}, 'comm1', settings, null, NOW), false);
  assert.strictEqual(shouldShow({}, 'owner', settings, null, NOW), false);
  assert.strictEqual(shouldShow(null, 'u1', settings, null, NOW), false); // not in this league
});

test('"Remind me later" hides it for the rest of the day only', () => {
  assert.strictEqual(shouldShow({}, 'u1', settings, dayKey(NOW), NOW), false);
  assert.strictEqual(shouldShow({}, 'u1', settings, dayKey(NOW), NOW + 24 * 3600e3), true);
});

test('commissioner can switch reminders off', () => {
  assert.strictEqual(shouldShow({}, 'u1', Object.assign({}, settings, { duesReminder: false }), null, NOW), false);
});

test('entry fee text', () => {
  assert.strictEqual(feeText({ entryFee: 100 }), '$100');
  assert.strictEqual(feeText({ entryFee: 0 }), '');
  assert.strictEqual(feeText({}), '');
});

test('pop-up is loaded on home, league and draft pages', () => {
  for (const f of ['home.html', 'league.html', 'draft.html']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(s.includes('src="/js/dues-alert.js"'), f);
    assert.ok(s.includes('FRDuesAlert.check()'), f);
  }
});

test('trackers show the claim and clearing it re-prompts', () => {
  const s = fs.readFileSync(path.join(ROOT, 'league.html'), 'utf8');
  assert.ok(s.includes('Says paid · '));
  assert.ok(s.includes('function clearDuesClaim(uid)'));
  assert.ok(s.includes('duesPaid: false, duesClaimedAt: null, duesClaim: null'));
  assert.ok(s.includes('{ duesClaimedAt: null, duesClaim: null }'));
});

test('"I\'ve paid" asks how and when, and checks the answers', () => {
  const { buildClaim } = ctx.FRDuesAlert;
  const ok = buildClaim({ method: 'Venmo', paidOn: '2026-10-20', from: '  @py-smith ' }, NOW);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ok.claim)), { method: 'Venmo', paidOn: '2026-10-20', from: '@py-smith' });
  assert.ok(!('from' in buildClaim({ method: 'Cash', paidOn: '2026-10-26' }, NOW).claim));
  assert.match(buildClaim({ paidOn: '2026-10-20' }, NOW).error, /how you paid/);
  assert.match(buildClaim({ method: 'Bitcoin', paidOn: '2026-10-20' }, NOW).error, /how you paid/);
  assert.match(buildClaim({ method: 'Venmo', paidOn: '' }, NOW).error, /date/);
  assert.match(buildClaim({ method: 'Venmo', paidOn: '2026-10-27' }, NOW).error, /future/);
});

test('commissioner tracker reads the claim as "Venmo · Oct 20 · from @handle"', () => {
  const { read, fn } = require('./extract.js');
  const duesClaimText = new Function(fn(read('league.html'), 'duesClaimText') + '; return duesClaimText;')();
  assert.strictEqual(duesClaimText({ method: 'Venmo', paidOn: '2026-10-20', from: '@py' }, 1), 'Venmo · Oct 20 · from @py');
  assert.strictEqual(duesClaimText({ method: 'Cash', paidOn: '2026-10-05' }, 1), 'Cash · Oct 5');
});
