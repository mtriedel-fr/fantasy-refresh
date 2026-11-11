// The Playoff Game round-pricing engine (pure logic).
//
// Each playoff round is priced from the projections of the players on the teams
// STILL ALIVE that round. The pool shrinks every round (Wild Card ~12-14 teams
// → Divisional 8 → Conference 4 → Super Bowl 2), so a fresh sheet is built each
// round — BUT the price scale is deliberately FIXED, not rescaled to the round's
// field:
//
//   a given projection maps to the same salary in every round.
//
// This is the whole point of the budget game. If prices were rescaled to each
// round's (smaller, stronger) field, a full roster would always cost about the
// same slice of your budget and there'd be no reason to save early. With a fixed
// scale, a 24-point projection costs ~$9,600 whether it's the Wild Card or the
// Super Bowl — so money you bank in the early rounds genuinely buys you more
// later. The multiplier is anchored to a FIXED reference projection, never to
// the round's own maximum (which is the one thing the seasonal engine does that
// we must NOT copy here).
//
// The curve shape (proj^exp × multiplier, clamped per position, rounded) matches
// the seasonal salary engine; only the anchor is fixed instead of per-week.
// UMD (window global + CommonJS), same shape as the other playoff modules.
(function (root) {
  // Fixed pricing scale. ANCHOR_PROJ → ANCHOR_SAL defines the multiplier once,
  // for every round, so absolute prices never drift. Tunable via opts.
  var DEFAULTS = {
    exp: 0.6,                 // curve steepness (matches the seasonal engine)
    anchorProj: 25,           // a ~25-pt projection...
    anchorSal: 9600,          // ...is worth ~$9,600, in EVERY round
    round: 100,               // salaries rounded to the nearest $100
    minSalary: 3700,          // league floor (wizard default)
    maxSalary: 11300,         // league ceiling (wizard default)
    backupQb: 3800,           // floor for a QB with no projection yet
    ceilByPos: { QB: 9800, RB: 9600, WR: 9600, TE: 8000, DEF: 5000 }
  };
  var DEFAULT_ROSTER = { qb: 1, rb: 2, wr: 3, te: 1, flex: 1, def: 1 };

  function withDefaults(o) {
    o = o || {};
    var m = {};
    for (var k in DEFAULTS) m[k] = (o[k] != null) ? o[k] : DEFAULTS[k];
    m.ceilByPos = Object.assign({}, DEFAULTS.ceilByPos, o.ceilByPos || {});
    return m;
  }

  // Price one projection. The multiplier is derived from the FIXED anchor, so
  // the same proj + pos always yields the same salary, round after round.
  function priceOne(proj, pos, o) {
    o = withDefaults(o);
    var p = Math.max(0, Number(proj) || 0);
    if (p <= 0) return pos === 'QB' ? o.backupQb : 0;   // only backup QBs get a floor
    var mult = o.anchorSal / Math.pow(o.anchorProj, o.exp);   // fixed, not per-round
    var raw  = Math.pow(p, o.exp) * mult;
    var ceil = (o.ceilByPos[pos] != null) ? o.ceilByPos[pos] : o.maxSalary;
    var sal  = Math.round(raw / o.round) * o.round;
    return Math.min(ceil, o.maxSalary, Math.max(o.minSalary, sal));
  }

  // Price a round's whole pool. `players` are the alive teams' projected players
  // ({id,name,pos,team,proj,status}). Returns the salary-sheet shape the draft
  // reads (players keyed by id) plus a flat list and meta.
  function priceRound(players, o) {
    o = withDefaults(o);
    var out = {}, list = [];
    (players || []).forEach(function (pl) {
      if (!pl || !pl.name || !pl.pos || !pl.id) return;
      var proj = Number(pl.proj) || 0;
      var sal;
      if (proj > 0) sal = priceOne(proj, pl.pos, o);
      else if (pl.pos === 'QB') sal = o.backupQb;   // keep backup QBs draftable
      else return;                                  // drop other unprojected players
      var rec = { id: pl.id, name: pl.name, pos: pl.pos, team: pl.team || '', proj: proj, salary: sal, status: pl.status || 'Active' };
      out[pl.id] = rec; list.push(rec);
    });
    return { players: out, list: list, meta: { count: list.length, scale: 'fixed', builtAt: Date.now() } };
  }

  // Is this round's pool big enough to field a legal lineup? The seasonal gate
  // uses fixed full-league counts (24 QB, 50 RB…) that a 2-8 team playoff field
  // can never meet, so the gate here is "enough to fill the roster" instead.
  function isDraftable(list, roster) {
    roster = roster || DEFAULT_ROSTER;
    var c = { QB: 0, RB: 0, WR: 0, TE: 0, DEF: 0 };
    (list || []).forEach(function (p) { if (c[p.pos] != null) c[p.pos]++; });
    var need = { QB: roster.qb, RB: roster.rb, WR: roster.wr, TE: roster.te, DEF: roster.def };
    var missing = [];
    ['QB', 'RB', 'WR', 'TE', 'DEF'].forEach(function (pos) { if (c[pos] < need[pos]) missing.push(pos); });
    // FLEX needs one more from RB/WR/TE beyond their base needs.
    var flexSurplus = (c.RB - need.RB) + (c.WR - need.WR) + (c.TE - need.TE);
    if (flexSurplus < (roster.flex || 0)) missing.push('FLEX');
    return { ok: missing.length === 0, missing: missing, counts: c };
  }

  var api = { priceOne: priceOne, priceRound: priceRound, isDraftable: isDraftable, DEFAULTS: DEFAULTS, DEFAULT_ROSTER: DEFAULT_ROSTER };
  root.FRPlayoffPricing = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
