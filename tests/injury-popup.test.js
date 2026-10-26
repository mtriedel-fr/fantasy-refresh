// Injury check pop-up (js/injury-alert.js): which lineup players it lists.
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { read } = require('./extract');

const ctx = vm.createContext({});
vm.runInContext(read('js/injury-alert.js'), ctx);
const A = ctx.FRInjuryAlert;

const lineup = {
  qb1: { id: '1', name: 'Lamar Jackson', pos: 'QB', team: 'BAL', status: null },
  rb1: { id: '2', name: 'Jordan Mason', pos: 'RB', team: 'MIN', status: null },
  wr1: { id: '3', name: 'Puka Nacua', pos: 'WR', team: 'LAR' },
  te1: { id: '4', name: 'Tyler Warren', pos: 'TE', team: 'IND' },
  wr2: { id: '5', name: 'Healthy Guy', pos: 'WR', team: 'DET' },
  rb2: { id: '6', name: 'Thursday Guy', pos: 'RB', team: 'NE' },
  def: { id: 'PIT', name: 'PIT', pos: 'DEF', team: 'PIT' },
};
const sheet = {
  '1': { status: 'Out' }, '2': { status: 'IR' }, '3': { status: 'Questionable' },
  '4': { status: 'Doubtful' }, '5': { status: null }, '6': { status: 'Out' },
};

test('Lists Out, IR, Doubtful and Questionable players, worst first', () => {
  const list = A.flaggedPlayers(lineup, sheet, { NE: true });
  assert.deepStrictEqual(Array.from(list, p => p.name + ':' + p.tag.label), ['Lamar Jackson:OUT', 'Jordan Mason:IR', 'Tyler Warren:D', 'Puka Nacua:Q']);
});

test('Skips healthy players, defenses, and players whose game already started', () => {
  const names = A.flaggedPlayers(lineup, sheet, { NE: true }).map(p => p.name);
  assert.ok(!names.includes('Healthy Guy'));
  assert.ok(!names.includes('Thursday Guy'), 'NE game started');
});

test('Uses the current sheet tag over the stale lineup snapshot', () => {
  const list = A.flaggedPlayers({ a: { id: '9', name: 'X', pos: 'RB', team: 'KC', status: 'Out' } }, { '9': { status: null } }, {});
  assert.strictEqual(list.length, 0, 'cleared since the lineup was saved');
});

test('Loaded on the home, league and draft pages', () => {
  for (const f of ['home.html', 'league.html', 'draft.html']) assert.match(read(f), /src="\/js\/injury-alert\.js"/, f);
});
