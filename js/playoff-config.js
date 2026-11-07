// Shared cumulative-league playoff config.
//
// For a long time the tier-playoff timing lived as hardcoded constants that
// had to be kept identical in league.html AND playoffs.html (TIER_LOCK_WEEK /
// PLAYOFF_WEEKS). This is the single source of truth instead: both pages read
// it, and it's driven per league by the saved settings/context.
//
// A cumulative ("Points Race") league either runs tier playoffs or doesn't.
// When it does, the regular season ends after `tierLockWeek`; the cumulative
// standings through that week lock into 3 tiers, and the next 3 weeks are the
// playoff rounds. Only the lock week is configurable — the renderer is built
// around exactly 3 tiers and 3 rounds (see league.html / playoffs.html).
//
// `cfg` is a settings object or a league context (both carry playoffFormat,
// tierLockWeek and format). `season` picks up the one historical exception.
(function (root) {
  var DEFAULT_LOCK = 14;   // the original league: tiers lock after Week 14
  var TIER_COUNT   = 3;    // fixed — the bracket UI is built for 3 tiers

  function mk(format, lock, tierCount) {
    var on = format === 'tiers' && !!lock;
    return {
      enabled:   on,
      format:    format,                 // 'tiers' | 'none'
      lockWeek:  on ? lock : null,       // last regular-season week
      tierCount: tierCount || TIER_COUNT,
      weeks:     on ? [lock + 1, lock + 2, lock + 3] : []  // the 3 playoff rounds
    };
  }

  function config(cfg, season) {
    cfg = cfg || {};
    season = season == null ? '2026' : String(season);

    // Historical exception: 2025 ran an 18-week schedule, so tiers locked
    // after Week 15 and the playoffs were Weeks 16-18. Archive views pass
    // season='2025' and must keep that regardless of today's settings.
    if (season === '2025') return mk('tiers', 15, cfg.tierCount || TIER_COUNT);

    var fmt = cfg.playoffFormat;
    if (fmt == null) {
      // Legacy leagues saved no playoff setting. Every cumulative league was a
      // tier-playoff league; anything else (H2H) runs its own seeded bracket
      // and never uses this. An empty/unknown context defaults to tiers so the
      // original league is unchanged even from a stale cached context.
      fmt = (cfg.format === 'cumulative' || cfg.format == null) ? 'tiers' : 'none';
    }
    if (fmt !== 'tiers') return mk('none', null, cfg.tierCount || TIER_COUNT);

    var lock = parseInt(cfg.tierLockWeek, 10);
    if (!lock || lock < 1 || lock > 20) lock = DEFAULT_LOCK;
    return mk('tiers', lock, cfg.tierCount || TIER_COUNT);
  }

  var api = { config: config, DEFAULT_LOCK: DEFAULT_LOCK };
  root.FRPlayoffs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
