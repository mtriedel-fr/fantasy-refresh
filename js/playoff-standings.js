// The Playoff Game standings — the payoff screen.
//
// Renders the cumulative leaderboard across the four rounds from the per-round
// score store (/leagues/{id}/season/{season}). The ranking is computed by
// js/playoff-scoring.js (cumulativeStandings — grouped by uid, tie-aware); this
// is the view on top. A mobile-friendly row per manager: rank + team + total,
// with the four round scores as a breakdown line. Pure (returns an HTML string),
// so it's testable and drops into the league page or a standalone view.
// UMD, depends on FRPlayoffScoring and (for round labels) FRPlayoffGame.
(function (root) {
  function dep(name) {
    if (root[name]) return root[name];
    if (typeof require !== 'undefined') { try { return require('./' + fileFor(name)); } catch (e) {} }
    return null;
  }
  function fileFor(n) { return n === 'FRPlayoffScoring' ? 'playoff-scoring.js' : 'playoff-game.js'; }
  var FRPlayoffScoring = dep('FRPlayoffScoring');
  var FRPlayoffGame = dep('FRPlayoffGame');

  var FALLBACK_ROUNDS = [
    { index: 1, short: 'WC' }, { index: 2, short: 'DIV' }, { index: 3, short: 'CONF' }, { index: 4, short: 'SB' }
  ];
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pts(n) { return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2); }

  // roundsData: /season/{season} shape ({ "1": { uid: {score, team} }, … }).
  // opts: { rounds, myUid }. Returns the leaderboard HTML (empty-state aware).
  function renderBoard(roundsData, opts) {
    opts = opts || {};
    var maxRound = opts.rounds || 4;
    var rounds = (FRPlayoffGame && FRPlayoffGame.ROUNDS) || FALLBACK_ROUNDS;
    var board = FRPlayoffScoring ? FRPlayoffScoring.cumulativeStandings(roundsData, { rounds: maxRound }) : [];

    if (!board.length) {
      return '<div class="ps-empty" style="text-align:center;padding:40px 20px;color:var(--ink3);">'
        + '<div style="font-size:34px;margin-bottom:10px;">🏈</div>'
        + '<div style="font-family:var(--fd);font-weight:800;color:var(--ink2);">No scores yet</div>'
        + '<div style="font-size:13px;margin-top:4px;">The leaderboard fills in as the playoff rounds are scored.</div></div>';
    }

    var rows = board.map(function (row) {
      var mine = opts.myUid && row.uid === opts.myUid;
      var leader = row.rank === 1;
      var breakdown = rounds.map(function (r) {
        var v = row.rounds[r.index];
        return '<span style="white-space:nowrap;">' + r.short + ' <b style="color:var(--ink2);font-weight:700;">' + (v == null ? '—' : pts(v)) + '</b></span>';
      }).join('<span style="color:var(--ink3);"> · </span>');
      return '<div class="ps-row" style="display:flex;align-items:center;gap:10px;padding:11px 12px;border-bottom:1px solid var(--bdr);'
        + (mine ? 'background:rgba(0,229,212,.06);' : '') + '">'
        + '<div style="flex:0 0 26px;text-align:center;font-family:var(--fd);font-weight:900;font-size:15px;color:' + (leader ? 'var(--gold)' : 'var(--ink3)') + ';">' + row.rank + '</div>'
        + '<div style="flex:1;min-width:0;">'
        +   '<div style="font-weight:700;font-size:14px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (leader ? '👑 ' : '') + esc(row.team || 'Team') + '</div>'
        +   '<div style="font-family:var(--fd);font-size:10.5px;color:var(--ink3);margin-top:2px;">' + breakdown + '</div>'
        + '</div>'
        + '<div style="flex:0 0 auto;text-align:right;font-family:var(--fd);font-weight:900;font-size:17px;color:var(--or);">' + pts(row.total) + '</div>'
        + '</div>';
    }).join('');

    return '<div class="ps-board" style="background:var(--bg2);border:1px solid var(--bdr);border-radius:12px;overflow:hidden;">'
      + '<div style="display:flex;align-items:baseline;justify-content:space-between;padding:10px 12px;background:var(--bg3);border-bottom:1px solid var(--bdr);">'
      +   '<span style="font-family:var(--fd);font-weight:800;font-size:12px;color:var(--ink2);text-transform:uppercase;letter-spacing:.5px;">Standings</span>'
      +   '<span style="font-family:var(--fd);font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;">Total points</span>'
      + '</div>' + rows + '</div>';
  }

  var api = { renderBoard: renderBoard };
  root.FRPlayoffStandings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
