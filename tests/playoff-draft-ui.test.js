// The round-draft budget view: the pure function the draft page binds its
// budget bar and submit button to. Extracted from playoff-draft.html and run
// against the real FRPlayoffGame/FRBudget modules.
const test = require('node:test');
const assert = require('node:assert');
const { read, fn, load } = require('./extract');
const FRPlayoffGame = require('../js/playoff-game.js');

const PAGE = read('playoff-draft.html');
const view = load([fn(PAGE, 'draftBudgetView')], ['draftBudgetView'], { FRPlayoffGame }).draftBudgetView;

const SETTINGS = { gameType: 'playoff', playoffGame: { total: 240000, superBowlFloor: 40000, pool: 200000 } };

test('Wild Card: the pool is the cap, floor is reserved, submit needs a full roster', () => {
  const v = view(SETTINGS, {}, 1, 60000, 5, 9);
  assert.strictEqual(v.available, 200000);   // full pool at round 1
  assert.strictEqual(v.spent, 60000);
  assert.strictEqual(v.remaining, 140000);
  assert.strictEqual(v.reservedFloor, 40000);
  assert.strictEqual(v.over, false);
  assert.strictEqual(v.complete, false);     // only 5 of 9 filled
  assert.strictEqual(v.canSubmit, false);
});

test('a full roster within budget can submit', () => {
  const v = view(SETTINGS, {}, 1, 180000, 9, 9);
  assert.strictEqual(v.remaining, 20000);
  assert.strictEqual(v.complete, true);
  assert.strictEqual(v.canSubmit, true);
});

test('over budget blocks submit and reports the overage', () => {
  const v = view(SETTINGS, {}, 2, 150000, 9, 9); // only 130k of pool left entering Divisional after 70k... but here priorCosts empty
  // priorCosts empty → entering round 2 still sees full pool 200k; spend 150k is fine
  assert.strictEqual(v.over, false);
  // Now with 150k already committed in round 1, round 2 has 50k of pool left:
  const v2 = view(SETTINGS, { 1: 150000 }, 2, 60000, 9, 9);
  assert.strictEqual(v2.available, 50000);
  assert.strictEqual(v2.over, true);
  assert.strictEqual(v2.overBy, 10000);
  assert.strictEqual(v2.canSubmit, false);
});

test('Super Bowl opens the floor + carryover', () => {
  const v = view(SETTINGS, { 1: 70000, 2: 60000, 3: 55000 }, 4, 50000, 9, 9);
  assert.strictEqual(v.isSuperBowl, true);
  assert.strictEqual(v.available, 55000);    // 240k - 185k spent in rounds 1-3
  assert.strictEqual(v.carryover, 15000);
  assert.strictEqual(v.remaining, 5000);
  assert.strictEqual(v.canSubmit, true);
});

test('pctUsed tracks spend against the round cap and never exceeds 100', () => {
  assert.strictEqual(view(SETTINGS, {}, 1, 100000, 9, 9).pctUsed, 50);
  assert.strictEqual(view(SETTINGS, {}, 1, 260000, 9, 9).pctUsed, 100); // over → capped at 100
  assert.strictEqual(view(SETTINGS, {}, 1, 0, 0, 9).pctUsed, 0);
});
