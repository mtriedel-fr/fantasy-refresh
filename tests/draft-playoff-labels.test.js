// The Playoff Game reuses the real draft page (draft.html) so it looks exactly
// like the regular draft. The only playoff-aware bit so far is labeling: weeks
// are shown as round names. These pin that helper (the budget swap comes next).
const test = require('node:test');
const assert = require('node:assert');
const { read, fn, load } = require('./extract');
const FRPlayoffGame = require('../js/playoff-game.js');

const DRAFT = read('draft.html');

function make(settings, week) {
  return load(
    [fn(DRAFT, 'isPlayoffLeague'), fn(DRAFT, 'roundOrWeekLabel')],
    ['isPlayoffLeague', 'roundOrWeekLabel'],
    { FRPlayoffGame, LEAGUE_SETTINGS: settings, currentWeek: week }
  );
}

test('a regular league still labels by week', () => {
  const s = make({ gameType: 'season' }, 6);
  assert.strictEqual(s.isPlayoffLeague(), false);
  assert.strictEqual(s.roundOrWeekLabel(), 'Week 6');
  // null settings (not loaded yet) is treated as a regular league.
  assert.strictEqual(make(null, 3).roundOrWeekLabel(), 'Week 3');
});

test('a Playoff Game league labels by round', () => {
  const s = make({ gameType: 'playoff', playoffGame: {} }, 1);
  assert.strictEqual(s.isPlayoffLeague(), true);
  assert.strictEqual(s.roundOrWeekLabel(), 'Wild Card');
  assert.strictEqual(make({ gameType: 'playoff' }, 2).roundOrWeekLabel(), 'Divisional');
  assert.strictEqual(make({ gameType: 'playoff' }, 3).roundOrWeekLabel(), 'Conference');
  assert.strictEqual(make({ gameType: 'playoff' }, 4).roundOrWeekLabel(), 'Super Bowl');
});

test('an out-of-range round degrades gracefully', () => {
  assert.strictEqual(make({ gameType: 'playoff' }, 9).roundOrWeekLabel(), 'Round 9');
});
