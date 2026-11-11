// The Playoff Game round-pricing engine. The headline guarantee is the FIXED
// scale: the same projection costs the same in every round, so banking money
// early actually buys more later. These lock that in, plus the curve clamps and
// the "enough players to draft" gate for a shrinking playoff field.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/playoff-pricing.js');

test('THE budgeting guarantee: a projection costs the same in every round', () => {
  // Wild Card pool (many teams) vs Super Bowl pool (2 teams) — same star in both.
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
  // And the scale is anchored, not relative: the top SB player is NOT re-inflated
  // just because the field is smaller.
  assert.ok(sb.a.salary <= P.DEFAULTS.ceilByPos.QB);
});

test('higher projection costs more (monotonic), within the clamps', () => {
  const s = proj => P.priceOne(proj, 'WR');
  assert.ok(s(20) > s(12));
  assert.ok(s(12) > s(6));
  // clamps: a huge projection hits the position ceiling, a tiny one the floor.
  assert.strictEqual(P.priceOne(99, 'WR'), P.DEFAULTS.ceilByPos.WR);
  assert.strictEqual(P.priceOne(1, 'WR'), P.DEFAULTS.minSalary);
});

test('the fixed anchor maps ~25 proj to ~$9,600', () => {
  // The defining reference point of the scale.
  const sal = P.priceOne(25, 'QB');
  assert.ok(Math.abs(sal - 9600) <= 100, 'anchor proj prices at ~$9,600, got ' + sal);
});

test('unprojected players: backup QBs kept at the floor, others dropped', () => {
  const list = [
    { id: 'q', name: 'Backup QB', pos: 'QB', team: 'KC', proj: 0 },
    { id: 'w', name: 'Deep WR', pos: 'WR', team: 'KC', proj: 0 },
    { id: 'd', name: 'Ravens D/ST', pos: 'DEF', team: 'BAL', proj: 7 }
  ];
  const out = P.priceRound(list);
  assert.strictEqual(out.players.q.salary, P.DEFAULTS.backupQb);
  assert.strictEqual(out.players.w, undefined);           // dropped
  assert.ok(out.players.d.salary >= P.DEFAULTS.minSalary); // DEF priced on the curve
});

test('isDraftable gates on filling the roster, not full-league counts', () => {
  // A Super-Bowl-sized pool that can field a legal 9: 1QB/2RB/3WR/1TE/1FLEX/1DEF.
  const enough = [];
  enough.push({ pos: 'QB' });
  for (let i = 0; i < 3; i++) enough.push({ pos: 'RB' }); // 2 + flex
  for (let i = 0; i < 4; i++) enough.push({ pos: 'WR' });
  enough.push({ pos: 'TE' });
  enough.push({ pos: 'DEF' }, { pos: 'DEF' });
  assert.strictEqual(P.isDraftable(enough).ok, true);

  // Missing a DEF and short a flex-eligible body.
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
