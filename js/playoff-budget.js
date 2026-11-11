// The Playoff Game budget engine — the one-bank mechanic, as pure functions.
//
// A manager gets ONE budget for the whole NFL playoffs (default $240,000) and
// drafts a fresh 9-man roster each round (prices regenerate every round, repeat
// picks allowed). Spending draws down the single bank. The catch: a Super Bowl
// floor (default $40,000) is held back during the first three rounds, so across
// Wild Card + Divisional + Conference you can spend at most the POOL
// (total − floor = $200,000 by default). Whatever of the pool you DON'T spend
// carries into the Super Bowl on top of the floor — so the Super Bowl always
// has at least the floor, and more if you saved.
//
// Rounds are 1-indexed: 1 Wild Card, 2 Divisional, 3 Conference, 4 Super Bowl.
// `spentSoFar` is the manager's cumulative spend across the rounds BEFORE the
// one being asked about (i.e. entering that round).
//
// This module is only the budget math — rosters, prices, scoring live
// elsewhere. It mirrors js/playoff-config.js (UMD: window global + CommonJS).
(function (root) {
  var POOL_ROUNDS   = 3;        // rounds 1-3 share the pool; round 4 is the Super Bowl
  var ROUND_COUNT   = 4;
  var DEFAULT_TOTAL = 240000;
  var DEFAULT_FLOOR = 40000;
  var ROUND_NAMES   = ['wildcard', 'divisional', 'conference', 'superbowl'];

  // Accepts a league's `playoffGame` settings block (or anything with total /
  // superBowlFloor) and returns a clamped, coherent config. Never yields a
  // negative pool, even if the stored floor somehow exceeds the total.
  function normalize(pg) {
    pg = pg || {};
    var total = toInt(pg.total, DEFAULT_TOTAL);
    var floor = toInt(pg.superBowlFloor, DEFAULT_FLOOR);
    if (total < 0) total = 0;
    if (floor < 0) floor = 0;
    if (floor > total) floor = total;            // the floor can never exceed the whole budget
    return {
      total: total,
      superBowlFloor: floor,
      pool: total - floor,                       // spendable across rounds 1-3 (cumulative)
      poolRounds: POOL_ROUNDS,
      roundCount: ROUND_COUNT,
      roundNames: ROUND_NAMES.slice()
    };
  }

  function toInt(v, dflt) {
    var n = parseInt(v, 10);
    return (isNaN(n)) ? dflt : n;
  }

  function isSuperBowl(roundIndex) { return roundIndex === ROUND_COUNT; }

  // What a manager can spend entering `roundIndex`, given cumulative spend so
  // far. Rounds 1-3 are capped to the pool (the floor stays reserved); the
  // Super Bowl opens up the whole remaining bank (floor + any carried-over pool).
  function availableForRound(cfg, roundIndex, spentSoFar) {
    cfg = (cfg && cfg.pool != null) ? cfg : normalize(cfg);
    var spent = Math.max(0, toInt(spentSoFar, 0));
    if (roundIndex < 1 || roundIndex > ROUND_COUNT) return 0;
    var cap = isSuperBowl(roundIndex) ? cfg.total : cfg.pool;
    return Math.max(0, cap - spent);
  }

  // Can a roster costing `rosterCost` be fielded this round?
  function canAfford(cfg, roundIndex, spentSoFar, rosterCost) {
    var cost = toInt(rosterCost, 0);
    if (cost < 0) return false;
    return cost <= availableForRound(cfg, roundIndex, spentSoFar);
  }

  // Whole-tournament bank left after spending `spentTotal` across all rounds.
  function remaining(cfg, spentTotal) {
    cfg = (cfg && cfg.pool != null) ? cfg : normalize(cfg);
    return Math.max(0, cfg.total - Math.max(0, toInt(spentTotal, 0)));
  }

  // A display-ready snapshot for the draft/roster UI (to be built on top).
  //  available   — spendable this round
  //  reservedFloor — held back for the Super Bowl (0 once you're in it)
  //  carryover   — unspent pool rolling into the Super Bowl (only at round 4)
  function state(cfg, roundIndex, spentSoFar) {
    cfg = (cfg && cfg.pool != null) ? cfg : normalize(cfg);
    var sb = isSuperBowl(roundIndex);
    var available = availableForRound(cfg, roundIndex, spentSoFar);
    return {
      round: roundIndex,
      roundName: ROUND_NAMES[roundIndex - 1] || null,
      isSuperBowl: sb,
      total: cfg.total,
      pool: cfg.pool,
      floor: cfg.superBowlFloor,
      spentSoFar: Math.max(0, toInt(spentSoFar, 0)),
      available: available,
      reservedFloor: sb ? 0 : cfg.superBowlFloor,
      carryover: sb ? Math.max(0, cfg.pool - Math.max(0, toInt(spentSoFar, 0))) : null
    };
  }

  var api = {
    normalize: normalize,
    availableForRound: availableForRound,
    canAfford: canAfford,
    remaining: remaining,
    state: state,
    POOL_ROUNDS: POOL_ROUNDS,
    ROUND_COUNT: ROUND_COUNT,
    ROUND_NAMES: ROUND_NAMES,
    DEFAULT_TOTAL: DEFAULT_TOTAL,
    DEFAULT_FLOOR: DEFAULT_FLOOR
  };
  root.FRBudget = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
