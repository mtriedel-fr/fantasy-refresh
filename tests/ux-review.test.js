// Experience review fixes (Oct 27, 2026).
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { read, fn, load } = require('./extract');

test('playoffs: groups set after Week 14, playoffs Weeks 15–17 on both playoff screens', () => {
  const L = read('league.html'), P = read('playoffs.html');
  assert.ok(L.includes('var TIER_LOCK_WEEK = 14;') && L.includes('var PLAYOFF_WEEKS = [15, 16, 17];'));
  assert.ok(P.includes("var TIER_LOCK_WEEK = PO_SEASON === '2025' ? 15 : 14;"));
  assert.ok(P.includes("var PLAYOFF_WEEKS = PO_SEASON === '2025' ? [16, 17, 18] : [15, 16, 17];"));
  for (const [name, s] of [['league', L], ['playoffs', P]]) {
    assert.ok(!/getWeeklyScores\(1[5-8]\)/.test(s), `${name}: no hard-coded playoff week`);
    assert.ok(!/['"][^'"\n]*Weeks 16–18/.test(s), `${name}: no stale "Weeks 16–18" text on screen`);
  }
});

test('Playoffs page reads this season\'s scores (it used to see "Week 0")', () => {
  const { normalizeSeason } = load([fn(read('playoffs.html'), 'normalizeSeason')], ['normalizeSeason']);
  const out = normalizeSeason({ meta: { week: 7 }, '1': { u1: { team: 'A', score: 100.5 }, u2: { team: 'B', score: '90' } }, '2': [{ name: 'A', score: 1 }] });
  assert.deepStrictEqual(Object.keys(out).sort(), ['1', '2']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out['1'])), [{ uid: 'u1', name: 'A', score: 100.5 }, { uid: 'u2', name: 'B', score: 90 }]);
});

test('dues and injury pop-ups wait their turn', () => {
  for (const f of ['js/dues-alert.js', 'js/injury-alert.js']) {
    const s = read(f);
    assert.ok(s.includes('function whenClear(fn)') && s.includes('whenClear(function () { show('), f);
    assert.ok(s.includes("'welcome-tour-overlay', 'fr-dues-alert', 'fr-injury-alert'"), f);
  }
});

test('draft page tells first-timers how to start', () => {
  const s = read('draft.html');
  assert.ok(s.includes('id="roster-hint"') && s.includes('Tap any position below to see players and add them.'));
  assert.ok(s.includes("msg.textContent='Tap a position above to pick a player'"));
});

test('league page shows Week Wrap once (not again inside the standings)', () => {
  assert.ok(!/wrap\.innerHTML = buildLandingRecapCard\(\)/.test(read('league.html')));
});

test('welcome page is shorter and ends with a sign-up button', () => {
  const s = read('welcome.html');
  assert.ok(!s.includes('Why We Built This'));
  assert.ok(s.includes('href="/auth.html?mode=signup" class="btn-primary"'));
});
