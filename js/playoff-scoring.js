// The Playoff Game scoring add-ons (pure logic).
//
// Scoring for a playoff league is the EXACT same DraftKings scoring as the
// regular season (calcDKPoints in auto-scoring.yml) PLUS the yardage bonuses,
// which the season deliberately leaves off. To avoid the scoring drift the
// codebase has been bitten by before (the same calc must match across the
// workflow, the Worker and the draft card), this module does NOT reimplement
// calcDKPoints — it computes only the BONUS DELTA, which the scorer adds on top
// of the base points. Base points stay the single source of truth in
// calcDKPoints; this is purely additive.
//
// It also computes the cumulative leaderboard — the sum of a manager's score
// across the four rounds, grouped by uid (never team name; renames must not
// split a team), which is how the Playoff Game is won.
//
// Thresholds + points come from the league's stored config
// (settings.playoffGame.scoring.bonuses), e.g. 350+ passing, 150+ rushing,
// 150+ receiving yards → +3 each. UMD, same shape as the other playoff modules.
(function (root) {
  var DEFAULT_ROUNDS = 4;

  // The yardage-bonus points for one player's box-score line. `stats` is the
  // Tank01 box-score object (nested Passing/Rushing/Receiving, same as
  // calcDKPoints reads); `scoring` is settings.playoffGame.scoring. Returns the
  // delta to ADD to the base DK points, plus breakdown rows for the player card.
  function bonusPoints(stats, scoring) {
    var out = { pts: 0, breakdown: [] };
    if (!stats || !scoring || !scoring.bonuses) return out;
    var b = scoring.bonuses;
    var pass = stats.Passing || {}, rush = stats.Rushing || {}, recv = stats.Receiving || {};
    function award(kind, yardsRaw, cfg) {
      if (!cfg) return;
      var yards = parseFloat(yardsRaw) || 0;
      var thr = parseFloat(cfg.yards);
      var pts = parseFloat(cfg.points) || 0;
      if (!(thr > 0) || !pts || yards < thr) return;
      out.pts += pts;
      out.breakdown.push({ label: thr + '+ ' + kind + ' Yds Bonus', stat: Math.round(yards) + ' yds', points: pts });
    }
    award('Pass', pass.passYds, b.pass);
    award('Rush', rush.rushYds, b.rush);
    award('Rec',  recv.recYds,  b.rec);
    out.pts = Math.round(out.pts * 100) / 100;
    return out;
  }

  // Cumulative leaderboard across the playoff rounds. `roundsData` is the
  // per-round uid-keyed score store for a playoff league — the exact shape of
  // /leagues/{id}/season/{season} ({ "1": { uid: {score, team}, … }, "2": …}).
  // Returns rows sorted by total desc, grouped by uid, with per-round scores and
  // a tie-aware rank. Missing round = not yet played (counts as 0).
  function cumulativeStandings(roundsData, opts) {
    opts = opts || {};
    var maxRound = opts.rounds || DEFAULT_ROUNDS;
    var byUid = {};
    Object.keys(roundsData || {}).forEach(function (rk) {
      var ri = parseInt(rk, 10);
      if (!ri || ri < 1 || ri > maxRound) return;
      var round = roundsData[rk] || {};
      Object.keys(round).forEach(function (uid) {
        var cell = round[uid];
        var sc = parseFloat(cell && cell.score != null ? cell.score : cell) || 0;
        if (!byUid[uid]) byUid[uid] = { uid: uid, team: '', rounds: {}, total: 0 };
        byUid[uid].rounds[ri] = Math.round(sc * 100) / 100;
        if (cell && cell.team) byUid[uid].team = cell.team;
      });
    });
    var rows = Object.keys(byUid).map(function (uid) {
      var e = byUid[uid], t = 0;
      for (var r in e.rounds) t += e.rounds[r];
      e.total = Math.round(t * 100) / 100;
      return e;
    });
    rows.sort(function (a, b) { return (b.total - a.total) || a.uid.localeCompare(b.uid); });
    var rank = 0, prev = null, seen = 0;
    rows.forEach(function (row) {
      seen++;
      if (prev === null || row.total < prev) { rank = seen; prev = row.total; }
      row.rank = rank;
    });
    return rows;
  }

  var api = { bonusPoints: bonusPoints, cumulativeStandings: cumulativeStandings, DEFAULT_ROUNDS: DEFAULT_ROUNDS };
  root.FRPlayoffScoring = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
