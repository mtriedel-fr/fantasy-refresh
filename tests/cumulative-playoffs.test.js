// Configurable tier playoffs for Points Race (cumulative) leagues. The lock
// week + on/off travel on the league settings/context; FRPlayoffs.config turns
// them into tier timing, defaulting to the original league and the 2025 archive.
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./extract');
const { config } = require('../js/playoff-config.js');

test('config: original league and 2025 archive are preserved', () => {
  const base = config({ format: 'cumulative' }, '2026');
  assert.strictEqual(base.enabled, true);
  assert.strictEqual(base.lockWeek, 14);
  assert.deepStrictEqual(base.weeks, [15, 16, 17]);
  // Even a stale/empty context defaults to the original behavior.
  assert.deepStrictEqual(config({}, '2026').weeks, [15, 16, 17]);
  const arch = config({ format: 'cumulative' }, '2025');
  assert.strictEqual(arch.lockWeek, 15);
  assert.deepStrictEqual(arch.weeks, [16, 17, 18]);
});

test('config: Points Race can opt out of, or move, the playoffs', () => {
  const off = config({ format: 'cumulative', playoffFormat: 'none' }, '2026');
  assert.strictEqual(off.enabled, false);
  assert.deepStrictEqual(off.weeks, []);
  const moved = config({ format: 'cumulative', playoffFormat: 'tiers', tierLockWeek: 12 }, '2026');
  assert.strictEqual(moved.lockWeek, 12);
  assert.deepStrictEqual(moved.weeks, [13, 14, 15]);
  // Always exactly 3 rounds (the renderer is built for 3).
  assert.strictEqual(moved.weeks.length, 3);
});

test('config: a nonsense lock week falls back to the default', () => {
  assert.strictEqual(config({ playoffFormat: 'tiers', tierLockWeek: 99 }, '2026').lockWeek, 14);
  assert.strictEqual(config({ playoffFormat: 'tiers', tierLockWeek: 0 }, '2026').lockWeek, 14);
});

test('setup: Points Race playoff toggle + lock week write playoffFormat/tierLockWeek', () => {
  const S = read('league-setup.html');
  assert.match(S, /id="tog-cum-playoffs"/, 'has the Add-tier-playoffs toggle');
  assert.match(S, /id="cum-tier-lock"/, 'has the lock-week field');
  // getCumPlayoffSettings reads those controls and emits the right settings.
  assert.match(S, /tog-cum-playoffs[\s\S]*?playoffFormat:\s*'none'/, 'off => no playoffs');
  assert.match(S, /playoffFormat:\s*'tiers',\s*tierCount:\s*3,\s*tierLockWeek:\s*lock/, 'on => tiers + lock week');
  // The created league's context carries the fields for the playoff engine.
  assert.match(S, /playoffFormat:\s*cumPlayoff\.playoffFormat/, 'saveContext carries playoffFormat');
  assert.match(S, /tierLockWeek:\s*cumPlayoff\.tierLockWeek/, 'saveContext carries tierLockWeek');
});

test('context builder (auth.js) carries the playoff config from settings', () => {
  const A = read('js/auth.js');
  assert.match(A, /playoffFormat:\s*settings\.playoffFormat\s*\|\|\s*\(settings\.format === 'cumulative' \? 'tiers' : 'none'\)/);
  assert.match(A, /tierLockWeek:\s*settings\.tierLockWeek\s*\|\|\s*14/);
});

test('engine: league.html gates the playoffs tab and the no-playoff state', () => {
  const L = read('league.html');
  // Tab hidden only for a cumulative league that opted out (H2H untouched).
  assert.match(L, /ctx\.format === 'cumulative'\) tab\.style\.display = cfg\.enabled \? '' : 'none'/);
  // renderPlayoffs shows a friendly no-playoffs state when disabled.
  assert.match(L, /if\(!PLAYOFF_ENABLED\)\{[\s\S]*?No playoffs in this league/);
  // The standings tier banner is suppressed when there are no playoffs.
  assert.match(L, /var tierNote = !PLAYOFF_ENABLED/);
});

test('engine: playoffs.html reads the shared config and handles no-playoff leagues', () => {
  const P = read('playoffs.html');
  assert.match(P, /FRPlayoffs\.config\(FRAuth\.getLeagueCtx\(\)/);
  assert.match(P, /if\(!_cfg\.enabled\)\{[\s\S]*?No playoffs in this league/);
});
