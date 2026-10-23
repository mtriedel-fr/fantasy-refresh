// Scoring: points math and matching lineup players to box-score stats.
// Each case below is a real bug this season. Runs on every pull request.
const test = require('node:test');
const assert = require('node:assert');
const { workflowScript, fn, constLine, load } = require('./extract');

const SRC = workflowScript('.github/workflows/auto-scoring.yml');
function scorer() {
  return load([
    'function alert() {}',
    fn(SRC, 'stripNameSuffix'), fn(SRC, 'normPlayerName'),
    constLine(SRC, 'STATS_BY_NAME'), constLine(SRC, 'TEAM_ALIAS_SC'), fn(SRC, 'normTeamSC'),
    fn(SRC, 'calcDKPoints'), fn(SRC, 'indexBoxScoreEntry'), fn(SRC, 'resolvePlayerStats'),
  ], ['calcDKPoints', 'indexBoxScoreEntry', 'resolvePlayerStats', 'STATS_BY_NAME']);
}
// Build a playerStats index from box-score entries, the way auto-scoring does.
function index(S, entries) {
  const ps = {};
  entries.forEach((e, i) => S.indexBoxScoreEntry(ps, e.pid || 'pid' + i, e));
  return ps;
}
const pts = (S, ps, player) => { const st = S.resolvePlayerStats(player, ps); return st ? S.calcDKPoints(st, player.pos).pts : null; };

const JJ = { pid: '4262921', longName: 'Justin Jefferson', teamAbv: 'MIN', Receiving: { receptions: '6', recYds: '68', recTD: '1' } };
const JJ_LINEUP = { id: '6794', name: 'Justin Jefferson', pos: 'WR', team: 'MIN' };

test('PPR points: 6 rec, 68 yds, 1 TD = 18.8', () => {
  const S = scorer();
  assert.strictEqual(S.calcDKPoints(JJ, 'WR').pts, 18.8);
});

test('QB passing line: 250 yds, 2 TD + 20 rush yds = 20', () => {
  const S = scorer();
  assert.strictEqual(S.calcDKPoints({ Passing: { passYds: '250', passTD: '2' }, Rushing: { rushYds: '20' } }, 'QB').pts, 20);
});

test('DEF points-allowed tiers', () => {
  const S = scorer();
  const tiers = [[0, 10], [6, 7], [13, 4], [20, 1], [27, 0], [34, -1], [35, -4]];
  tiers.forEach(([pa, bonus]) => assert.strictEqual(S.calcDKPoints({ ptsAllowed: pa }, 'DEF').pts, bonus, `pa=${pa}`));
  assert.strictEqual(S.calcDKPoints({ sacks: '3', defInt: '1', defTD: '1', ptsAllowed: 17 }, 'DEF').pts, 3 + 2 + 6 + 1);
});

test('Week 5 Jefferson: an empty duplicate row with his Sleeper id does not zero him', () => {
  const S = scorer();
  const dup = { pid: '999', longName: 'Justin Jefferson', teamAbv: 'MIN', sleeperBotID: '6794' };
  assert.strictEqual(pts(S, index(S, [JJ, dup]), JJ_LINEUP), 18.8);
  const S2 = scorer();
  assert.strictEqual(pts(S2, index(S2, [dup, JJ]), JJ_LINEUP), 18.8, 'order must not matter');
});

test('ID collision with a different player is ignored', () => {
  const S = scorer();
  const other = { pid: '6794', longName: 'Some Lineman', teamAbv: 'NO' };
  assert.strictEqual(pts(S, index(S, [JJ, other]), JJ_LINEUP), 18.8);
});

test('ID match with no name on the stats row is not trusted', () => {
  const S = scorer();
  const ps = index(S, [JJ]);
  ps['6794'] = { Receiving: {} };
  assert.strictEqual(pts(S, ps, JJ_LINEUP), 18.8);
});

test('Same-name players on different teams: picks the lineup player\'s team', () => {
  const S = scorer();
  const a = { pid: '1', longName: 'Mike Williams', teamAbv: 'NYJ', Receiving: { receptions: '2', recYds: '20' } };
  const b = { pid: '2', longName: 'Mike Williams', teamAbv: 'PIT', Receiving: { receptions: '7', recYds: '90', recTD: '1' } };
  assert.strictEqual(pts(S, index(S, [a, b]), { id: 'x', name: 'Mike Williams', pos: 'WR', team: 'NYJ' }), 4);
});

test('Suffix and punctuation: "Aaron Jones Sr." matches "Aaron Jones"; "Ja\'Marr" matches "JaMarr"', () => {
  const S = scorer();
  const ps = index(S, [
    { pid: '1', longName: 'Aaron Jones', teamAbv: 'MIN', Rushing: { rushYds: '50' } },
    { pid: '2', longName: "Ja'Marr Chase", teamAbv: 'CIN', Receiving: { receptions: '1', recYds: '10' } },
    { pid: '3', longName: 'Ollie Gordon II', teamAbv: 'MIA', Rushing: { rushYds: '40' } },
  ]);
  assert.strictEqual(pts(S, ps, { id: 'a', name: 'Aaron Jones Sr.', pos: 'RB', team: 'MIN' }), 5);
  assert.strictEqual(pts(S, ps, { id: 'b', name: 'JaMarr Chase', pos: 'WR', team: 'CIN' }), 2);
  assert.strictEqual(pts(S, ps, { id: 'c', name: 'Ollie Gordon', pos: 'RB', team: 'MIA' }), 4);
});

test('Defense is found by team abbreviation', () => {
  const S = scorer();
  const ps = {}; ps['PIT'] = { sacks: '2', ptsAllowed: 22 };
  assert.strictEqual(pts(S, ps, { id: 'PIT_DEF', name: 'PIT', pos: 'DEF', team: 'PIT' }), 2);
});

test('Player not in today\'s box scores resolves to nothing (prior score is kept)', () => {
  const S = scorer();
  assert.strictEqual(S.resolvePlayerStats({ id: 'zz', name: 'Nobody Here', pos: 'WR', team: 'MIN' }, index(S, [JJ])), null);
});
