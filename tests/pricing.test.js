// Salary sheet + draft board rules. Each case is a real bug this season.
const test = require('node:test');
const assert = require('node:assert');
const { read, workflowScript, fn, load } = require('./extract');

const AUTO = workflowScript('.github/workflows/weekly-auto-open.yml');
const PREP = workflowScript('.github/workflows/weekly-prep.yml');

test('Injury check catches Sleeper\'s word statuses (Week 7: "Out" was never excluded)', () => {
  for (const src of [AUTO, PREP]) {
    const { isUnavailable } = load([fn(src, 'isUnavailable')], ['isUnavailable']);
    ['Out', 'O', 'IR', 'PUP', 'PUP-R', 'Sus'].forEach(s => assert.ok(isUnavailable(s), s));
    ['Questionable', 'Doubtful', 'Active', '', null].forEach(s => assert.ok(!isUnavailable(s), String(s)));
  }
});

test('Backup QBs must be on Tank01\'s current player list (Week 7: Roethlisberger, Bortles)', () => {
  for (const [name, src] of [['weekly-auto-open', AUTO], ['weekly-prep', PREP]]) {
    const passes = src.split("poolP.pos !== 'QB') return;").slice(1);
    assert.ok(passes.length >= 1, `${name}: backup QB pass not found`);
    passes.forEach((p, i) => assert.ok(/if \(!poolP\.tank01PlayerID \|\| !poolP\.team\) return;/.test(p.slice(0, 600)), `${name} pass ${i + 1} lacks the Tank01-list check`));
  }
});

test('Player pool skips players with no team / Inactive / Retired (both pool builders)', () => {
  const league = read('league.html');
  assert.ok(/if\(p\.position !== 'DEF' && !p\.team\) return;/.test(league), 'league.html Refresh Player Pool');
  assert.ok(/if \(p\.position !== 'DEF' && !p\.team\) return;/.test(PREP), 'weekly-prep.yml');
});

test('Name matching ignores punctuation and suffixes', () => {
  const { normalizeNameForMatch } = load([fn(AUTO, 'normalizeNameForMatch')], ['normalizeNameForMatch']);
  assert.strictEqual(normalizeNameForMatch('A.J. Brown'), normalizeNameForMatch('AJ Brown'));
  assert.strictEqual(normalizeNameForMatch('Marvin Harrison Jr.'), normalizeNameForMatch('Marvin Harrison'));
});

test('Draft board hides bye-week teams and team-less players, but never empties on a partial schedule', () => {
  const draft = read('draft.html');
  const sandbox = {
    normTeam: a => ({ WAS: 'WSH', WSH: 'WSH' }[a] || a),
    schedule: [], allPlayers: [],
  };
  const teams = ['ARI','ATL','BAL','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','KC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN'];
  const S = load([fn(draft, 'filterPlayersToSchedule'), 'function run(s, p){ schedule = s; allPlayers = p; filterPlayersToSchedule(); return allPlayers; }'], ['run'], sandbox);
  const sched = []; for (let i = 0; i < teams.length; i += 2) sched.push({ home: teams[i], away: teams[i + 1] });
  const pl = [{ name: 'A', team: 'MIN' }, { name: 'B', team: 'BUF' }, { name: 'C', team: '' }, { name: 'D', team: 'WAS' }];
  assert.deepStrictEqual(S.run(sched, pl.slice()).map(p => p.name), ['A'], 'BUF/WAS on bye, C has no team');
  assert.strictEqual(S.run(sched.slice(0, 3), pl.slice()).length, 4, 'partial schedule (<16 teams) must not filter');
});
