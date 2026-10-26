// Player card: the Cloudflare Worker's /playerhistory (points, rank, snap %)
// and the Tuesday archive refresh in auto-scoring.yml that fills snap % and
// positions. Real bugs from Week 7: Jr./III players had no rank, snap % was
// blank, and INT/fumble counted −1 on the card but −2 in the league.
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { read, workflowScript, fn, constLine, load } = require('./extract');

// ── Worker ──────────────────────────────────────────────────────────────
function worker(fetchImpl) {
  const ctx = vm.createContext({ addEventListener() {}, fetch: fetchImpl, Response, URL, console });
  vm.runInContext(read('cloudflare/worker.js'), ctx);
  return ctx;
}
const json = body => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

// Week 7 archive rows, shaped like the real ones.
const ARCHIVE = {
  Regular_wk7: {
    games: [{ gameId: '20261025_CLE@TEN', home: 'TEN', away: 'CLE' }],
    players: {
      'harold fannin jr': { name: 'Harold Fannin Jr.', team: 'CLE', pos: '', rec: 6, recYds: 91, fumbLost: 1, snapPct: 0.91 },
      'travis kelce': { name: 'Travis Kelce', team: 'KC', pos: 'TE', rec: 4, recYds: 44 },
      'trey mcbride': { name: 'Trey McBride', team: 'ARI', pos: 'TE', rec: 9, recYds: 120, recTD: 1 },
      'aj brown': { name: 'A.J. Brown', team: 'NE', pos: 'WR', rec: 3, recYds: 48 }
    }
  }
};
const SCHEDULE = { weeks: { week7: [{ gameId: '20261025_CLE@TEN', home: 'TEN', away: 'CLE', time: 1 }] } };
function fakeFetch(url) {
  if (url.includes('/nflStatsArchive/')) return json(ARCHIVE);
  if (url.includes('/nflSchedule/')) return json(SCHEDULE);
  return json({});
}

test('card points use the league\'s −2 for a lost fumble (Fannin Week 7 = 13.1)', async () => {
  const W = worker(fakeFetch);
  const res = await W.handlePlayerHistory(new URL('https://w/playerhistory?name=Harold%20Fannin&team=CLE&pos=TE&season=2026'));
  const wk7 = (await res.json()).weeks.find(w => w.week === 7);
  assert.strictEqual(wk7.pts, 13.1);
});

test('a Jr. player with no stored position still gets a rank and snap %', async () => {
  const W = worker(fakeFetch);
  const res = await W.handlePlayerHistory(new URL('https://w/playerhistory?name=Harold%20Fannin&team=CLE&pos=TE&season=2026'));
  const wk7 = (await res.json()).weeks.find(w => w.week === 7);
  assert.strictEqual(wk7.rank, 2);     // McBride 30.0, Fannin 13.1, Kelce 8.4
  assert.strictEqual(wk7.pos, 'TE');
  assert.strictEqual(wk7.snapPct, 91);
});

test('name matching ignores suffixes and punctuation', () => {
  const W = worker(fakeFetch);
  assert.strictEqual(W.normNameKey('Marvin Harrison Jr.'), W.normNameKey('Marvin Harrison'));
  assert.strictEqual(W.normNameKey('Kenneth Walker III'), 'kenneth walker');
  assert.strictEqual(W.normNameKey('A.J. Brown'), 'aj brown');
});

test('worker scoring matches auto-scoring for INT and fumble', () => {
  const W = worker(fakeFetch);
  assert.strictEqual(W.computeFantasyPoints({ passYds: 250, passTD: 2, passInt: 1, fumbLost: 1 }), 10 + 8 - 2 - 2);
  const src = read('cloudflare/worker.js');
  assert.ok(!/passInt=-1|fumbLost=-1|passInterceptions=-1|fumbles=-1/.test(src), 'no −1 values left in Tank01 requests');
});

// ── auto-scoring archive refresh ────────────────────────────────────────
const SRC = workflowScript('.github/workflows/auto-scoring.yml');
function scoring() {
  return load([
    'function alert() {}',
    fn(SRC, 'stripNameSuffix'), fn(SRC, 'normPlayerName'),
    constLine(SRC, 'TEAM_ALIAS_SC'), fn(SRC, 'normTeamSC'), fn(SRC, 'sanitizeFirebaseKey'),
    fn(SRC, 'posForStats'), fn(SRC, 'archiveDetailUpdates'),
  ], ['posForStats', 'archiveDetailUpdates']);
}
function lookup() {
  const lk = { 'travis kelce': 'TE' };
  Object.defineProperty(lk, '_ids', { value: {
    bySleeper: { '9999': 'RB' }, byT01: { '4430': 'WR' },
    byNorm: { 'harold fannin': [{ pos: 'TE', team: 'CLE' }], 'josh allen': [{ pos: 'LB', team: 'JAX' }, { pos: 'QB', team: 'BUF' }] }
  } });
  return lk;
}

test('position found by Sleeper id, Tank01 id, exact name, or suffix-free name', () => {
  const S = scoring(), lk = lookup();
  assert.strictEqual(S.posForStats(lk, { sleeperBotID: '9999', longName: 'X' }), 'RB');
  assert.strictEqual(S.posForStats(lk, { playerID: '4430', longName: 'Y' }), 'WR');
  assert.strictEqual(S.posForStats(lk, { longName: 'Travis Kelce' }), 'TE');
  assert.strictEqual(S.posForStats(lk, { longName: 'Harold Fannin Jr.', team: 'CLE' }), 'TE');
  assert.strictEqual(S.posForStats(lk, { longName: 'Josh Allen', team: 'BUF' }), 'QB'); // same team wins
  assert.strictEqual(S.posForStats(lk, { longName: 'Nobody Here' }), '');
});

test('archive refresh fills only missing snap % and positions, only for archived players', () => {
  const S = scoring();
  const archived = {
    'harold fannin jr': { name: 'Harold Fannin Jr.', pos: '' },
    'travis kelce': { name: 'Travis Kelce', pos: 'TE', snapPct: 0.8 }
  };
  const box = {
    a: { longName: 'Harold Fannin Jr.', team: 'CLE', snapCounts: { offSnapPct: '0.91' } },
    b: { longName: 'Travis Kelce', team: 'KC', snapCounts: { offSnapPct: '0.70' } },   // already has one — untouched
    c: { longName: 'Not Archived', team: 'KC', snapCounts: { offSnapPct: '0.50' } }    // never creates rows
  };
  const upd = JSON.parse(JSON.stringify(S.archiveDetailUpdates(archived, box, lookup())));
  assert.deepStrictEqual(upd, { 'harold fannin jr/snapPct': 0.91, 'harold fannin jr/pos': 'TE' });
});

test('Tuesday lock run calls the archive refresh', () => {
  assert.ok(/await refreshArchiveDetails\(seasonType, week\)/.test(SRC));
});
