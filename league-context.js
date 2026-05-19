// Fantasy Refresh — League Context System
// Loaded by all pages. Provides league-aware Firebase path builders.
// Include in each HTML page: <script src="league-context.js"></script>

(function(global) {

  // ── CONSTANTS ───────────────────────────────────────────────
  var FB_DB_URL  = 'https://fantasy-refresh-default-rtdb.firebaseio.com';
  var FR_SEASON  = '2026';
  var DEFAULT_LEAGUE_ID = 'fr_refresh26'; // 2026 legacy league

  // ── LEAGUE CONTEXT ──────────────────────────────────────────
  // Loaded from localStorage, set at login or league switch
  var _ctx = null;

  function loadContext() {
    if (_ctx) return _ctx;
    try {
      var raw = localStorage.getItem('fr_league_ctx');
      if (raw) { _ctx = JSON.parse(raw); return _ctx; }
    } catch(e) {}
    // Default to 2026 league if nothing stored
    _ctx = {
      leagueId:   DEFAULT_LEAGUE_ID,
      leagueName: 'Fantasy Refresh 2026',
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
    // League root
    league:        function()       { return '/leagues/' + ctx().leagueId; },
    settings:      function()       { return paths.league() + '/settings'; },
    members:       function()       { return paths.league() + '/members'; },
    member:        function(uid)    { return paths.members() + '/' + uid; },

    // Season data
    season:        function()       { return paths.league() + '/season/' + ctx().season; },
    week:          function(w)      { return paths.season() + '/' + w; },
    weekEntry:     function(w, uid) { return paths.week(w) + '/' + uid; },
    seasonMeta:    function()       { return paths.season() + '/meta'; },

    // Lineups
    lineups:       function()       { return paths.league() + '/lineups/' + ctx().season; },
    weekLineups:   function(w)      { return paths.lineups() + '/week' + w; },
    myLineup:      function(w, uid) { return paths.weekLineups(w) + '/' + uid; },

    // Salaries
    salaries:      function()       { return paths.league() + '/salaries/' + ctx().season; },
    weekSalaries:  function(w)      { return paths.salaries() + '/week' + w; },

    // Locks
    locks:         function()       { return paths.league() + '/locks/' + ctx().season; },
    weekLocks:     function(w)      { return paths.locks() + '/week' + w; },
    locksMeta:     function()       { return paths.locks() + '/meta'; },

    // Matchups (H2H)
    matchups:      function()       { return paths.league() + '/matchups/' + ctx().season; },
    weekMatchups:  function(w)      { return paths.matchups() + '/week' + w; },

    // Reactions
    reactions:     function()       { return paths.league() + '/reactions/' + ctx().season; },
    weekReactions: function(w)      { return paths.reactions() + '/' + w; },

    // Global (shared across leagues)
    playerPool:    function()       { return '/playerPool/' + ctx().season; },
    players:       function()       { return paths.playerPool() + '/players'; },
    user:          function(uid)    { return '/users/' + uid; },

    // Preseason
    preseason:     function()       { return paths.league() + '/season/preseason'; },
    preSeasonSal:  function(w)      { return paths.league() + '/salaries/preseason/week' + w; },
    preSeasonLin:  function(w)      { return paths.league() + '/lineups/preseason/week' + w; },
    preSeasonLocks:function(w)      { return paths.league() + '/locks/preseason/week' + w; },

    // Firebase REST URLs (append .json)
    url:           function(p)      { return FB_DB_URL + p + '.json'; }
  };

  // ── FIREBASE HELPERS ────────────────────────────────────────
  var fb = {
    get: function(path) {
      return fetch(FB_DB_URL + path + '.json')
        .then(function(r) { return r.json(); });
    },
    put: function(path, data) {
      return fetch(FB_DB_URL + path + '.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function(r) { return r.json(); });
    },
    patch: function(path, data) {
      return fetch(FB_DB_URL + path + '.json', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function(r) { return r.json(); });
    },
    delete: function(path) {
      return fetch(FB_DB_URL + path + '.json', { method: 'DELETE' })
        .then(function(r) { return r.json(); });
    }
  };

  // ── LEAGUE LOADER ───────────────────────────────────────────
  // Call at app boot to load league settings from Firebase
  function loadLeagueSettings(leagueId) {
    var id = leagueId || ctx().leagueId;
    return fb.get('/leagues/' + id + '/settings')
      .then(function(settings) {
        if (!settings) throw new Error('League not found: ' + id);
        var current = loadContext();
        saveContext(Object.assign({}, current, {
          leagueId:   settings.leagueId,
          leagueName: settings.name,
          season:     settings.season,
          format:     settings.format,
          guillotine: settings.guillotine,
          cap:        settings.cap,
          maxSalary:  settings.maxSalary,
          minSalary:  settings.minSalary,
          joinCode:   settings.joinCode
        }));
        return settings;
      });
  }

  // ── USER LEAGUE LIST ────────────────────────────────────────
  // Returns all leagues a user is in
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
      // Get user's team name in this league
      var user = null;
      try { user = JSON.parse(localStorage.getItem('fr_user_' + FR_SEASON)); } catch(e) {}
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

  // ── IS COMMISSIONER ─────────────────────────────────────────
  function isCommissioner(uid) {
    return fb.get('/leagues/' + ctx().leagueId + '/settings')
      .then(function(settings) {
        var comms = settings && settings.commissioners || [];
        return comms.indexOf(uid) >= 0;
      });
  }

  // ── EXPOSE GLOBAL ───────────────────────────────────────────
  global.FR = {
    // Context
    ctx:                loadContext,
    saveContext:        saveContext,
    clearContext:       clearContext,

    // Path builders
    paths:              paths,

    // Firebase helpers
    fb:                 fb,

    // League management
    loadLeagueSettings: loadLeagueSettings,
    getUserLeagues:     getUserLeagues,
    switchLeague:       switchLeague,
    isCommissioner:     isCommissioner,

    // Constants
    FB_DB_URL:          FB_DB_URL,
    FR_SEASON:          FR_SEASON,
    DEFAULT_LEAGUE_ID:  DEFAULT_LEAGUE_ID
  };

})(window);
