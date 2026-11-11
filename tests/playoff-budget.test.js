// The Playoff Game budget engine: one bank across four rounds, a Super Bowl
// floor held back during rounds 1-3, and unspent pool carrying into the Super
// Bowl. Pure logic, so this runs in the normal `node --test` suite.
const test = require('node:test');
const assert = require('node:assert');
const B = require('../js/playoff-budget.js');

test('normalize: defaults and the pool = total - floor', () => {
  const cfg = B.normalize({ total: 240000, superBowlFloor: 40000 });
  assert.strictEqual(cfg.total, 240000);
  assert.strictEqual(cfg.superBowlFloor, 40000);
  assert.strictEqual(cfg.pool, 200000);
  // Empty input falls back to the defaults rather than $0.
  const d = B.normalize();
  assert.strictEqual(d.total, 240000);
  assert.strictEqual(d.pool, 200000);
});

test('normalize: a floor bigger than the total never yields a negative pool', () => {
  const cfg = B.normalize({ total: 50000, superBowlFloor: 80000 });
  assert.strictEqual(cfg.superBowlFloor, 50000); // clamped down to the total
  assert.strictEqual(cfg.pool, 0);
});

test('rounds 1-3 can only spend the pool; the floor stays reserved', () => {
  const cfg = B.normalize({ total: 240000, superBowlFloor: 40000 });
  // Entering Wild Card with nothing spent: the whole pool, not the whole budget.
  assert.strictEqual(B.availableForRound(cfg, 1, 0), 200000);
  // After spending 70k in Wild Card, Divisional sees the rest of the pool.
  assert.strictEqual(B.availableForRound(cfg, 2, 70000), 130000);
  // Spend up to the pool across rounds 1-3 and nothing more is available.
  assert.strictEqual(B.availableForRound(cfg, 3, 200000), 0);
  // You can never reach into the reserved floor during the pool rounds.
  assert.strictEqual(B.availableForRound(cfg, 3, 180000), 20000);
});

test('the Super Bowl opens the whole remaining bank (floor + carryover)', () => {
  const cfg = B.normalize({ total: 240000, superBowlFloor: 40000 });
  // Spent the full pool in rounds 1-3 → Super Bowl has exactly the floor.
  assert.strictEqual(B.availableForRound(cfg, 4, 200000), 40000);
  // Spent only 150k → Super Bowl has floor 40k + 50k carried over = 90k.
  assert.strictEqual(B.availableForRound(cfg, 4, 150000), 90000);
  // Spent nothing at all → the entire budget is available for the Super Bowl.
  assert.strictEqual(B.availableForRound(cfg, 4, 0), 240000);
});

test('canAfford respects the per-round cap, not just the whole bank', () => {
  const cfg = B.normalize({ total: 240000, superBowlFloor: 40000 });
  // A 60k roster in Wild Card is fine (pool is 200k).
  assert.strictEqual(B.canAfford(cfg, 1, 0, 60000), true);
  // A 210k roster in a pool round is not — it would eat the reserved floor.
  assert.strictEqual(B.canAfford(cfg, 1, 0, 210000), false);
  // In the Super Bowl, the same 210k is affordable if nothing was spent before.
  assert.strictEqual(B.canAfford(cfg, 4, 0, 210000), true);
  // A negative cost is never "affordable".
  assert.strictEqual(B.canAfford(cfg, 1, 0, -5), false);
});

test('remaining is the whole-tournament bank left, clamped at zero', () => {
  const cfg = B.normalize({ total: 240000, superBowlFloor: 40000 });
  assert.strictEqual(B.remaining(cfg, 0), 240000);
  assert.strictEqual(B.remaining(cfg, 175000), 65000);
  assert.strictEqual(B.remaining(cfg, 999999), 0);
});

test('state: a display snapshot for a pool round vs the Super Bowl', () => {
  const cfg = B.normalize({ total: 240000, superBowlFloor: 40000 });
  const r2 = B.state(cfg, 2, 70000);
  assert.strictEqual(r2.roundName, 'divisional');
  assert.strictEqual(r2.isSuperBowl, false);
  assert.strictEqual(r2.available, 130000);
  assert.strictEqual(r2.reservedFloor, 40000); // floor still held back
  assert.strictEqual(r2.carryover, null);

  const sb = B.state(cfg, 4, 150000);
  assert.strictEqual(sb.roundName, 'superbowl');
  assert.strictEqual(sb.isSuperBowl, true);
  assert.strictEqual(sb.available, 90000);
  assert.strictEqual(sb.reservedFloor, 0);
  assert.strictEqual(sb.carryover, 50000); // the unspent pool rolled in
});

test('out-of-range rounds are safe (no spend available)', () => {
  const cfg = B.normalize({ total: 240000, superBowlFloor: 40000 });
  assert.strictEqual(B.availableForRound(cfg, 0, 0), 0);
  assert.strictEqual(B.availableForRound(cfg, 5, 0), 0);
});

test('raw settings can be passed straight in (auto-normalized)', () => {
  // availableForRound/state accept the stored playoffGame block directly.
  assert.strictEqual(B.availableForRound({ total: 240000, superBowlFloor: 40000 }, 1, 0), 200000);
  assert.strictEqual(B.state({ total: 240000, superBowlFloor: 40000 }, 4, 200000).available, 40000);
});
