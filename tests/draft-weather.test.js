// Draft games-bar weather badges (draft.html): structural checks; the weather
// logic itself is covered by tests/weather.test.js and the browser harness.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'draft.html'), 'utf8');

test('draft loads the weather modules before the injury pop-up', () => {
  const s = html.indexOf('/js/stadiums.js'), w = html.indexOf('/js/weather.js'), i = html.indexOf('/js/injury-alert.js');
  assert.ok(s >= 0 && w >= 0 && i >= 0);
  assert.ok(s < i && w < i, 'stadiums.js and weather.js must load before injury-alert.js');
});

test('games bar renders a weather badge for outdoor games and fills it', () => {
  assert.match(html, /class="wx-badge" data-wx="/);          // placeholder on outdoor chips
  assert.match(html, /function applyDraftWeather\(games\)/);  // filler
  assert.match(html, /FRWeather\.load\(list\)/);
  assert.match(html, /FR_STADIUMS\.isOutdoor\(g\.home\)/);    // outdoor-only
  assert.match(html, /applyDraftWeather\(games\);/);          // called after render
});

test('roster slots also get a weather badge, filled after render', () => {
  // the slot game line emits an outdoor-only placeholder...
  assert.match(html, /!venueIcon && hostTeam && typeof FR_STADIUMS !== 'undefined' && FR_STADIUMS\.isOutdoor\(hostTeam\)/);
  // ...and renderRoster fills the page's badges from the schedule
  assert.match(html, /applyDraftWeather\(schedule\)/);
});
