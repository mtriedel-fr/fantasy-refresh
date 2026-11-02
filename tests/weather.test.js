// Weather logic: stadium classification + turning Open-Meteo hourly data into
// per-game conditions. The network fetch itself is browser-only (not tested here).
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/stadiums.js');     // also sets globalThis.FR_STADIUMS
const W = require('../js/weather.js');

test('stadium lookup: aliases and roof classification', () => {
  assert.equal(S.get('WAS').name, S.get('WSH').name); // alias
  assert.equal(S.get('JAC'), S.get('JAX'));
  assert.equal(S.isOutdoor('GB'), true);
  assert.equal(S.isOutdoor('DET'), false);  // dome
  assert.equal(S.isOutdoor('DAL'), false);  // retractable
  assert.equal(S.isOutdoor('LAC'), false);  // fixed roof (SoFi)
  assert.equal(S.get('ZZZ'), null);
});

test('weather codes map to a label + icon', () => {
  assert.equal(W.codeInfo(0).label, 'Clear');
  assert.equal(W.codeInfo(65).label, 'Heavy rain');
  assert.equal(W.codeInfo(75).icon, '❄️');
  assert.equal(W.codeInfo(1234).label, '—'); // unknown code
});

test('utcHourKey floors an instant to its UTC hour', () => {
  assert.equal(W.utcHourKey('2026-11-02T18:25:00Z'), '2026-11-02T18:00');
  assert.equal(W.utcHourKey('not-a-date'), null);
});

test('assemble: outdoor game reads the kickoff hour; roofed is sheltered', () => {
  const gb = S.get('GB');
  const byStadium = {};
  byStadium[gb.lat + ',' + gb.lon] = {
    time: ['2026-11-02T17:00', '2026-11-02T18:00', '2026-11-02T19:00'],
    temperature_2m: [40, 31, 29],
    wind_speed_10m: [8, 22, 25],
    precipitation_probability: [10, 80, 90],
    weather_code: [3, 71, 73]
  };
  const games = [
    { home: 'GB',  away: 'CHI', time: '2026-11-02T18:00:00Z' }, // outdoor, snowy & windy
    { home: 'DET', away: 'MIN', time: '2026-11-02T18:00:00Z' }, // dome
    { home: 'ZZZ', away: 'AAA', time: '2026-11-02T18:00:00Z' }  // unknown
  ];
  const wx = W.assemble(games, byStadium);
  assert.equal(wx.GB.tempF, 31);
  assert.equal(wx.GB.windMph, 22);
  assert.equal(wx.GB.precipPct, 80);
  assert.equal(wx.GB.label, 'Light snow');
  assert.equal(wx.GB.notable, true);          // snow + wind + high precip
  assert.equal(wx.DET.indoor, true);
  assert.equal(wx.DET.roof, 'dome');
  assert.equal(wx.ZZZ.unknown, true);
});

test('assemble: outdoor game with no matching hour is pending, not a crash', () => {
  const gb = S.get('GB');
  const byStadium = {};
  byStadium[gb.lat + ',' + gb.lon] = { time: ['2026-12-01T18:00'], temperature_2m: [20], wind_speed_10m: [5], precipitation_probability: [0], weather_code: [0] };
  const wx = W.assemble([{ home: 'GB', away: 'CHI', time: '2026-11-02T18:00:00Z' }], byStadium);
  assert.equal(wx.GB.pending, true);
});

test('isNotable: calm clear day is not flagged', () => {
  assert.equal(W.isNotable({ windMph: 6, precipPct: 10, code: 1 }), false);
  assert.equal(W.isNotable({ windMph: 18, precipPct: 0, code: 1 }), true);
  assert.equal(W.isNotable({ indoor: true }), false);
});
