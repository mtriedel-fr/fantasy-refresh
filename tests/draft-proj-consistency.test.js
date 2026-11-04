// The player card's projection row (draft.html renderHistoricalWeeks) must show
// the league's own projection — the salary-sheet `proj` the draft/roster shows —
// not the Worker's separately-computed one, so the two never disagree.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'draft.html'), 'utf8');

test('the live-season card passes the salary-sheet proj into the render', () => {
  assert.match(html, /renderHistoricalWeeks\(data\.weeks \|\| \[\], '2026', p\.proj\)/);
});

test('the projection row prefers the league proj over the Worker pts', () => {
  assert.match(html, /function renderHistoricalWeeks\(weeks, season, projOverride\)/);
  assert.match(html, /var fptsVal = \(g\.isProjection && projNum != null\) \? projNum : g\.pts;/);
});

test('historical seasons still pass no override (use the Worker pts)', () => {
  // loadHistoricalSeason renders with (weeks, season) only — no third arg.
  assert.match(html, /renderHistoricalWeeks\(cached\.weeks, season\)/);
  assert.match(html, /renderHistoricalWeeks\(data\.weeks \|\| \[\], season\)/);
});
