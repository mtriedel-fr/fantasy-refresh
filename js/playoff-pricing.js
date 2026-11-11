// The Playoff Game round-pricing engine (pure logic).
//
// Each playoff round is priced from the projections of the players on the teams
// STILL ALIVE that round. The pool shrinks every round (Wild Card ~12-14 teams
// → Divisional 8 → Conference 4 → Super Bowl 2), so a fresh sheet is built each
// round — BUT the price scale is deliberately FIXED, not rescaled to the round's
// field: a given projection maps to the same salary in every round.
//
// This is the whole point of the budget game. If prices were rescaled to each
// round's (smaller, stronger) field, a full roster would always cost about the
// same slice of your budget and there'd be no reason to save early. With a fixed
// scale, a star costs the same in the Wild Card and the Super Bowl, so money you
// bank early genuinely buys more later.
//
// The curve is the SAME as the regular-season salary engine
// (.github/workflows/weekly-auto-open.yml) — the same per-position exponents,
// premiums, clamps, $100 rounding and base-rate construction — so playoff prices
// look and feel like the regular season. The ONE change: the season anchors the
// multiplier to each WEEK's top projections (relative to the field); here the
// anchor is FIXED reference projections (`ref` per position), so the multiplier
// never drifts round to round. That single change is what preserves budgeting.
//
// UMD (window global + CommonJS), same shape as the other playoff modules.
(function (root) {
  // Mirrors the seasonal engine's constants + POSITIONS, with a fixed `ref`
  // projection per position in place of the week's live maximum.
  var DEFAULTS = {
    topAnchorExp: 0.6,     // SHARED cross-position rate exponent (seasonal: TOP_ANCHOR_EXP)
    sharedCap:    9000,    // base-rate anchor + QB/TE/DEF clamp (seasonal: SHARED_CAP)
    salMax:       9600,    // global salary ceiling (seasonal: SAL_MAX_DEFAULT)
    salaryFloor:  2000,    // global salary floor (seasonal: SALARY_FLOOR)
    minSanity:    100,     // per-position lower clamp before the floor (seasonal: MIN_SANITY)
    salRound:     100,     // round to the nearest $100 (seasonal: SAL_ROUND)
    backupQb:     3800,    // floor for a QB with no projection (seasonal: BACKUP_QB_SALARY)
    refGlobal:    27,      // fixed stand-in for the week's global max projection
    // Per-position curve — exp/premium/clamp are the seasonal POSITIONS values
    // verbatim; `ref` is a fixed elite projection (a typical weekly top) so the
    // multiplier is constant across rounds.
    positions: {
      QB:  { exp: 1.3,  premium: 1.0,   clamp: 9000, ref: 27 },
      RB:  { exp: 0.55, premium: 1.068, clamp: 9600, ref: 24 },
      WR:  { exp: 0.55, premium: 1.12,  clamp: 9600, ref: 24 },
      TE:  { exp: 0.7,  premium: 1.21,  clamp: 9000, ref: 17 },
      DEF: { exp: 0.6,  premium: 0.97,  clamp: 9000, ref: 13 }
    }
  };
  var DEFAULT_ROSTER = { qb: 1, rb: 2, wr: 3, te: 1, flex: 1, def: 1 };

  function withDefaults(o) {
    o = o || {};
    var m = {};
    for (var k in DEFAULTS) if (k !== 'positions') m[k] = (o[k] != null) ? o[k] : DEFAULTS[k];
    m.positions = {};
    for (var pos in DEFAULTS.positions) {
      m.positions[pos] = Object.assign({}, DEFAULTS.positions[pos], (o.positions && o.positions[pos]) || {});
    }
    return m;
  }

  // Build the fixed per-position multipliers once (identical construction to the
  // seasonal engine, but off the fixed `ref` projections, not the week's max).
  function buildScale(o) {
    o = withDefaults(o);
    var baseRate = o.sharedCap / Math.pow(o.refGlobal, o.topAnchorExp);
    var mult = {};
    for (var pos in o.positions) {
      var c = o.positions[pos];
      var topAnchor = Math.min(Math.pow(c.ref, o.topAnchorExp) * baseRate * c.premium, c.clamp);
      mult[pos] = topAnchor / Math.pow(c.ref, c.exp);
    }
    return { o: o, mult: mult };
  }

  // Price one projection. Accepts either options or a prebuilt scale (from
  // buildScale). The multiplier is fixed, so the same proj+pos is always the
  // same salary, round after round.
  function priceOne(proj, pos, scaleOrOpts) {
    var s = (scaleOrOpts && scaleOrOpts.mult) ? scaleOrOpts : buildScale(scaleOrOpts);
    var o = s.o, c = o.positions[pos];
    var p = Math.max(0, Number(proj) || 0);
    if (p <= 0) return pos === 'QB' ? o.backupQb : 0;   // only backup QBs get a floor
    if (!c) return 0;
    var sal = Math.ceil((Math.pow(p, c.exp) * s.mult[pos]) / o.salRound) * o.salRound;
    sal = Math.max(o.minSanity, Math.min(c.clamp, sal));
    sal = Math.max(o.salaryFloor, Math.min(o.salMax, sal));
    return sal;
  }

  // Price a round's whole pool (the alive teams' projected players). Returns the
  // salary-sheet shape the draft reads (players keyed by id) plus a flat list
  // and meta. Builds the fixed scale once.
  function priceRound(players, opts) {
    var scale = buildScale(opts);
    var o = scale.o, out = {}, list = [];
    (players || []).forEach(function (pl) {
      if (!pl || !pl.name || !pl.pos || !pl.id) return;
      var proj = Number(pl.proj) || 0;
      var sal;
      if (proj > 0) sal = priceOne(proj, pl.pos, scale);
      else if (pl.pos === 'QB') sal = o.backupQb;   // keep backup QBs draftable
      else return;                                  // drop other unprojected players
      var rec = { id: pl.id, name: pl.name, pos: pl.pos, team: pl.team || '', proj: Math.round(proj * 10) / 10, salary: sal, status: pl.status || 'Active' };
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
    var flexSurplus = (c.RB - need.RB) + (c.WR - need.WR) + (c.TE - need.TE);
    if (flexSurplus < (roster.flex || 0)) missing.push('FLEX');
    return { ok: missing.length === 0, missing: missing, counts: c };
  }

  var api = {
    priceOne: priceOne, priceRound: priceRound, isDraftable: isDraftable,
    buildScale: buildScale, DEFAULTS: DEFAULTS, DEFAULT_ROSTER: DEFAULT_ROSTER
  };
  root.FRPlayoffPricing = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
