// Fixes from the Oct 23, 2026 look-and-feel review.
const test = require('node:test');
const assert = require('node:assert');
const { read, fn, load } = require('./extract');

const DRAFT = read('draft.html'), LEAGUE = read('league.html'), HOME = read('home.html');

test('Draft room recognizes an unchanged submitted lineup', () => {
  const S = load(['var lineup = {}, submittedIds = {};', fn(DRAFT, 'isSameAsSubmitted'),
    'function set(l, s){ lineup = l; submittedIds = s; }'], ['isSameAsSubmitted', 'set']);
  S.set({ qb1: { id: 'a' }, rb1: { id: 'b' } }, { a: true, b: true });
  assert.strictEqual(S.isSameAsSubmitted(), true);
  S.set({ qb1: { id: 'a' }, rb1: { id: 'c' } }, { a: true, b: true });
  assert.strictEqual(S.isSameAsSubmitted(), false, 'swapped a player');
  S.set({ qb1: { id: 'a' } }, {});
  assert.strictEqual(S.isSameAsSubmitted(), false, 'never submitted');
  assert.match(fn(DRAFT, 'updateSubmitBtn'), /isSameAsSubmitted\(\)/);
});

test('No leftover icon fragments leak onto pages', () => {
  for (const f of ['draft.html', 'league-setup.html', 'preseason.html', 'runbook.html']) {
    assert.ok(!/^<circle cx='50' cy='50' r='50'.*<\/svg>">$/m.test(read(f)), f);
  }
});

test('Home greeting uses the display name, never the email address', () => {
  const src = fn(HOME, 'loadLeagues') + fn(HOME, 'setGreeting');
  assert.ok(!/user\.email\s*\|\|/.test(src), 'no email fallback');
  assert.match(fn(HOME, 'setGreeting'), /'My'/);
});

test('Team page treats a live week as in progress', () => {
  const S = load(['var seasonData = { "6": [{ status: "final", locked: true }], "7": [{ status: "live", locked: false }] };', fn(LEAGUE, 'isWeekInProgress')], ['isWeekInProgress']);
  assert.strictEqual(S.isWeekInProgress(7), true);
  assert.strictEqual(S.isWeekInProgress(6), false);
  assert.match(fn(LEAGUE, 'buildTeamSeasonHtml'), /buildScoreChartInline\(doneData\)/);
});

test('Two-tile stat bars and the Last One Standing tiles fit their space', () => {
  assert.match(LEAGUE, /#stats-weekly, #stats-guillotine \.stats\{grid-template-columns:repeat\(2,1fr\) !important;\}/);
  assert.match(LEAGUE, /@media \(max-width:560px\)\{ \.guill-hero\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
