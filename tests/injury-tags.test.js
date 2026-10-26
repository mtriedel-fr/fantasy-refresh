// Injury tags (Oct 24, 2026): projected players are priced with their tag;
// only Out/Suspended block drafting; IR/PUP/Doubtful/Questionable are draftable
// with a tag; a daily job keeps tags current without touching prices.
const test = require('node:test');
const assert = require('node:assert');
const { read, workflowScript, fn, load } = require('./extract');

const DRAFT = read('draft.html');
const D = load([fn(DRAFT, 'isOutStatus'), fn(DRAFT, 'injTag')], ['isOutStatus', 'injTag']);

test('Only Out / Suspended block drafting', () => {
  ['Out', 'O', 'Sus', 'Suspended'].forEach(s => assert.ok(D.isOutStatus(s), s));
  ['IR', 'PUP', 'Doubtful', 'Questionable', 'Active', '', null].forEach(s => assert.ok(!D.isOutStatus(s), String(s)));
});

test('Tags shown in the draft room', () => {
  assert.match(D.injTag('IR'), />IR</);
  assert.match(D.injTag('Out'), />OUT</);
  assert.match(D.injTag('Questionable'), />Q</);
  assert.strictEqual(D.injTag('Active'), '');
  assert.strictEqual(D.injTag(null), '');
});

test('Draft page no longer treats IR as out, and Out as available', () => {
  assert.doesNotMatch(DRAFT, /status === 'O' \|\| p\.status === 'IR'/);
  assert.match(fn(DRAFT, 'repriceLineup'), /lp\.status = cur\.status/, 'saved lineups pick up current tags');
  assert.match(fn(DRAFT, 'updateSubmitBtn'), /ruled OUT/, 'teams are warned about Out players');
});

test('Daily refresh uses the same Out rule and only touches status', () => {
  const R = workflowScript('.github/workflows/injury-status-refresh.yml');
  assert.strictEqual(fn(R, 'isOutStatus').replace(/\s+/g, ''), fn(DRAFT, 'isOutStatus').replace(/\s+/g, ''));
  assert.match(R, /patch\[`\$\{id\}\/status`\]/);
  assert.doesNotMatch(R, /salary\s*[:=]/, 'never changes prices');
});

test('Price build keeps projected players with their tag; backup QBs still excluded', () => {
  const A = workflowScript('.github/workflows/weekly-auto-open.yml');
  assert.match(A, /if \(liveGone\(poolP\)\) return;/, 'projected players only dropped if off a roster');
  assert.match(A, /if \(isUnavailable\(inj\) \|\| liveOut\(poolP\)\) return;/, 'backup QB pass still excludes');
});

test('Game-day window: only within 4h of the first kickoff through the last kickoff', () => {
  const R = workflowScript('.github/workflows/injury-status-refresh.yml');
  const G = load([R.match(/const WINDOW_BEFORE_MS[^\n]*/)[0], fn(R, 'etDay'), fn(R, 'gameDayWindow')], ['gameDayWindow']);
  const games = [
    { time: '2026-10-22T20:15:00-04:00' },  // Thu TNF 8:15pm ET
    { time: '2026-10-25T09:30:00-04:00' },  // Sun London 9:30am ET
    { time: '2026-10-25T13:00:00-04:00' },
    { time: '2026-10-25T20:20:00-04:00' },  // Sun night
    { time: '2026-10-26T20:15:00-04:00' },  // Mon night
  ];
  const at = s => new Date(s).getTime();
  assert.strictEqual(G.gameDayWindow(at('2026-10-27T10:00:00-04:00'), games).gameDay, false, 'Tuesday');
  assert.strictEqual(G.gameDayWindow(at('2026-10-22T15:00:00-04:00'), games).inWindow, false, 'Thu 3pm, too early');
  assert.strictEqual(G.gameDayWindow(at('2026-10-22T17:00:00-04:00'), games).inWindow, true, 'Thu 5pm');
  assert.strictEqual(G.gameDayWindow(at('2026-10-25T06:00:00-04:00'), games).inWindow, true, 'Sun 6am, London game day');
  assert.strictEqual(G.gameDayWindow(at('2026-10-25T21:00:00-04:00'), games).inWindow, false, 'after the last kickoff');
  assert.strictEqual(G.gameDayWindow(at('2026-10-26T18:00:00-04:00'), games).inWindow, true, 'Mon before MNF');
});
