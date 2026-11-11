// The Playoff Game data model — the shared layer that turns a standalone
// playoff league's settings + saved rosters into the things the draft, roster
// and scoring surfaces need: the four rounds, the round<->week mapping, and a
// manager's live budget state (via js/playoff-budget.js).
//
// A Playoff Game league is an ordinary league (its own id) whose four NFL
// playoff rounds map 1:1 onto "weeks" 1-4 in its own season namespace, so it
// reuses the existing paths:
//   /leagues/{id}/salaries/{season}/week{1..4}   — prices per round (regenerated)
//   /leagues/{id}/lineups/{season}/week{1..4}/{uid} — a manager's roster per round
//   /leagues/{id}/season/{season}/{1..4}          — scores per round
// The running budget is NOT stored separately — it is derived from the saved
// per-round roster costs so there's a single source of truth.
//
// UMD (window global + CommonJS), same shape as js/playoff-config.js. Depends
// on FRBudget (js/playoff-budget.js must load first in the browser).
(function (root) {
  var FRBudget = root.FRBudget;
  if (!FRBudget && typeof require !== 'undefined') {
    try { FRBudget = require('./playoff-budget.js'); } catch (e) { /* browser load-order */ }
  }

  // The four rounds, in order. index === week number in the league's namespace.
  var ROUNDS = [
    { index: 1, key: 'wildcard',   week: 1, label: 'Wild Card',  short: 'WC'   },
    { index: 2, key: 'divisional', week: 2, label: 'Divisional', short: 'DIV'  },
    { index: 3, key: 'conference', week: 3, label: 'Conference', short: 'CONF' },
    { index: 4, key: 'superbowl',  week: 4, label: 'Super Bowl', short: 'SB'   }
  ];

  // The standard roster every round (same 9 slots as the rest of the site).
  var DEFAULT_ROSTER = { qb: 1, rb: 2, wr: 3, te: 1, flex: 1, def: 1 };

  // settings OR a league context both carry gameType — this is how every
  // surface decides "is this the Playoff Game?" without special-casing a page.
  function isPlayoffGame(o) {
    return !!(o && o.gameType === 'playoff');
  }

  function rounds() { return ROUNDS.map(function (r) { return copy(r); }); }

  function round(indexOrKey) {
    for (var i = 0; i < ROUNDS.length; i++) {
      if (ROUNDS[i].index === indexOrKey || ROUNDS[i].key === indexOrKey) return copy(ROUNDS[i]);
    }
    return null;
  }

  function weekForRound(index) { var r = round(index); return r ? r.week : null; }
  function roundForWeek(week)  { return (week >= 1 && week <= ROUNDS.length) ? copy(ROUNDS[week - 1]) : null; }

  // Normalized config for a Playoff Game league: the budget (from FRBudget),
  // the rounds, the roster shape, and the scoring block. Reads the stored
  // settings.playoffGame; tolerates a missing block by falling back to defaults.
  function config(settings) {
    settings = settings || {};
    var pg = settings.playoffGame || {};
    return {
      budget:  FRBudget ? FRBudget.normalize(pg) : null,
      rounds:  rounds(),
      roster:  settings.rosterConfig || copy(DEFAULT_ROSTER),
      scoring: pg.scoring || null,
      entryFee: toInt(pg.entryFee, 0)
    };
  }

  // Cost a manager has committed BEFORE entering `roundIndex` — i.e. the sum of
  // their saved roster costs for every earlier round. `costsByRound` may be
  // keyed by round index (1..4), by round key ('wildcard'…), or an array; a
  // missing round counts as 0 (not yet drafted).
  function spentBefore(costsByRound, roundIndex) {
    var sum = 0;
    for (var i = 1; i < roundIndex; i++) sum += costAt(costsByRound, i);
    return sum;
  }

  // The live budget snapshot for a manager entering `roundIndex`, given their
  // saved per-round costs. Combines the league budget with what they've spent.
  function budgetState(settings, costsByRound, roundIndex) {
    var pg = (settings && settings.playoffGame) || {};
    var spent = spentBefore(costsByRound, roundIndex);
    var s = FRBudget ? FRBudget.state(pg, roundIndex, spent) : null;
    if (s) {
      var r = round(roundIndex);
      s.roundLabel = r ? r.label : null;
      s.spentThisRound = costAt(costsByRound, roundIndex);
    }
    return s;
  }

  // Can a manager afford a `rosterCost` roster for `roundIndex`, given what
  // they've already committed in earlier rounds?
  function canAfford(settings, costsByRound, roundIndex, rosterCost) {
    if (!FRBudget) return true;
    var pg = (settings && settings.playoffGame) || {};
    return FRBudget.canAfford(pg, roundIndex, spentBefore(costsByRound, roundIndex), rosterCost);
  }

  // ── helpers ──
  function copy(o) { var c = {}; for (var k in o) if (o.hasOwnProperty(k)) c[k] = o[k]; return c; }
  function toInt(v, d) { var n = parseInt(v, 10); return isNaN(n) ? d : n; }
  function costAt(costs, index) {
    if (!costs) return 0;
    var r = ROUNDS[index - 1];
    var v = costs[index];
    if (v == null) v = costs[String(index)];
    if (v == null && r) v = costs[r.key];
    return toInt(v, 0);
  }

  var api = {
    isPlayoffGame: isPlayoffGame,
    rounds: rounds,
    round: round,
    weekForRound: weekForRound,
    roundForWeek: roundForWeek,
    config: config,
    spentBefore: spentBefore,
    budgetState: budgetState,
    canAfford: canAfford,
    ROUNDS: ROUNDS,
    DEFAULT_ROSTER: DEFAULT_ROSTER
  };
  root.FRPlayoffGame = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
