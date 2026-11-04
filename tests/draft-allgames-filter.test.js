// Draft picker: clearing the game filter ("All Games") must keep the picker
// open on the active position, not close it. Regression: clicking a position,
// then a game, then All Games bounced the user out of the position.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'draft.html'), 'utf8');

test('setGameFilter only collapses the picker when no position is active', () => {
  const i = html.indexOf('function setGameFilter(');
  assert.ok(i >= 0);
  const body = html.slice(i, i + 3000);
  // The panel is collapsed on "All Games" ONLY inside an if(!activeSlot) guard.
  assert.match(body, /if\(!activeSlot\)\{\s*document\.getElementById\('picker-panel'\)\.classList\.remove\('open'\);/);
});
