// The injury pop-up's severe-weather section (js/injury-alert.js weatherFlags),
// run with the real stadium + weather modules in one context.
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { read } = require('./extract');

const ctx = vm.createContext({});
vm.runInContext(read('js/stadiums.js'), ctx);
vm.runInContext(read('js/weather.js'), ctx);
vm.runInContext(read('js/injury-alert.js'), ctx);
const A = ctx.FRInjuryAlert;

const lineup = {
  qb1: { id: '1', name: 'Jordan Love', pos: 'QB', team: 'GB' },   // outdoor, severe
  rb1: { id: '2', name: 'Dome Guy', pos: 'RB', team: 'DET' },     // dome
  wr1: { id: '3', name: 'Calm Guy', pos: 'WR', team: 'KC' },      // outdoor, calm
  wr2: { id: '4', name: 'Started Guy', pos: 'WR', team: 'BUF' },  // outdoor severe but game locked
  def: { id: 'GB', name: 'GB', pos: 'DEF', team: 'GB' },          // same severe game as QB
};
const teamGameMap = {
  GB:  { home: 'GB',  away: 'CHI', time: '2026-11-08T18:00:00Z' }, CHI: { home: 'GB', away: 'CHI' },
  DET: { home: 'DET', away: 'MIN', time: '2026-11-08T18:00:00Z' }, MIN: { home: 'DET', away: 'MIN' },
  KC:  { home: 'KC',  away: 'DEN', time: '2026-11-08T18:00:00Z' }, DEN: { home: 'KC', away: 'DEN' },
  BUF: { home: 'BUF', away: 'MIA', time: '2026-11-08T18:00:00Z' }, MIA: { home: 'BUF', away: 'MIA' },
};
const wx = {
  GB:  { windMph: 26, precipPct: 80, code: 73, icon: '🌨️' }, // snow + wind => blizzard
  DET: { indoor: true, roof: 'dome' },
  KC:  { windMph: 7, precipPct: 10, code: 1 },
  BUF: { windMph: 30, precipPct: 90, code: 75 },             // severe, but locked below
};
const locks = { BUF: true };

test('weatherFlags: groups severe outdoor games, skips dome/calm/started', () => {
  const flags = A.weatherFlags(lineup, teamGameMap, wx, locks);
  assert.equal(flags.length, 1);                 // only GB's game
  assert.equal(flags[0].matchup, 'CHI @ GB');
  assert.ok(/Blizzard/.test(flags[0].reason));
  assert.deepEqual(flags[0].players.sort(), ['GB', 'Jordan Love']); // QB + DEF in that game
});

test('weatherFlags: nothing severe => empty', () => {
  assert.deepEqual(A.weatherFlags({ x: { id: '9', name: 'A', pos: 'WR', team: 'KC' } }, teamGameMap, wx, {}), []);
});
