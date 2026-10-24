// Fixes from the Oct 23, 2026 look-and-feel review.
const test = require('node:test');
const assert = require('node:assert');
const { read, fn, load } = require('./extract');

const DRAFT = read('draft.html');
const LEAGUE = read('league.html');

test('Draft: a submitted, unchanged roster reads as submitted', () => {
  const S = load([
    "var SLOT_DEFS = [{id:'qb1'},{id:'rb1'}]; var lineup = {}; var submittedIds = {};",
    fn(DRAFT, 'setSubmittedFrom'), fn(DRAFT, 'lineupMatchesSubmitted'),
    "function set(l){ lineup = l; }",
  ], ['setSubmittedFrom', 'lineupMatchesSubmitted', 'set']);
  const a = { id: '1' }, b = { id: '2' }, c = { id: '3' };
  S.set({ qb1: a, rb1: b });
  assert.strictEqual(S.lineupMatchesSubmitted(), false, 'nothing submitted yet');
  S.setSubmittedFrom({ qb1: a, rb1: b });
  assert.strictEqual(S.lineupMatchesSubmitted(), true, 'same roster as submitted');
  S.set({ qb1: a, rb1: c });
  assert.strictEqual(S.lineupMatchesSubmitted(), false, 'changed since submitting');
  assert.match(fn(DRAFT, 'updateSubmitBtn'), /lineupMatchesSubmitted\(\)[\s\S]*Lineup Submitted/);
  assert.doesNotMatch(fn(DRAFT, 'finishLineupLoad'), /textContent = '✓ Submitted/, 'button text is owned by updateSubmitBtn');
});

test('No leftover icon fragments in page heads (stray "> ">" text)', () => {
  for (const f of ['draft.html', 'league-setup.html', 'preseason.html', 'runbook.html']) {
    const orphan = read(f).split('\n').filter(l => l.startsWith("<circle cx='50' cy='50' r='50'") && l.trim().endsWith('</svg>">'));
    assert.strictEqual(orphan.length, 0, f);
  }
});

test('Home greeting uses the profile name, never the email', () => {
  const home = read('home.html');
  const loader = fn(home, 'loadLeagues');
  assert.doesNotMatch(loader, /displayName \|\| user\.email \|\| 'Coach'/);
  assert.match(loader, /members\/' \+ uid \+ '\/displayName\.json/);
});

test('League stats bars with two tiles use two columns', () => {
  assert.match(LEAGUE, /#stats-weekly, #stats-guillotine \.stats\{grid-template-columns:repeat\(2,1fr\);\}/);
});

test('Last One Standing stats wrap instead of overflowing on phones', () => {
  assert.match(LEAGUE, /class="guill-hero" style="display:grid;grid-template-columns:repeat\(auto-fit,minmax\(120px,1fr\)\)/);
});

test('Team page: a week counts as complete only when final or locked', () => {
  const S = load(['var seasonData = {};', fn(LEAGUE, 'isWeekComplete'), 'function set(d){ seasonData = d; }'], ['isWeekComplete', 'set']);
  S.set({ '6': [{ status: 'final' }, { status: 'final' }], '7': [{ status: 'live' }, { status: 'final' }], '5': [{ status: 'live', locked: true }] });
  assert.strictEqual(S.isWeekComplete(6), true);
  assert.strictEqual(S.isWeekComplete(7), false, 'week in progress');
  assert.strictEqual(S.isWeekComplete(5), true, 'locked');
  assert.strictEqual(S.isWeekComplete(8), false, 'no data');
  assert.match(fn(LEAGUE, 'buildTeamSeasonHtml'), /weekDataAll\.filter\(function\(d\)\{ return !d\.live; \}\)/);
});
