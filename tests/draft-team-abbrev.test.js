// Draft: a team that appears as both WAS and WSH across sources must still match
// its game. Real bug: Washington's players showed no opponent/rank/game info
// because the game map was keyed by the raw abbreviation.
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { read, fn } = require('./extract');

const src = read('draft.html');
const normTeam = a => ({ WAS: 'WSH', WSH: 'WSH' }[a] || a);

function gameMap(schedule, liveGameStatus = {}) {
  const ctx = vm.createContext({ normTeam, schedule, liveGameStatus });
  vm.runInContext(fn(src, 'buildDraftTeamGameMap') + '\nthis.__m = buildDraftTeamGameMap();', ctx);
  return ctx.__m;
}

test('game map is keyed by the normalized abbreviation (WSH)', () => {
  const m = gameMap([{ home: 'WSH', away: 'DAL', time: 1 }]);
  assert.deepEqual(Object.keys(m).sort(), ['DAL', 'WSH']);
  // a player whose pool team is "WAS" finds the WSH-keyed game
  assert.ok(m[normTeam('WAS')]);
  assert.equal(m[normTeam('WAS')].opp, 'DAL');
  assert.equal(m[normTeam('WAS')].isHome, true);
});

test('works when the schedule says WAS and the player is WSH', () => {
  const m = gameMap([{ home: 'DAL', away: 'WAS', time: 1 }]);
  assert.ok(m[normTeam('WSH')]);                 // player pool uses WSH
  assert.equal(m[normTeam('WSH')].opp, 'DAL');
  assert.equal(m[normTeam('WSH')].isHome, false);
});

test('defVsPosMatchupCol matches ranks across WAS/WSH', () => {
  // fn() only grabs one function; pull the matchup col with its own context.
  const ctx = vm.createContext({ normTeam, defVsPosRanks: { WSH: { WR: 7 } } });
  vm.runInContext(fn(src, 'defVsPosMatchupCol'), ctx);
  const outWAS = ctx.defVsPosMatchupCol('WAS', 'WR'); // opponent came through as WAS
  assert.match(outWAS, /#7/);
});
