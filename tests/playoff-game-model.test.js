// The Playoff Game data model: the four rounds, the round<->week mapping, the
// gameType detector, and a manager's live budget derived from their saved
// per-round roster costs. Pure logic, runs in the normal suite.
const test = require('node:test');
const assert = require('node:assert');
const G = require('../js/playoff-game.js');

const SETTINGS = { gameType: 'playoff', playoffGame: {
  total: 240000, superBowlFloor: 40000, pool: 200000,
  scoring: { intThrown: -2, fumbleLost: -2, bonuses: { pass: { yards: 350, points: 3 } } },
  entryFee: 25
} };

test('isPlayoffGame reads gameType on settings or context', () => {
  assert.strictEqual(G.isPlayoffGame(SETTINGS), true);
  assert.strictEqual(G.isPlayoffGame({ gameType: 'season' }), false);
  assert.strictEqual(G.isPlayoffGame({ format: 'cumulative' }), false);
  assert.strictEqual(G.isPlayoffGame(null), false);
});

test('four rounds map 1:1 onto weeks 1-4', () => {
  const rs = G.rounds();
  assert.strictEqual(rs.length, 4);
  assert.deepStrictEqual(rs.map(r => r.key), ['wildcard', 'divisional', 'conference', 'superbowl']);
  assert.strictEqual(G.weekForRound(3), 3);
  assert.strictEqual(G.roundForWeek(4).key, 'superbowl');
  assert.strictEqual(G.roundForWeek(5), null);
  assert.strictEqual(G.round('conference').index, 3);
});

test('config normalizes the budget, rounds, roster and scoring', () => {
  const c = G.config(SETTINGS);
  assert.strictEqual(c.budget.total, 240000);
  assert.strictEqual(c.budget.pool, 200000);
  assert.strictEqual(c.rounds.length, 4);
  assert.deepStrictEqual(c.roster, { qb: 1, rb: 2, wr: 3, te: 1, flex: 1, def: 1 });
  assert.strictEqual(c.entryFee, 25);
  assert.strictEqual(c.scoring.bonuses.pass.yards, 350);
  // A league with no playoffGame block still gets sane budget defaults.
  const d = G.config({ gameType: 'playoff' });
  assert.strictEqual(d.budget.total, 240000);
});

test('spentBefore sums the earlier rounds only (missing = not yet drafted)', () => {
  const costs = { 1: 70000, 2: 60000, 3: 55000 }; // Super Bowl not drafted yet
  assert.strictEqual(G.spentBefore(costs, 1), 0);        // entering Wild Card
  assert.strictEqual(G.spentBefore(costs, 2), 70000);    // entering Divisional
  assert.strictEqual(G.spentBefore(costs, 4), 185000);   // entering Super Bowl
  // Round keys work too.
  assert.strictEqual(G.spentBefore({ wildcard: 70000, divisional: 60000 }, 3), 130000);
});

test('budgetState ties saved costs to the budget engine', () => {
  const costs = { 1: 70000, 2: 60000, 3: 55000 };
  const wc = G.budgetState(SETTINGS, costs, 1);
  assert.strictEqual(wc.available, 200000);     // full pool at Wild Card
  assert.strictEqual(wc.reservedFloor, 40000);
  assert.strictEqual(wc.spentThisRound, 70000);
  assert.strictEqual(wc.roundLabel, 'Wild Card');

  const sb = G.budgetState(SETTINGS, costs, 4);
  assert.strictEqual(sb.isSuperBowl, true);
  assert.strictEqual(sb.available, 55000);      // 240k - 185k spent in rounds 1-3
  assert.strictEqual(sb.carryover, 15000);      // unspent pool (200k - 185k)
});

test('canAfford honors the per-round cap given earlier spend', () => {
  const costs = { 1: 150000 }; // already deep into the pool after Wild Card
  // Entering Divisional, only 50k of pool remains.
  assert.strictEqual(G.canAfford(SETTINGS, costs, 2, 50000), true);
  assert.strictEqual(G.canAfford(SETTINGS, costs, 2, 60000), false);
  // The Super Bowl opens the reserved floor back up.
  assert.strictEqual(G.canAfford(SETTINGS, { 1: 120000, 2: 80000 }, 4, 40000), true);
});
