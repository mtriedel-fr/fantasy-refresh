// Experience review fixes (Oct 27, 2026).
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { read, fn, load } = require('./extract');

test('tier playoff timing is per-league via the shared config, originals preserved', () => {
  const L = read('league.html'), P = read('playoffs.html');
  const { config } = require('../js/playoff-config.js');
  // Both playoff screens now load the one shared config instead of each
  // hard-coding its own copy of the tier constants.
  assert.ok(L.includes('js/playoff-config.js') && P.includes('js/playoff-config.js'), 'both pages load playoff-config.js');
  assert.ok(L.includes('applyPlayoffConfig'), 'league.html applies per-league config');
  // The original league is unchanged: tiers, lock after Week 14, playoffs 15–17.
  const base = config({ format: 'cumulative' }, '2026');
  assert.deepStrictEqual([base.lockWeek, base.weeks], [14, [15, 16, 17]]);
  // The 2025 archive keeps its 18-week schedule: lock after 15, playoffs 16–18.
  const arch = config({ format: 'cumulative' }, '2025');
  assert.deepStrictEqual([arch.lockWeek, arch.weeks], [15, [16, 17, 18]]);
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
