// The Playoff Game scoring add-ons: the yardage-bonus delta (added on top of the
// regular-season calcDKPoints, not a reimplementation) and the cumulative
// leaderboard across the four rounds. Pure logic.
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/playoff-scoring.js');

// The bonuses the wizard stores for a Playoff Game: +3 at 350/150/150.
const SCORING = { intThrown: -2, fumbleLost: -2, bonuses: {
  pass: { yards: 350, points: 3 }, rush: { yards: 150, points: 3 }, rec: { yards: 150, points: 3 }
} };

test('bonusPoints awards at the threshold, not below it', () => {
  // 350 passing exactly → +3; 349 → nothing.
  assert.strictEqual(S.bonusPoints({ Passing: { passYds: 350 } }, SCORING).pts, 3);
  assert.strictEqual(S.bonusPoints({ Passing: { passYds: 349 } }, SCORING).pts, 0);
  // Rushing + receiving at 150.
  assert.strictEqual(S.bonusPoints({ Rushing: { rushYds: 150 } }, SCORING).pts, 3);
  assert.strictEqual(S.bonusPoints({ Rushing: { rushYds: 149 } }, SCORING).pts, 0);
  assert.strictEqual(S.bonusPoints({ Receiving: { recYds: 151 } }, SCORING).pts, 3);
});

test('bonuses stack across categories (a dual-threat game)', () => {
  // A QB who runs: 360 pass + 155 rush → +3 +3 = +6.
  const r = S.bonusPoints({ Passing: { passYds: 360 }, Rushing: { rushYds: 155 } }, SCORING);
  assert.strictEqual(r.pts, 6);
  assert.strictEqual(r.breakdown.length, 2);
  assert.match(r.breakdown[0].label, /350\+ Pass Yds Bonus/);
  assert.strictEqual(r.breakdown[0].stat, '360 yds');
});

test('bonusPoints is a pure delta — no base points, safe on empty/absent config', () => {
  // No receiving yards near the line → 0 (base reception/yardage points are NOT
  // this module's job; they stay in calcDKPoints).
  assert.strictEqual(S.bonusPoints({ Receiving: { recYds: 80, receptions: 8 } }, SCORING).pts, 0);
  // Missing config or stats never throws.
  assert.strictEqual(S.bonusPoints({ Passing: { passYds: 400 } }, {}).pts, 0);
  assert.strictEqual(S.bonusPoints(null, SCORING).pts, 0);
  assert.strictEqual(S.bonusPoints({ Passing: { passYds: 400 } }, { bonuses: {} }).pts, 0);
});

test('custom thresholds are honored from config', () => {
  const sc = { bonuses: { pass: { yards: 300, points: 5 } } };
  assert.strictEqual(S.bonusPoints({ Passing: { passYds: 300 } }, sc).pts, 5);
  assert.strictEqual(S.bonusPoints({ Passing: { passYds: 299 } }, sc).pts, 0);
});

test('cumulativeStandings sums rounds, groups by uid, ranks with ties', () => {
  const rounds = {
    '1': { u1: { score: 120.5, team: 'Alpha' }, u2: { score: 100, team: 'Bravo' }, u3: { score: 90, team: 'Charlie' } },
    '2': { u1: { score: 80, team: 'Alpha' },    u2: { score: 100.5, team: 'Bravo' }, u3: { score: 110, team: 'Charlie' } },
    '3': { u1: { score: 100, team: 'Alpha' },   u2: { score: 100, team: 'Bravo' } }  // u3 didn't play round 3
  };
  const board = S.cumulativeStandings(rounds);
  // Totals: u1 = 300.5, u2 = 300.5, u3 = 200. u1/u2 tie for 1st.
  assert.strictEqual(board[0].total, 300.5);
  assert.strictEqual(board[1].total, 300.5);
  assert.strictEqual(board[0].rank, 1);
  assert.strictEqual(board[1].rank, 1);   // tie
  assert.strictEqual(board[2].rank, 3);   // next rank skips 2
  assert.strictEqual(board[2].uid, 'u3');
  assert.strictEqual(board[2].total, 200);
  assert.strictEqual(board[2].rounds[3], undefined); // round not played
  assert.strictEqual(board[0].team, 'Alpha');        // team carried through
});

test('cumulativeStandings groups by uid even if a team was renamed mid-run', () => {
  const rounds = {
    '1': { u1: { score: 50, team: 'Old Name' } },
    '2': { u1: { score: 60, team: 'New Name' } }
  };
  const board = S.cumulativeStandings(rounds);
  assert.strictEqual(board.length, 1);          // one manager, not split in two
  assert.strictEqual(board[0].total, 110);
  assert.strictEqual(board[0].team, 'New Name'); // latest name wins
});
