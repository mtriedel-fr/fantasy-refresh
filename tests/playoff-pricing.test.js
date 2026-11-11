// The Playoff Game round-pricing engine. It reuses the regular-season salary
// curve (per-position exponents/premiums/clamps) with ONE change: the price
// multiplier is anchored to fixed reference projections instead of each week's
// field, so the same projection costs the same in every round. These lock that
// guarantee in, plus the curve clamps and the "enough players to draft" gate.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/playoff-pricing.js');

test('THE budgeting guarantee: a projection costs the same in every round', () => {
  // Wild Card pool (many teams) vs Super Bowl pool (2 teams) — same stars in both.
  const wildCard = [
    { id: 'a', name: 'Star QB', pos: 'QB', team: 'KC', proj: 24 },
    { id: 'b', name: 'Mid RB', pos: 'RB', team: 'BUF', proj: 14 },
    { id: 'c', name: 'Scrub WR', pos: 'WR', team: 'CIN', proj: 4 }
  ];
  const superBowl = [
    { id: 'a', name: 'Star QB', pos: 'QB', team: 'KC', proj: 24 },  // same player, same proj
    { id: 'b', name: 'Mid RB', pos: 'RB', team: 'BUF', proj: 14 }
  ];
  const wc = P.priceRound(wildCard).players;
  const sb = P.priceRound(superBowl).players;
  assert.strictEqual(wc.a.salary, sb.a.salary, 'star QB priced identically in both rounds');
  assert.strictEqual(wc.b.salary, sb.b.salary, 'mid RB priced identically in both rounds');
  // The scale is anchored, not relative: the top SB player is NOT re-inflated
  // just because the field is smaller.
  assert.ok(sb.a.salary <= P.DEFAULTS.positions.QB.clamp);
});

test('higher projection costs more (monotonic), within the clamps', () => {
  const s = proj => P.priceOne(proj, 'WR');
  assert.ok(s(20) > s(12));
  assert.ok(s(12) > s(6));
  // A huge projection hits the global ceiling, a tiny one the floor.
  assert.strictEqual(P.priceOne(99, 'WR'), P.DEFAULTS.salMax);
  assert.strictEqual(P.priceOne(1, 'WR'), P.DEFAULTS.salaryFloor);
});

test('the curve matches the regular-season shape (per-position)', () => {
  // A top QB sits near the QB clamp/anchor (~$9,000); QB uses the steep exp 1.3,
  // so a mid QB is much cheaper than a mid WR at the same projection.
  assert.ok(Math.abs(P.priceOne(27, 'QB') - 9000) <= 100);
  assert.ok(P.priceOne(14, 'QB') < P.priceOne(14, 'WR')); // steeper QB curve
  // Top WR/RB run to the $9,600 position ceiling.
  assert.ok(P.priceOne(24, 'WR') >= 9000);
});

test('unprojected players: backup QBs kept at the floor, others dropped', () => {
  const list = [
    { id: 'q', name: 'Backup QB', pos: 'QB', team: 'KC', proj: 0 },
    { id: 'w', name: 'Deep WR', pos: 'WR', team: 'KC', proj: 0 },
    { id: 'd', name: 'Ravens D/ST', pos: 'DEF', team: 'BAL', proj: 7 }
  ];
  const out = P.priceRound(list);
  assert.strictEqual(out.players.q.salary, P.DEFAULTS.backupQb);
  assert.strictEqual(out.players.w, undefined);             // dropped
  assert.ok(out.players.d.salary >= P.DEFAULTS.salaryFloor); // DEF priced on the curve
});

test('isDraftable gates on filling the roster, not full-league counts', () => {
  const enough = [{ pos: 'QB' }];
  for (let i = 0; i < 3; i++) enough.push({ pos: 'RB' }); // 2 + flex
  for (let i = 0; i < 4; i++) enough.push({ pos: 'WR' });
  enough.push({ pos: 'TE' }, { pos: 'DEF' }, { pos: 'DEF' });
  assert.strictEqual(P.isDraftable(enough).ok, true);

  const short = [{ pos: 'QB' }, { pos: 'RB' }, { pos: 'RB' }, { pos: 'WR' }, { pos: 'WR' }, { pos: 'WR' }, { pos: 'TE' }];
  const r = P.isDraftable(short);
  assert.strictEqual(r.ok, false);
  assert.ok(r.missing.includes('DEF'));
  assert.ok(r.missing.includes('FLEX'));
});

test('the sheet shape matches what the draft reads (players keyed by id + meta)', () => {
  const out = P.priceRound([{ id: 'x1', name: 'A', pos: 'WR', team: 'KC', proj: 15, status: 'Q' }]);
  assert.ok(out.players.x1);
  assert.strictEqual(out.players.x1.status, 'Q');       // injury tag carried through
  assert.strictEqual(out.meta.scale, 'fixed');
  assert.strictEqual(out.meta.count, 1);
});
