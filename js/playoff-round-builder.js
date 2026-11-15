// The Playoff Game round builder (pure logic).
//
// Turns "which teams are alive this round" + the players' projections into a
// priced salary sheet for the round — the thing the draft reads. The scheduled
// round-opening job is a thin wrapper around this: fetch the round's matchups
// and projections (Sleeper + Tank01, same sources as the weekly job), call
// buildRoundSheet, and write the result — refusing to overwrite an open round.
//
// The shrinking playoff field is the whole difference from the season: only
// players on teams PLAYING this round are included, so top seeds on a Wild Card
// bye (and every eliminated team) simply drop out until the pool is the two
// Super Bowl teams. Pricing is delegated to the fixed-scale pricer
// (js/playoff-pricing.js), so a star costs the same every round.
//
// league-agnostic: no league id anywhere. The job derives the round's teams and
// projections once from the shared NFL data and can build a sheet for every
// active playoff league from the same inputs — so it scales to many leagues
// without extra data-source calls. UMD, same shape as the other playoff modules.
(function (root) {
  var FRPlayoffPricing = root.FRPlayoffPricing;
  if (!FRPlayoffPricing && typeof require !== 'undefined') {
    try { FRPlayoffPricing = require('./playoff-pricing.js'); } catch (e) { /* browser load-order */ }
  }

  // Normalize a team abbreviation for matching. Tank01/Sleeper disagree on a few
  // (JAC/JAX, WAS/WSH, LA/LAR); fold the known variants so a player isn't
  // dropped from their own team's round.
  var TEAM_ALIASES = { JAX: 'JAC', WSH: 'WAS', LAR: 'LA', OAK: 'LV', SD: 'LAC', STL: 'LA' };
  function normTeam(t) {
    if (!t) return '';
    var u = String(t).trim().toUpperCase();
    return TEAM_ALIASES[u] || u;
  }

  // The set of teams playing in a round, from its matchups. Each game has home +
  // away (abbreviations). Returns a deduped, normalized array.
  function teamsInGames(games) {
    var seen = {}, out = [];
    (games || []).forEach(function (g) {
      [g && g.home, g && g.away].forEach(function (t) {
        var n = normTeam(t);
        if (n && !seen[n]) { seen[n] = true; out.push(n); }
      });
    });
    return out;
  }

  // Build a round's priced sheet. `round` is 1-4; `games` are the round's
  // matchups (to derive alive teams); `players` are the projected players
  // ({id,name,pos,team,proj,status}); `opts` passes pricing config through.
  // Returns the salary-sheet shape the draft reads plus a draftability flag.
  function buildRoundSheet(round, games, players, opts) {
    var alive = teamsInGames(games);
    var aliveSet = {};
    alive.forEach(function (t) { aliveSet[t] = true; });

    // Only players on teams playing this round — the shrinking field.
    var inRound = (players || []).filter(function (p) {
      return p && p.pos && aliveSet[normTeam(p.team)];
    });

    var priced = FRPlayoffPricing
      ? FRPlayoffPricing.priceRound(inRound, opts)
      : { players: {}, list: inRound.slice(), meta: { count: inRound.length } };
    var draft = FRPlayoffPricing ? FRPlayoffPricing.isDraftable(priced.list, opts && opts.roster) : { ok: true, missing: [] };

    priced.meta = priced.meta || {};
    priced.meta.round = round;
    priced.meta.teams = alive;
    priced.meta.draftable = draft.ok;
    return {
      round: round,
      teams: alive,
      players: priced.players,  // keyed by id — written to salaries/week{round}
      list: priced.list,
      meta: priced.meta,
      draftable: draft.ok,       // the round-opening job gates on this
      missing: draft.missing     // which positions are short, if any
    };
  }

  var api = { buildRoundSheet: buildRoundSheet, teamsInGames: teamsInGames, normTeam: normTeam, TEAM_ALIASES: TEAM_ALIASES };
  root.FRPlayoffRoundBuilder = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
