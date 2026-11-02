// My Team page player-card weather (league.html): structural checks; the
// weather logic is covered by tests/weather.test.js and the browser harness.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'league.html'), 'utf8');

test('player cards emit an outdoor-only weather placeholder', () => {
  assert.match(html, /FR_STADIUMS\.isOutdoor\(hostTeam\)/);     // outdoor only
  assert.match(html, /class="wx-badge" data-wx="/);
});

test('My Team week view fills the weather badges after render', () => {
  assert.match(html, /function fillWeatherBadges\(container, gameMap\)/);
  assert.match(html, /fillWeatherBadges\(lu, gameMap\)/);        // called on the My Team lineup
  assert.match(html, /FRWeather\.load\(games\)/);
});
