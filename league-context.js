// Fantasy Refresh — League Context System
// Loaded by all pages. Provides league-aware Firebase path builders.
// Include in each HTML page: <script src="league-context.js"></script>

(function(global) {

  // ── CONSTANTS ───────────────────────────────────────────────
  var FB_DB_URL  = 'https://fantasy-refresh-default-rtdb.firebaseio.com';
  var FR_SEASON  = '2026';
  var DEFAULT_LEAGUE_ID = 'fr_refresh26';

  // ── LEAGUE CONTEXT ──────────────────────────────────────────
  var _ctx = null;

  function loadContext() {
    if (_ctx) return _ctx;
    try {
      var raw = localStorage.getItem('fr_league_ctx');
      if (raw) { _ctx = JSON.parse(raw); return _ctx; }
    } catch(e) {}
    _ctx = {
      leagueId:   DEFAULT_LEAGUE_ID,
      leagueName: "OG King/Queen of the Hill '26",
      season:     2026,
      format:     'cumulative',
      guillotine: false,
      role:       'member'
    };
    return _ctx;
  }

  function saveContext(ctx) {
    _ctx = ctx;
    try { localStorage.setItem('fr_league_ctx', JSON.stringify(ctx)); } catch(e) {}
  }

  function clearContext() {
    _ctx = null;
    try { localStorage.removeItem('fr_league_ctx'); } catch(e) {}
  }

  // ── PATH BUILDERS ───────────────────────────────────────────
  function ctx() { return loadContext(); }

  var paths = {
    league:         function()       { return '/leagues/' + ctx().leagueId; },
    settings:       function()       { return paths.league() + '/settings'; },
    commissioners:  function()       { return paths.league() + '/settings/commissioners'; },
    commissioner:   function(uid)    { return paths.commissioners() + '/' + uid; },
    members:        function()       { return paths.league() + '/members'; },
    member:         function(uid)    { return paths.members() + '/' + uid; },
    season:         function()       { return paths.league() + '/season/' + ctx().season; },
    week:           function(w)      { return paths.season() + '/' + w; },
    weekEntry:      function(w, uid) { return paths.week(w) + '/' + uid; },
    seasonMeta:     function()       { return paths.season() + '/meta'; },
    lineups:        function()       { return paths.league() + '/lineups/' + ctx().season; },
    weekLineups:    function(w)      { return paths.lineups() + '/week' + w; },
    myLineup:       function(w, uid) { return paths.weekLineups(w) + '/' + uid; },
    salaries:       function()       { return paths.league() + '/salaries/' + ctx().season; },
    weekSalaries:   function(w)      { return paths.salaries() + '/week' + w; },
    locks:          function()       { return paths.league() + '/locks/' + ctx().season; },
    weekLocks:      function(w)      { return paths.locks() + '/week' + w; },
    locksMeta:      function()       { return paths.locks() + '/meta'; },
    matchups:       function()       { return paths.league() + '/matchups/' + ctx().season; },
    weekMatchups:   function(w)      { return paths.matchups() + '/week' + w; },
    reactions:      function()       { return paths.league() + '/reactions/' + ctx().season; },
    chat:           function()       { return paths.league() + '/chat/' + ctx().season; },
    weekReactions:  function(w)      { return paths.reactions() + '/' + w; },
    playerPool:     function()       { return '/playerPool/' + ctx().season; },
    players:        function()       { return paths.playerPool() + '/players'; },
    user:           function(uid)    { return '/users/' + uid; },
    preseason:      function()       { return paths.league() + '/season/preseason'; },
    preSeasonSal:   function(w)      { return paths.league() + '/salaries/preseason/week' + w; },
    preSeasonLin:   function(w)      { return paths.league() + '/lineups/preseason/week' + w; },
    preSeasonLocks: function(w)      { return paths.league() + '/locks/preseason/week' + w; },
    url:            function(p)      { return FB_DB_URL + p + '.json'; }
  };

  // ── TOKEN HELPER ────────────────────────────────────────────
  // Gets auth token from FRAuth if available, returns null otherwise
  function getToken() {
    try {
      if (typeof FRAuth !== 'undefined' && FRAuth.ensureToken) {
        return FRAuth.ensureToken();
      }
    } catch(e) {}
    return Promise.resolve(null);
  }

  // Appends ?auth=token to URL if token available
  function authUrl(path, token) {
    var url = FB_DB_URL + path + '.json';
    if (token) url += '?auth=' + token;
    return url;
  }

  // ── FIREBASE HELPERS ────────────────────────────────────────
  var fb = {
    // GET — no auth needed (public rules)
    get: function(path) {
      return fetch(FB_DB_URL + path + '.json')
        .then(function(r) { return r.json(); });
    },

    // PUT — authenticated write
    put: function(path, data) {
      return getToken().then(function(token) {
        return fetch(authUrl(path, token), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function(r) { return r.json(); });
      });
    },

    // PATCH — authenticated write
    patch: function(path, data) {
      return getToken().then(function(token) {
        return fetch(authUrl(path, token), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function(r) { return r.json(); });
      });
    },

    // DELETE — authenticated write
    delete: function(path) {
      return getToken().then(function(token) {
        return fetch(authUrl(path, token), {
          method: 'DELETE'
        }).then(function(r) { return r.json(); });
      });
    },

    // GET the shared player pool, but skip the (large) download entirely if
    // a cached copy already matches the pool's own `updated` timestamp.
    // The pool only changes when "Refresh Player Pool" runs (or, going
    // forward, the Wednesday weekly-prep automation) — usually once a week —
    // so most page loads can now skip re-downloading ~1,500-3,000 player
    // records and just confirm nothing changed.
    getPlayerPool: function() {
      var season = ctx().season;
      var cacheKey = 'fr_pool_cache_' + season;
      return fetch(FB_DB_URL + '/playerPool/' + season + '/updated.json')
        .then(function(r) { return r.json(); })
        .then(function(updated) {
          try {
            var cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
            if (cached && cached.updated === updated && cached.players) {
              return cached.players;
            }
          } catch (e) { /* corrupt cache entry — fall through to a real fetch */ }
          return fetch(FB_DB_URL + paths.players() + '.json')
            .then(function(r) { return r.json(); })
            .then(function(players) {
              try {
                localStorage.setItem(cacheKey, JSON.stringify({ updated: updated, players: players }));
              } catch (e) { /* localStorage full/unavailable — caching is best-effort, not required */ }
              return players;
            });
        })
        .catch(function() {
          // If even the timestamp check fails (offline, etc.), fall back to
          // the old uncached behavior rather than failing the page entirely.
          return fetch(FB_DB_URL + paths.players() + '.json').then(function(r) { return r.json(); });
        });
    }
  };

  // ── SHARED ERROR HANDLER ───────────────────────────────────
  // A lot of .catch() blocks across the app silently swallow failures —
  // no console log, no toast, nothing visible to the user or to you.
  // This is a drop-in replacement: logs to console (so it's debuggable)
  // and shows a toast IF the page already defines one (every page has its
  // own showToast() with slightly different styling, so this calls
  // whichever one is already in scope rather than forcing a single style).
  function handleError(err, label) {
    var msg = label ? (label + ': ' + (err && err.message ? err.message : err)) : (err && err.message ? err.message : String(err));
    console.error('[FR]', msg, err);
    try {
      if (typeof showToast === 'function') {
        showToast(label || 'Something went wrong — please try again', true);
      }
    } catch (e) { /* showToast itself failing shouldn't throw past this point */ }
  }


  // ── COMMISSIONER CHECK ──────────────────────────────────────
  function checkCommissionerStatus(uid) {
    if (!uid) return Promise.resolve({ isComm: false, isCreator: false });
    return Promise.all([
      fb.get(paths.commissioner(uid)),
      fb.get(paths.settings())
    ]).then(function(results) {
      var commVal   = results[0];
      var settings  = results[1];
      var isComm    = commVal === true;
      var isCreator = settings && settings.createdBy === uid;
      return { isComm: isComm || isCreator, isCreator: isCreator };
    }).catch(function() {
      return { isComm: false, isCreator: false };
    });
  }

  function isCommissioner(uid) {
    return checkCommissionerStatus(uid).then(function(s) { return s.isComm; });
  }

  // ── ADD / REMOVE CO-COMMISSIONER ───────────────────────────
  function addCoCommissioner(targetUid) {
    return fb.put(paths.commissioner(targetUid), true);
  }

  function removeCoCommissioner(targetUid) {
    return fb.delete(paths.commissioner(targetUid));
  }

  // ── LEAGUE LOADER ───────────────────────────────────────────
  function loadLeagueSettings(leagueId) {
    var id = leagueId || ctx().leagueId;
    return fb.get('/leagues/' + id + '/settings')
      .then(function(settings) {
        if (!settings) throw new Error('League not found: ' + id);
        var current = loadContext();
        saveContext(Object.assign({}, current, {
          leagueId:   settings.leagueId   || id,
          leagueName: settings.name       || "OG King/Queen of the Hill '26",
          season:     settings.season     || 2026,
          format:     settings.format     || 'cumulative',
          guillotine: settings.guillotine || false,
          cap:        settings.cap        || 60000,
          maxSalary:  settings.maxSalary  || 11300,
          minSalary:  settings.minSalary  || 3700,
          joinCode:   settings.joinCode   || ''
        }));
        return settings;
      });
  }

  // ── USER LEAGUE LIST ────────────────────────────────────────
  function getUserLeagues(uid) {
    return fb.get('/users/' + uid)
      .then(function(profile) {
        if (!profile || !profile.leagues) return [];
        return Object.entries(profile.leagues).map(function(entry) {
          return Object.assign({ leagueId: entry[0] }, entry[1]);
        });
      });
  }

  // ── SWITCH LEAGUE ───────────────────────────────────────────
  function switchLeague(leagueId) {
    return loadLeagueSettings(leagueId).then(function(settings) {
      var user = null;
      try {
        if (typeof FRAuth !== 'undefined') {
          user = FRAuth.getUser();
        } else {
          user = JSON.parse(localStorage.getItem('fr_user_' + FR_SEASON));
        }
      } catch(e) {}
      if (user && user.uid) {
        return fb.get('/leagues/' + leagueId + '/members/' + user.uid)
          .then(function(member) {
            var current = loadContext();
            saveContext(Object.assign({}, current, {
              teamName: member ? member.teamName : ''
            }));
            return settings;
          });
      }
      return settings;
    });
  }

  // ── EXPOSE GLOBAL ───────────────────────────────────────────
  global.FR = {
    ctx:                     loadContext,
    saveContext:             saveContext,
    clearContext:            clearContext,
    paths:                   paths,
    fb:                      fb,
    handleError:             handleError,
    loadLeagueSettings:      loadLeagueSettings,
    getUserLeagues:          getUserLeagues,
    switchLeague:            switchLeague,
    isCommissioner:          isCommissioner,
    checkCommissionerStatus: checkCommissionerStatus,
    addCoCommissioner:       addCoCommissioner,
    removeCoCommissioner:    removeCoCommissioner,
    FB_DB_URL:               FB_DB_URL,
    FR_SEASON:               FR_SEASON,
    DEFAULT_LEAGUE_ID:       DEFAULT_LEAGUE_ID
  };

})(window);
