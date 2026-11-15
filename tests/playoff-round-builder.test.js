// The Playoff Game round builder: alive teams + projections → a priced sheet.
// The shrinking field (only teams playing this round) is the key behavior.
const test = require('node:test');
const assert = require('node:assert');
const B = require('../js/playoff-round-builder.js');

// A small projected pool spanning several teams.
const PLAYERS = [
  { id: 'q1', name: 'KC QB',  pos: 'QB',  team: 'KC',  proj: 24 },
  { id: 'r1', name: 'BUF RB', pos: 'RB',  team: 'BUF', proj: 16 },
  { id: 'r2', name: 'BUF RB2',pos: 'RB',  team: 'BUF', proj: 12 },
  { id: 'w1', name: 'KC WR',  pos: 'WR',  team: 'KC',  proj: 18 },
  { id: 'w2', name: 'BUF WR', pos: 'WR',  team: 'BUF', proj: 15 },
  { id: 'w3', name: 'KC WR2', pos: 'WR',  team: 'KC',  proj: 11 },
  { id: 't1', name: 'KC TE',  pos: 'TE',  team: 'KC',  proj: 12 },
  { id: 'r3', name: 'KC RB',  pos: 'RB',  team: 'KC',  proj: 13 },  // flex-eligible depth
  { id: 't2', name: 'BUF TE', pos: 'TE',  team: 'BUF', proj: 9 },
  { id: 'd1', name: 'KC DEF', pos: 'DEF', team: 'KC',  proj: 8 },
  { id: 'd2', name: 'BUF DEF',pos: 'DEF', team: 'BUF', proj: 7 },
  // a player on a team NOT in this round's games (eliminated / on bye):
  { id: 'x1', name: 'DAL WR', pos: 'WR',  team: 'DAL', proj: 20 }
];

test('teamsInGames dedupes and normalizes abbreviations', () => {
  const teams = B.teamsInGames([{ home: 'KC', away: 'BUF' }, { home: 'JAX', away: 'kc' }]);
  assert.ok(teams.includes('KC'));
  assert.ok(teams.includes('BUF'));
  assert.ok(teams.includes('JAC'));   // JAX normalized to JAC
  assert.strictEqual(teams.filter(t => t === 'KC').length, 1); // deduped (incl. lowercase)
});

test('only players on teams playing this round are included (shrinking field)', () => {
  const sheet = B.buildRoundSheet(4, [{ home: 'KC', away: 'BUF' }], PLAYERS);
  // DAL is not in the Super Bowl matchup → dropped.
  assert.strictEqual(sheet.players.x1, undefined);
  // KC + BUF players are in.
  assert.ok(sheet.players.q1);
  assert.ok(sheet.players.r1);
  assert.deepStrictEqual(sheet.teams.sort(), ['BUF', 'KC']);
});

test('players are priced by the fixed-scale pricer', () => {
  const sheet = B.buildRoundSheet(1, [{ home: 'KC', away: 'BUF' }], PLAYERS);
  assert.ok(sheet.players.q1.salary > 0);
  // Same player would price identically in any round (fixed scale).
  const sheet4 = B.buildRoundSheet(4, [{ home: 'KC', away: 'BUF' }], PLAYERS);
  assert.strictEqual(sheet.players.q1.salary, sheet4.players.q1.salary);
});

test('draftability gate: a full two-team field can field a legal 9', () => {
  const sheet = B.buildRoundSheet(4, [{ home: 'KC', away: 'BUF' }], PLAYERS);
  assert.strictEqual(sheet.draftable, true);
  assert.strictEqual(sheet.meta.round, 4);
});

test('draftability gate flags a pool too thin to fill the roster', () => {
  // Only KC players and only one game that is KC vs a team with no players here.
  const thin = PLAYERS.filter(p => p.team === 'KC');
  const sheet = B.buildRoundSheet(4, [{ home: 'KC', away: 'MIA' }], thin);
  assert.strictEqual(sheet.draftable, false);   // not enough RB/WR/DEF across one team
  assert.ok(sheet.missing.length > 0);
});

test('a bye team (not in the round games) is excluded that round', () => {
  // Wild Card: KC on a bye (no game), so no KC players priced this round.
  const sheet = B.buildRoundSheet(1, [{ home: 'BUF', away: 'DAL' }], PLAYERS);
  assert.strictEqual(sheet.players.q1, undefined); // KC QB out (KC on bye)
  assert.ok(sheet.players.r1);                     // BUF in
  assert.ok(sheet.players.x1);                     // DAL now in (it's playing)
});
